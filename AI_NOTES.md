# AI_NOTES.md

## Tools & models used
- **Claude Sonnet** via claude.ai — architecture decisions, code generation, debugging
- I maintained a detailed `CLAUDE.md` context file (in this repo) that I shared at the start of every session. This prevented context drift across conversations.

## How work was split
Claude generated first-draft code for all files. I reviewed every file before accepting, made structural decisions, caught logic errors, and debugged issues Claude missed. Claude did ~70% of typing; I did 100% of understanding.

## Key decisions I made

**1. Workspace isolation in SQL, not middleware**  
The assignment said "enforced by the query." I made sure `match_chunks` RPC has `WHERE workspace_id = workspace_filter` inside the function body — not a post-query filter in TypeScript. If application code had a bug, the DB still can't cross boundaries.

**2. Tool calling loop with Zod, not just JSON Schema**  
Gemini returns tool call args as a plain object. I added Zod validation as a second layer — even if Gemini sends malformed args, my executor never runs with bad input. Status `'invalid_args'` is logged separately so I can audit it.

**3. Chunk size 512 tokens / 64 overlap with sentence boundary detection**  
I chose this over naive character splits. Cutting mid-sentence degrades embedding quality because the embedding model doesn't see a complete semantic unit. The sentence boundary detection in `chunkText()` was my design, not Claude's default suggestion.

## The hardest bug Claude got wrong

**Problem:** Claude initially generated the embedding insert as a TypeScript number array directly — `embedding: embeddingValues` — which caused Supabase to throw a type mismatch because pgvector expects a string in the format `[0.1, 0.2, ...]`.

**How I noticed:** The insert would succeed (no error thrown) but similarity search returned 0 results, because stored embeddings were NULL or malformed. I ran a direct Supabase SQL query and saw `embedding IS NULL` on all rows.

**Fix:** `embedding: JSON.stringify(embedding)` — Supabase's pgvector column accepts a JSON array string and parses it correctly. One line change, 2 hours of debugging.

**Lesson:** Claude knows the Gemini API return shape but not the exact wire format Supabase expects for vector columns. Always verify DB inserts with a direct SQL query before trusting the application layer.

## What I'd add with more time
1. **Streaming** — token-by-token streaming for chat responses via `ReadableStream`
2. **Retrieval debug view** — show which chunks + similarity scores were used per answer (stretch goal)
3. **Hybrid search** — combine pgvector cosine similarity with `ts_rank` full-text search, then merge rankings
4. **Document deletion** — with cascade on `document_chunks`
5. **Multi-step tool use** — more complex chains (retrieve → save task → notify Discord in one turn)
