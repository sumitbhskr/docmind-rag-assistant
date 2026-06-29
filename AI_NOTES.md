# AI_NOTES.md — Engineering Process & AI Collaboration Log

> This file documents how AI tools were used in building DocMind, what decisions I made vs. what Claude generated, key bugs I debugged, and what I'd do differently. Written for honesty — interviewers should know exactly where human judgment was applied.

---

## 1. Tools & Models Used

| Tool | Purpose |
|---|---|
| **Claude Sonnet** via claude.ai | Architecture decisions, code generation, debugging, schema design |
| **Groq llama-3.3-70b-versatile** | Production LLM for chat responses and tool calling |
| **Gemini `gemini-embedding-001`** | Embedding documents and queries at inference time |

### Why Groq Instead of Gemini for Chat?

Originally the project used **Google Gemini 2.5 Flash** for chat. During final testing before submission, the free-tier quota (`limit: 0`) was exhausted across all API keys on the same Google Cloud project. Quota is project-scoped, not key-scoped — creating new keys under the same account did not restore it.

**Decision:** Switched chat model to **Groq `llama-3.3-70b-versatile`** (14,400 req/day free tier, no credit card). Gemini is retained for embeddings (`gemini-embedding-001`) because that quota was unaffected and switching embedding models would invalidate all stored vectors.

This is a production-relevant decision: embedding model and chat model are decoupled by design. The RAG pipeline embeds at ingestion time and retrieval time — changing the chat model has zero effect on stored vectors.

### Context Management Strategy

I maintained a `CLAUDE.md` file (committed to this repo) as a structured AI context file. It contains:
- Full tech stack and the reasons for each choice
- Architecture invariants (e.g., "workspace isolation must be in SQL, not TypeScript")
- Database schema, tool definitions, Zod schemas, file structure
- A strict "What NOT to Do" section
- Build order to prevent Claude from skipping ahead

At the start of every new Claude conversation, I pasted this file first. This eliminated context drift across sessions — Claude would not suggest switching to OpenAI, adding Redis, or creating per-workspace DB tables because the constraints were explicit in the context.

**Why this matters for the codebase:** any AI-generated code in this repo was written against consistent, version-controlled constraints. The CLAUDE.md is the spec; the code is the output.

---

## 2. How Work Was Split

```
Claude's contribution (~70% of keystrokes):
  ✓ First-draft implementation of all files
  ✓ Boilerplate (Next.js route handlers, Supabase client setup)
  ✓ Gemini API integration patterns
  ✓ Zod schema definitions
  ✓ SQL schema and index definitions

My contribution (100% of decisions):
  ✓ All architecture choices (see Section 3)
  ✓ Code review of every Claude output before accepting
  ✓ Catching logic errors Claude generated (see Section 5)
  ✓ Debugging production issues Claude couldn't reproduce (see Section 5)
  ✓ Deciding what goes in CLAUDE.md as an invariant vs. a suggestion
  ✓ Verifying DB-level behavior with direct Supabase SQL queries
  ✓ Final integration testing across all checklist items
  ✓ Groq migration decision when Gemini quota was exhausted
```

The mental model I used: **Claude is a fast typist who needs to be supervised.** It can generate syntactically correct code quickly, but it doesn't know what my specific Supabase project's wire format expects, doesn't have access to my actual running DB, and doesn't catch semantic bugs (e.g., "insert succeeded but data is wrong"). That's my job.

---

## 3. Key Decisions I Made (Not Claude's Defaults)

### Decision 1: Workspace Isolation Inside the SQL RPC, Not in TypeScript

**What Claude initially suggested:** filter by `workspace_id` in the TypeScript retrieval function after fetching results.

**What I enforced:** the `match_chunks` Postgres RPC function has `WHERE workspace_id = workspace_filter` inside the function body. The filter is part of the vector scan, not a post-query TypeScript `.filter()`.

**Why it matters:**  
Post-query filtering is dangerous. If a code path ever forgets to call `.filter()`, it returns all workspaces' data silently. With the SQL-level filter, a forgotten TypeScript check just means the DB returns zero rows for a wrong `workspace_id` — it can never return another workspace's chunks.

