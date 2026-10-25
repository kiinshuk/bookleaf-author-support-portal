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
Tickets: POST /tickets, GET /tickets (filters status, category, priority; sorted Critical?Low then oldest first), GET /tickets/:id, PATCH /tickets/:id (admin), POST /tickets/:id/notes (admin), POST /tickets/:id/responses, POST /tickets/:id/draft (admin)

## Real-time
WebSocket at ws://localhost:4000/ws?token=<jwt>. Emits ticket.created, ticket.updated, ticket.response.

## AI Integration
Prompts grounded in BookLeaf KB (80/20 split, quarterly payouts 45 days, ?1,000 threshold, ISBN policy, 5-7 business day print, free reprint, 7-10 day listing, 24-48h resync, production stages, tone). Categories exact six; priorities Critical/High/Medium/Low. Classification & priority run asynchronously after ticket persist. Drafts editable before send.

Fallbacks: OpenAI (if API key) ? Ollama (if OLLAMA_MODEL) ? deterministic. Tickets still create and manual responses remain available when AI disabled.

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
- 3/3 passed: health, author login, auth guard.
Dataset check: `npm run verify:dataset` ? 10 authors, 18 books, null/pending preserved.
Frontend production build: passes.

## Known Limitations
- SQLite locally; deployment uses managed Postgres (provider swap + migration).
- File attachments UI only (bonus not implemented).
- No automated WebSocket tests yet.
- Deterministic fallbacks are not AI-generated and are labeled as fallback drafts in docs.
