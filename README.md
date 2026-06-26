# DocMind — Multi-Workspace Document Assistant

A deployed SaaS web app where users upload documents into isolated workspaces and chat with an AI that answers **only** from that workspace's documents (RAG), with tool calling (save tasks, Discord notifications).

## Live Demo
🔗 [Deployed on Vercel] — add your URL here after deployment

**Test credentials (throwaway):**
- Email: `test@docmind.demo` / Password: `test123456`

**Sample questions to try:**
1. Upload `workspace-a.txt` to Workspace A → ask "What is the revenue?"
2. Switch to Workspace B → ask same → should get "I don't know"
3. "Save a task to review Q3 report" → triggers save_task tool
4. "Notify the team: Q3 review is scheduled" → triggers Discord webhook

---

## Architecture

```
User → Next.js (App Router)
         ├── Supabase Auth (email/password)
         ├── /api/upload → SHA256 → chunk → embed (Gemini) → pgvector
         └── /api/chat  → retrieve chunks (workspace-scoped) → Gemini + tools
```

**Single shared vector table** (`document_chunks`) with `workspace_id` column.  
Workspace isolation enforced **inside** the SQL RPC, never filtered after the fact.

---

## Local Setup

```bash
# 1. Clone and install
git clone <your-repo>
cd nexus-rag
npm install

# 2. Create Supabase project at supabase.com (free, no card)
#    Run supabase/schema.sql in the SQL editor

# 3. Get a Gemini API key at aistudio.google.com (free, no card)

# 4. Create a Discord channel webhook (optional, for notification tool)

# 5. Set env vars
cp .env.example .env.local
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#          SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, DISCORD_WEBHOOK_URL

# 6. Run
npm run dev
# Open http://localhost:3000
```

---

## Environment Variables

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API (never expose client-side) |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → Get API key |
| `DISCORD_WEBHOOK_URL` | Discord channel → Edit Channel → Integrations → Webhooks |

---

## Deployment (Vercel)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set env vars in Vercel dashboard → Project Settings → Environment Variables
# Add all 5 variables above
```

---

## Key Design Decisions

1. **Workspace isolation in SQL, not application code** — the `match_chunks` RPC function has `WHERE workspace_id = workspace_filter` baked in. Even if application code had a bug, the DB query can't cross workspace boundaries.

2. **Single vector table** — one `document_chunks` table for all workspaces. Isolation via `workspace_id` column, not separate tables/indexes.

3. **Tool calling loop** — model proposes → Zod validates → executor runs → result fed back. Unknown or invalid tools return error JSON to the model, never crash.

4. **Prompt injection defense** — retrieved chunks go inside `<doc>` tags in the context block, separated from the instruction portion. System prompt explicitly instructs model to treat `<doc>` content as data.

5. **Idempotent ingestion** — SHA-256 of file bytes checked against `documents.file_hash` before any embedding. Same file re-uploaded = instant skip.
