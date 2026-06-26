import crypto from 'crypto'
import { createServiceRoleClient } from './supabase/server'
import { chunkText, ingestChunks } from './rag'

// ─── Text extraction from uploaded file ──────────────────────────────────────

export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'text/plain') {
    return buffer.toString('utf-8')
  }

  if (mimeType === 'application/pdf') {
    const { extractText: pdfExtract } = await import('unpdf')
    const pdf = await pdfExtract(new Uint8Array(buffer), { mergePages: true })
    return pdf.text
  }

  if (
    mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  throw new Error(`Unsupported file type: ${mimeType}`)
}

// ─── Main ingestion pipeline ─────────────────────────────────────────────────

export async function ingestDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  workspaceId: string
): Promise<{ document_id: string; chunk_count: number; skipped: boolean }> {
  const supabase = createServiceRoleClient()

  // 1. SHA-256 hash for idempotency — same file never ingested twice
  const fileHash = crypto.createHash('sha256').update(buffer).digest('hex')

  // 2. Check if already ingested
  const { data: existing } = await supabase
    .from('documents')
    .select('id, chunk_count')
    .eq('workspace_id', workspaceId)
    .eq('file_hash', fileHash)
    .single()

  if (existing) {
    return {
      document_id: existing.id,
      chunk_count: existing.chunk_count,
      skipped: true,
    }
  }

  // 3. Extract text
  const text = await extractText(buffer, mimeType)
  if (!text.trim()) throw new Error('No text could be extracted from the file')

  // 4. Chunk text
  const chunks = chunkText(text)
  if (chunks.length === 0) throw new Error('File produced no chunks after splitting')

  // 5. Create document record
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({
      workspace_id: workspaceId,
      name: fileName,
      file_hash: fileHash,
      chunk_count: chunks.length,
    })
    .select()
    .single()

  if (docError) throw new Error(`Document insert failed: ${docError.message}`)

  // 6. Embed + store chunks
  await ingestChunks(chunks, doc.id, workspaceId)

  return { document_id: doc.id, chunk_count: chunks.length, skipped: false }
}

