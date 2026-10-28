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
Prompts grounded in BookLeaf KB (80/20 split, quarterly payouts 45 days, ₹1,000 threshold, ISBN policy, 5-7 business day print, free reprint, 7-10 day listing, 24-48h resync, production stages, tone). Categories exact six; priorities Critical/High/Medium/Low. Classification & priority run asynchronously after ticket persist. Drafts editable before send.

Fallbacks: OpenAI (if API key) → Ollama (if OLLAMA_MODEL) → deterministic. Tickets still create and manual responses remain available when AI disabled.

Cost: only ticket text + relevant author/book record + prior thread; KB cached constant; AI once per ticket creation, not per read.

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
- 12/12 passing: health, login validation, author login, auth guards, book scoping, ticket validation/creation, internal-note isolation, queue sort order, date-filter validation, admin-only endpoint rejection, AI draft fallback, WebSocket auth.
Dataset check: `npm run verify:dataset` → 10 authors, 18 books, null/pending preserved.
Frontend production build: passes.

## Known Limitations
- SQLite locally; deployment uses managed Postgres (provider swap + migration).
- File attachments: picker UI only (files are not uploaded or stored — the assignment marks actual upload as bonus). The schema has no attachment table yet.
- No live deployment URL — no hosting credentials available; local run instructions above.
- No automated WebSocket tests yet.
- Deterministic fallbacks are not AI-generated and are labeled as fallback drafts in docs.
