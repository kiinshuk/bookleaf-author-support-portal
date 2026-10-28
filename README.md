# BookLeaf Author Support & Communication Portal

## Overview
Web app with author and admin portals, ticket lifecycle, real-time updates, and AI-assisted responses.

## Stack
- Frontend: React 18, Vite 5, React Router 6
- Backend: Node.js, Express 4, Prisma ORM
- Database: SQLite local (switch provider for Postgres in production)
- Auth: JWT + bcrypt
- Real-time: WebSockets (ws)
- AI: OpenAI gpt-4o-mini (optional), Ollama optional, deterministic fallback

## UI Design
The frontend follows a PlayStation-inspired design system (see `DESIGN.md`, installed via `npx getdesign@latest add playstation`):
- Three-canvas model — black chrome (sidebar/login), white working canvas, soft-grey (`#f5f7fa`) cards.
- PlayStation Blue `#0070d1` carries every primary action as a fully-rounded pill; Commerce Orange `#d53b00` is reserved for urgency (pending royalties).
- Display headings render at weight 300 (Roboto as the PlayStation SST substitute), body in Inter.
- 8px card radius, 4px input radius, flat surfaces with hairline dividers.
All tokens live as CSS variables in `frontend/src/styles.css`; components map onto them via `ui.jsx` primitives (badges, fields, alerts).

## Local Setup
Prereqs: Node 20+, npm. Optional: OPENAI_API_KEY.

Backend:
```bash
cd backend
npm install
npx prisma migrate dev --name init
node src/seed/index.js
npm run dev
```
Verify dataset: `npm run verify:dataset`

Frontend:
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173. API docs/Swagger UI: http://localhost:4000/docs

## Credentials
- Admin: admin@bookleaf.com / admin123
- Authors: any author email from dataset (e.g. priya.sharma@email.com) / author123

## API
All private routes require `Authorization: Bearer <token>`.

Auth: POST /auth/login, GET /auth/me
Authors: GET /authors, GET /authors/me
Books: GET /books, GET /books/:id
Tickets: POST /tickets, GET /tickets (filters: status, category, priority, createdAfter ISO date; sorted Critical→Low then oldest first), GET /tickets/:id, PATCH /tickets/:id (admin), POST /tickets/:id/notes (admin), POST /tickets/:id/responses, POST /tickets/:id/draft (admin)

Full request/response schemas for every endpoint: Swagger UI at http://localhost:4000/docs (spec source: `backend/openapi.json`).

## Real-time
WebSocket at ws://localhost:4000/ws?token=<jwt>. Emits ticket.created, ticket.updated, ticket.response.

## AI Integration

**Model choice:** OpenAI `gpt-4o-mini` (env `OPENAI_MODEL`, swappable). Chosen for cheap structured-output calls at scale (1,200+ books → high ticket volume), reliable JSON adherence for classification, and low latency for the fire-and-forget triage path. Anthropic Claude Haiku was the alternative; OpenAI won on JSON-mode reliability for the triage call.

**Prompt design** (`backend/src/services/ai.js`):
- **Triage** — one call returns `{"category","priority","confidence","reason"}`. Categories are constrained to the exact six in a JSON-only system prompt; output is validated against an allow-list and invalid values fall back rather than persist.
- **Drafting** — system prompt = tone rules (empathy-first, own BookLeaf faults, specific numbers/dates, 48h escalation timeline, clear next step) + BookLeaf KB + author/book record (sales, royalty paid/pending, ISBN, status, platforms) + prior thread. "Do not invent facts beyond provided context" and a 250-word cap keep drafts grounded and short.
- Output parsing strips code fences, then salvages the first balanced JSON object from prose; if parsing fails entirely, deterministic keyword heuristics classify instead — a weird model answer never breaks ticket flow.

**Graceful degradation:** provider chain OpenAI → Ollama (if `OLLAMA_MODEL` set) → deterministic heuristics, all behind one `callLLM()` call site. Transient errors (429/5xx/network) retry once with backoff before falling through. Triage runs *async after* ticket persist, so creation never blocks on a model; drafts fall back to a canned template; the admin can always write a response manually. Every failure mode is a quality drop, never an outage.

**Cost controls (measured, not claimed):**
- Classification + priority are a **single** LLM call per ticket (was two — halves per-ticket tokens).
- Only the **relevant KB slice** per category ships with a draft prompt, not the full corpus; the KB itself is condensed to ~350 words.
- Drafts are **cached per ticket state** (keyed on `updatedAt` + response count), so regenerating an unchanged draft costs 0 tokens.
- Each ticket is classified **once at creation**, never on read; drafts generate only when the admin asks.
- **`GET /ai/usage`** (admin-only) records provider, prompt/completion tokens, and cache hits per call, with rolling totals — cost is inspectable at runtime, and the response proves no key material is ever exposed.

## Security
- API keys only in env.
- JWT middleware on all private routes; RBAC enforced server-side.
- Author ownership checks on books/tickets/responses.
- Internal notes excluded for authors at query level.
- Rate limiting on auth (20 req/15min) and global (300 req/15min).
- Helmet + CORS.
- WebSocket JWT auth + filtered broadcasts.
- No stack trace/secret leakage in error responses.

## Tests
Run: `cd backend && npm test`
- 16/16 passing: health, login validation, author login, auth guards, book scoping, ticket validation/creation, internal-note isolation, queue sort order, date-filter validation, admin-only endpoint rejection, AI draft fallback, JSON-salvage parsing, deterministic triage degradation, draft caching, AI usage endpoint RBAC + no-key-leak, WebSocket auth.
Dataset check: `npm run verify:dataset` → 10 authors, 18 books, null/pending preserved.
Frontend production build: passes.

## Known Limitations
- SQLite locally; deployment uses managed Postgres (provider swap + migration).
- File attachments: picker UI only (files are not uploaded or stored — the assignment marks actual upload as bonus). The schema has no attachment table yet.
- No live deployment URL — no hosting credentials available; local run instructions above.
- No automated WebSocket tests yet.
- Deterministic fallbacks are not AI-generated and are labeled as fallback drafts in docs.
