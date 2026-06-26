import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { retrieveChunks, buildSystemPrompt } from '@/lib/rag'
import { chatModel } from '@/lib/gemini'
import { toolDeclarations, executeTool } from '@/lib/tools'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { question, workspace_id } = body

  if (!question?.trim()) return NextResponse.json({ error: 'No question' }, { status: 400 })
  if (!workspace_id) return NextResponse.json({ error: 'No workspace_id' }, { status: 400 })

  // Verify workspace ownership
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspace_id)
    .eq('user_id', user.id)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const serviceClient = createServiceRoleClient()

  // 1. Save user message
  await serviceClient.from('chat_messages').insert({
    workspace_id,
    role: 'user',
    content: question,
  })

  // 2. Retrieve relevant chunks (workspace-scoped — isolation enforced in SQL RPC)
  const chunks = await retrieveChunks(question, workspace_id, 5)

  // 3. Build system prompt with retrieved context
  const systemPrompt = buildSystemPrompt(chunks)

  // 4. Tool calling loop
  const toolCallLogs: Array<{
    tool_name: string
    args: Record<string, unknown>
    result: unknown
    status: string
  }> = []

  let finalText = ''

  // Gemini tool calling via generateContent with tools
  const model = chatModel

  // Initial call
  let response = await model.generateContent({
    systemInstruction: systemPrompt,
    contents: [{ role: 'user', parts: [{ text: question }] }],
    tools: [{ functionDeclarations: toolDeclarations }],
  })

  let candidate = response.response.candidates?.[0]
  let MAX_TOOL_TURNS = 5 // prevent infinite tool loops

  while (candidate && MAX_TOOL_TURNS-- > 0) {
    const parts = candidate.content?.parts ?? []
    const functionCallPart = parts.find((p) => p.functionCall)

    if (!functionCallPart?.functionCall) {
      // No tool call — extract final text
      finalText = parts
        .filter((p) => p.text)
        .map((p) => p.text)
        .join('')
      break
    }

    const { name: toolName, args: toolArgs } = functionCallPart.functionCall

    // 5. Validate + execute tool
    const { result, status } = await executeTool(
      toolName,
      toolArgs,
      workspace_id
    )

    // Log every tool call
    const logEntry = {
      workspace_id,
      tool_name: toolName,
      args: toolArgs as Record<string, unknown>,
      result,
      status,
    }
    await serviceClient.from('tool_call_log').insert(logEntry)
    toolCallLogs.push({ tool_name: toolName, args: toolArgs as Record<string, unknown>, result, status })

    // 6. Send tool result back to model
    response = await model.generateContent({
      systemInstruction: systemPrompt,
      contents: [
        { role: 'user', parts: [{ text: question }] },
        { role: 'model', parts: [{ functionCall: functionCallPart.functionCall }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: result.success
                  ? { result: result.data }
                  : { error: result.error },
              },
            },
          ],
        },
      ],
      tools: [{ functionDeclarations: toolDeclarations }],
    })

    candidate = response.response.candidates?.[0]
  }

  // Fallback if loop exhausted without text
  if (!finalText) {
    finalText = response.response.text?.() ?? 'I was unable to generate a response.'
  }

  // 7. Build citations from retrieved chunks
  const citations = chunks.map((c) => ({
    doc_name: c.doc_name,
    chunk_index: c.chunk_index,
    similarity: Math.round(c.similarity * 100) / 100,
  }))

  // 8. Save assistant message
  await serviceClient.from('chat_messages').insert({
    workspace_id,
    role: 'assistant',
    content: finalText,
    citations,
  })

  return NextResponse.json({
    answer: finalText,
    citations,
    tool_calls: toolCallLogs,
    chunks_used: chunks.length,
  })
}
