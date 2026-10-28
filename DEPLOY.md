# Deploying BookLeaf to Vercel as a multi-service project

This repository is configured as a Vercel multi-service project.

## Service layout
- `services.backend` — Express API under `backend/`.
- `services.frontend` — Vite SPA under `frontend/`.
- Top-level public routing:
  - `/api/(.*)` -> backend (only exposed path prefix)
  - `/(.*)` -> frontend (SPA catch-all)

## What the application code already agrees with on
- Backend mounts all routes under `/api/...`.
- Frontend calls `/api/...` from the browser in production and via the Vite proxy (`/api -> localhost:4000`) in dev.
- Backend never calls another service, so there are **no service bindings** (the frontend reaches it through the public rewrite instead). The service names, rewrites, and bindings list below are exactly what this repo uses.
- `AI provider API (OpenAI / Ollama)` is an external HTTP service; it is not a Vercel service.

## Topology
- Services: `backend`, `frontend`
- Public rewrites: `/api/(.*)` -> backend, `/(.*)` -> frontend
- Bindings: none — confirm or I can add bindings only if you add another service

## Vercel setup (a few minutes)
1. Sign up at https://vercel.com if you don't have an account. Connect your GitHub account through "Continue with GitHub".
2. https://vercel.com/new -> Import `kiinshuk/bookleaf-author-support-portal`.
3. Vercel reads `vercel.json` and runs per-service build commands:
   - backend: `npm install` then `npm run build:deploy`
     - `build:deploy`: switches the Prisma provider to Postgres, and runs `db push`
   - frontend: `npm install` then `npm run build` (Vite)
4. Before deploying, add these Environment Variables (Settings -> Environment Variables):
   - `DATABASE_URL` — a pooled Postgres connection string (for example, Neon's)
   - `JWT_SECRET` — any 32+ character string
   - `OPENAI_API_KEY` — optional; leave blank and the deterministic fallback is used
   - `OPENAI_MODEL` — `gpt-4o-mini` (optional)
   - `CORS_ORIGIN` — the eventual public origin (e.g. `https://bookleaf-author-support-portal.vercel.app`)
   - `VITE_API_BASE` — leave blank (defaults to `/api`)
5. Click Deploy and copy the assigned domain (e.g. `https://bookleaf-author-support-portal.vercel.app`).

## Seed demo data once
```bash
cd backend
DATABASE_URL="postgresql://..." node src/seed/index.js
```

## Local dev
```bash
cd backend && npm run dev    # http://localhost:4000/api/...
cd frontend && npm run dev  # http://localhost:5173 with Vite proxy
```
Everything runs on SQLite by default (`backend/prisma/schema.prisma` is still SQLite).

## Health check
```bash
curl https://<your-deployment>.vercel.app/api/health
```

## Notes
- Express framework entrypoint on Vercel is `backend/src/index.js`; it both exports the `app` and calls `startServer()` only when not on Vercel (so local dev still works).
- WebSockets were converted to 4-second polling to survive serverless runtimes, as Vercel services do not support persistent WebSocket connections.
- Internal notes stay server-side — Vercel service bindings are not used here.