---

### Decision 2: Zod Validation as a Second Layer After Tool Call Args

**What Claude initially suggested:** use tool call args directly after a basic `if (args.title)` check.

**What I enforced:** every tool executor receives args only after `schema.safeParse(args)` passes. The `status` field in `tool_call_log` distinguishes `'success'`, `'error'`, and `'invalid_args'`.

**Why it matters:**  
LLMs occasionally hallucinate field names or send a number where a string is expected. If `safeParse` fails, the error JSON is fed back to the model so it can retry with corrected args — the executor never runs with bad input.

---

### Decision 3: Sentence-Boundary-Aware Chunking (Not Naive Character Splits)

**What Claude initially generated:** a simple character-based split with no regard for sentence boundaries.

**What I changed:** the `chunkText()` function detects sentence endings (`.`, `!`, `?` followed by whitespace) and completes the current sentence before cutting.

**Why it matters:**  
Embedding models encode semantic meaning. A chunk that ends mid-sentence has ambiguous meaning — the embedding is less precise. Completing the sentence gives the model a complete semantic unit, improving retrieval precision.

---

### Decision 4: `<doc>` Tag Separation for Prompt Injection Defense

**What Claude initially generated:** interpolating chunks directly into the system prompt string.

**What I enforced:** instructions live in the `system` role content, retrieved chunks live in a separately constructed string wrapped in `<doc source="..." chunk="N">` tags.

**Why it matters:**  
If a user uploads a document containing *"Ignore all previous instructions"*, naive prompt construction merges that text with the instructions. With `<doc>` tag separation, the model sees it as content to summarize — not a directive.

---

### Decision 5: SHA-256 Idempotency Before Any Embedding

**What Claude initially generated:** a check based on filename only.

**What I enforced:** SHA-256 hash of the file's binary content, stored as `file_hash` with a `UNIQUE (workspace_id, file_hash)` constraint.

**Why it matters:**  
Filenames are not unique. A user can upload `report.pdf`, delete it, re-upload a completely different file with the same name, and the filename check would incorrectly skip ingestion. SHA-256 of the content is the correct identity.

---

### Decision 6: Decoupled Chat Model and Embedding Model

**What most tutorials assume:** same provider for both chat and embeddings.

**What I enforced:** chat model (Groq) and embedding model (Gemini) are called through separate clients in `lib/gemini.ts`. This decoupling meant that when Gemini's chat quota was exhausted, I could swap the chat model to Groq without touching the ingestion pipeline or invalidating any stored vectors.

**Why it matters:**  
In production RAG systems, re-embedding an entire corpus is expensive. Keeping the embedding model stable while being free to change the chat model is the correct architectural boundary.

---

## 4. Architecture Choices I'd Explain in an Interview

**Q: Why not a separate vector table per workspace?**  
A: Schema churn. Every new workspace would require `CREATE TABLE` and `CREATE INDEX`. One shared table with a `workspace_id` column scales to thousands of workspaces with zero schema changes.

**Q: Why Groq instead of Gemini for chat?**  
A: Gemini free-tier chat quota was exhausted (20 req/day for 2.5 Flash, project-scoped). Groq offers 14,400 req/day free, no credit card, and llama-3.3-70b supports tool calling. The switch took one file change because chat and embedding models were already decoupled.

**Q: Why keep Gemini for embeddings if Groq is used for chat?**  
A: Switching embedding models would require re-embedding every stored document chunk — all existing vectors would be invalid because they'd be in a different vector space. The Gemini embedding quota was unaffected, so there was no reason to migrate.

**Q: Why pgvector instead of Pinecone/Weaviate?**  
A: Supabase pgvector keeps everything in one free-tier service. Separate vector databases add another account, another API key, another failure point, and cost at scale.

**Q: Why Next.js API routes instead of a separate Express backend?**  
A: Fewer moving parts. One deployment on Vercel handles both the Next.js app and all API routes. No separate backend service to containerize or deploy.

---

## 5. The Hardest Bug — Claude Got It Wrong

