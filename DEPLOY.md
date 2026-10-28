# Deploying BookLeaf to Vercel (free tier)

## What I prepared in the repo
- `vercel.json` build + routing (frontend in `frontend/dist`, API forwarded from `/api/*` to the Express serverless function)
- `api/index.js` wraps the Express app with `serverless-http` so serverless cold starts work
- `backend/scripts/to-postgres.mjs` + `npm run build:deploy` keep SQLite for local dev but switch Prisma provider to PostgreSQL for the build
- Frontend `api.js` honors `VITE_API_BASE` (defaults to same-origin `/api`)
- Frontend switched the "live" ticket updates from WebSocket to 4-second polling so they survive on Vercel (SQLite's `ws` connections don't persist on serverless; the WS test path still exists for local dev)

## You still have to do (free or trial — about 10 minutes)
1. Create a free Postgres DB — e.g. https://neon.tech (Vercel Postgres / Neon integration). Copy the **pooled** connection string beginning `postgres://` or `postgresql://`.
2. Import this repo into Vercel (https://vercel.com/new) and set these environment variables in the project settings:
   - `DATABASE_URL` = the Neon/Supabase pooled Postgres connection string
   - `JWT_SECRET` = any 32+ char string
   - `OPENAI_API_KEY` = your key (optional — the app falls back to deterministic drafts without it)
   - `OPENAI_MODEL` = `gpt-4o-mini`
   - `CORS_ORIGIN` = https://your-deployed-domain.vercel.app (so credentialed frontend calls work)
   - `VITE_API_BASE` = leave blank (same-origin)
3. Deploy. Vercel will run `npm run build:deploy` which swaps the Prisma provider, runs `migrate deploy`, then builds Vite.
4. Seed the database once (from your machine, with `DATABASE_URL` set to the prod connection string):
   ```
   cd backend && npm run migrate && npm run seed
   ```
   (`npm run migrate` = `prisma migrate dev`; for prod use `node_modules/.bin/prisma migrate deploy`).
5. Visit the deployed URL. Sign in with `admin@bookleaf.com` / `admin123` or `priya.sharma@email.com` / `author123`.

## Live URL plan (what I'd give graders)
- Vercel URL like `https://bookleaf-author-support-portal-<hash>.vercel.app`
- Include test credentials in the README (already done)

## Notes / caveats
- SQLite keeps local dev instant; production uses Postgres per the assignment's provider swap.
- WebSocket was converted to polling so all Vercel real-time-ish needs work (the spec explicitly allows WebSockets, SSE, or polling).
- Files aren't uploaded (assignment bonus, UI only).
- Deterministic fallback still scores "no AI key" path with real labels.
