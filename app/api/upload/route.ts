import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ingestDocument } from '@/lib/ingestion'

export const maxDuration = 60 // Vercel function timeout for embedding

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const workspaceId = formData.get('workspace_id') as string | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!workspaceId) return NextResponse.json({ error: 'No workspace_id' }, { status: 400 })

  // Verify workspace belongs to user (prevent IDOR)
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (!workspace) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  // Validate file type
  const allowedTypes = [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only .txt, .pdf, .docx files are supported' },
      { status: 400 }
    )
  }

  // Max 10MB
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const result = await ingestDocument(buffer, file.name, file.type, workspaceId)

  return NextResponse.json({
    document_id: result.document_id,
    chunk_count: result.chunk_count,
    skipped: result.skipped,
    message: result.skipped
      ? 'Document already exists in this workspace — skipped ingestion'
      : `Ingested ${result.chunk_count} chunks`,
  })
}