### Bug: Embeddings Stored But Similarity Search Returned Zero Results

**Symptom:** Document upload returned 200. The documents table showed correct chunk counts. But every chat query returned "I don't have information about that in this workspace's documents."

**What I actually did:**

Step 1 — Ran a direct Supabase SQL query:
```sql
SELECT id, chunk_index, length(content), embedding IS NULL as is_null
FROM document_chunks
WHERE workspace_id = 'my-test-workspace-id'
LIMIT 5;
```

Result: `is_null = true` on every row. Embeddings were null despite no insert error.

Step 2 — Checked the insert code Claude generated:
```typescript
// Claude's original (wrong):
embedding: embeddingValues,   // TypeScript number[], not what pgvector wants
```

Step 3 — Supabase's pgvector column accepts the embedding as a **JSON array string**, not a JavaScript number array. The insert was silently coercing `embeddingValues` to null.

**Fix — one line:**
```typescript
embedding: JSON.stringify(embeddingValues),  // "[0.123, -0.456, ...]"
```

**Root cause:** Claude knows the shape of the Gemini embedding API response but does not know the exact wire format Supabase's pgvector column expects. This only shows up when running against a real Supabase instance.

**Lesson:** never trust that a DB insert "succeeded" just because no error was thrown. Always verify with a direct SQL query that checks actual stored values.

---

### Bug: Gemini Chat Quota Exhausted in Production

**Symptom:** `429 Too Many Requests` with `limit: 0` on all generate_content calls. Creating new API keys under the same Google account did not help.

**Root cause:** Gemini free-tier quota is **project-scoped**, not key-scoped. All keys under `gen-lang-client-0103769675` share the same daily limit.

**Fix:** Migrated chat model to Groq `llama-3.3-70b-versatile`. Required changes:
1. `lib/gemini.ts` — export Groq client alongside Gemini embedding client
2. `app/api/chat/route.ts` — rewrite tool calling loop from Gemini's `generateContent` API to Groq's OpenAI-compatible `chat.completions.create` API
3. Vercel Environment Variables — add `GROQ_API_KEY`

Embedding pipeline untouched. Zero re-ingestion required.

---

## 6. What I'd Do Differently

### Technical

| Item | What I'd Change |
|---|---|
| Streaming responses | Implement `ReadableStream` for token-by-token output |
| Hybrid search | Combine pgvector cosine similarity with `ts_rank` full-text search via Reciprocal Rank Fusion |
| Retrieval debug UI | Collapsible "Sources used" panel showing chunk content + similarity scores |
| Document deletion | Add DELETE with cascade to `document_chunks` |
| E2E tests | Playwright tests for cross-workspace isolation flow |
| Rate limiting | Per-user rate limiting on `/api/chat` and `/api/upload` |
| Multi-provider fallback | Automatic fallback to secondary LLM if primary quota is exhausted |

### Process

| Item | What I'd Change |
|---|---|
| API quota monitoring | Set up alerts before quota exhaustion, not after |
| Provider decoupling from day one | Explicitly separate chat provider and embedding provider in config, not just in code |
| DB verification step | After every Claude-generated DB operation, run a verification SQL query immediately |

---

## 7. What I Can Explain Without AI

- Why workspace isolation must be in the SQL RPC, not application code
- The RAG retrieval loop from embedding → cosine similarity → context building → LLM call
- Why Zod validation is added after tool call args (and what `safeParse` returns)
- The prompt injection defense mechanism and why `<doc>` tag separation works
- SHA-256 idempotency and why filename-based deduplication is wrong
- Why pgvector over a dedicated vector DB for this use case
- The difference between `ivfflat` (approximate) and `hnsw` (exact) indexes
- Why embedding model and chat model must be decoupled in a production RAG system
- The Groq migration: what changed, what didn't, and why re-embedding wasn't needed

If asked to write the `match_chunks` RPC function from memory, I can. It's the core of the product.

---

*This file was written by Sumit after completing the project. It reflects actual decisions made, actual bugs encountered, and honest accounting of AI tool usage.*
