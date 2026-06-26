-- -- Run this entire file in Supabase SQL editor

-- -- Enable pgvector extension
-- CREATE EXTENSION IF NOT EXISTS vector;

-- -- Workspaces: one user can have many workspaces
-- CREATE TABLE IF NOT EXISTS workspaces (
--   id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--   name        text NOT NULL,
--   created_at  timestamptz DEFAULT now()
-- );

-- -- Documents: uploaded into a workspace
-- CREATE TABLE IF NOT EXISTS documents (
--   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
--   name         text NOT NULL,
--   file_hash    text NOT NULL,  -- SHA-256, used for idempotency
--   chunk_count  integer DEFAULT 0,
--   created_at   timestamptz DEFAULT now(),
--   UNIQUE (workspace_id, file_hash)
-- );

-- -- SINGLE shared vector table — isolation via workspace_id in queries
-- CREATE TABLE IF NOT EXISTS document_chunks (
--   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
--   document_id  uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
--   content      text NOT NULL,
--   embedding    vector(768) NOT NULL,
--   chunk_index  integer NOT NULL,
--   created_at   timestamptz DEFAULT now()
-- );

-- -- Tasks saved by the AI tool
-- CREATE TABLE IF NOT EXISTS tasks (
--   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
--   title        text NOT NULL,
--   created_at   timestamptz DEFAULT now()
-- );

-- -- Log of every tool call the AI made
-- CREATE TABLE IF NOT EXISTS tool_call_log (
--   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
--   tool_name    text NOT NULL,
--   args         jsonb NOT NULL,
--   result       jsonb,
--   status       text NOT NULL CHECK (status IN ('success', 'error', 'invalid_args')),
--   created_at   timestamptz DEFAULT now()
-- );

-- -- Chat history per workspace
-- CREATE TABLE IF NOT EXISTS chat_messages (
--   id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
--   role         text NOT NULL CHECK (role IN ('user', 'assistant')),
--   content      text NOT NULL,
--   citations    jsonb,           -- [{doc_name, chunk_index}]
--   created_at   timestamptz DEFAULT now()
-- );

-- -- Vector search index (ivfflat for cosine similarity)
-- CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
--   ON document_chunks USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- -- Workspace filter index (critical for isolation)
-- CREATE INDEX IF NOT EXISTS document_chunks_workspace_idx
--   ON document_chunks (workspace_id);

-- -- RLS Policies: users can only see their own workspaces
-- ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE tool_call_log ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- -- Workspaces: only the owner can read/write
-- CREATE POLICY "Users own workspaces" ON workspaces
--   FOR ALL USING (auth.uid() = user_id);

-- -- Documents: workspace owner can read/write (via service_role in API routes)
-- CREATE POLICY "Workspace owner owns documents" ON documents
--   FOR ALL USING (
--     workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid())
--   );

-- CREATE POLICY "Workspace owner owns chunks" ON document_chunks
--   FOR ALL USING (
--     workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid())
--   );

-- CREATE POLICY "Workspace owner owns tasks" ON tasks
--   FOR ALL USING (
--     workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid())
--   );

-- CREATE POLICY "Workspace owner owns tool_call_log" ON tool_call_log
--   FOR ALL USING (
--     workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid())
--   );

-- CREATE POLICY "Workspace owner owns chat_messages" ON chat_messages
--   FOR ALL USING (
--     workspace_id IN (SELECT id FROM workspaces WHERE user_id = auth.uid())
--   );

-- -- ============================================================
-- -- RPC: match_chunks — workspace-scoped vector search
-- -- This is the ONLY way chunks are retrieved. workspace_filter
-- -- is inside the query, never filtered after the fact.
-- -- ============================================================
-- CREATE OR REPLACE FUNCTION match_chunks(
--   query_embedding vector(768),
--   workspace_filter uuid,
--   match_count int DEFAULT 5
-- )
-- RETURNS TABLE (
--   id uuid,
--   content text,
--   document_id uuid,
--   chunk_index int,
--   similarity float
-- )
-- LANGUAGE sql STABLE AS $$
--   SELECT
--     dc.id,
--     dc.content,
--     dc.document_id,
--     dc.chunk_index,
--     1 - (dc.embedding <=> query_embedding) AS similarity
--   FROM document_chunks dc
--   WHERE dc.workspace_id = workspace_filter   -- isolation enforced here
--   ORDER BY dc.embedding <=> query_embedding
--   LIMIT match_count;
-- $$;
