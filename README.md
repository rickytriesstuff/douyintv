# douyintv

A cinematic, responsive streaming platform. The repository is being built in verified stages.

## Stage 1: Authentication + database

- React + TypeScript + Tailwind client
- Node.js/Express REST API
- PostgreSQL + Prisma schema
- Email/password registration and login with secure HTTP-only sessions
- Multiple profiles, including kids-profile flag
- Role and subscription foundations for admin and premium creator access

## Requirements

- Node.js 20+
- PostgreSQL 14+
- npm 10+

## Local setup

1. Copy `.env.example` to `.env` and set `DATABASE_URL` and a long random `SESSION_SECRET`.
2. Install dependencies: `npm install`.
3. Generate Prisma client: `npm run db:generate`.
4. Create the database tables: `npm run db:migrate`.
5. Start both apps: `npm run dev`.

The API runs at http://localhost:4000 and the client at http://localhost:5173.

## Staged delivery

1. Auth + database (current)
2. Library management, manual uploads, external embeds, episodes, live TV and creator publishing
3. HLS player, playback progress and transcoding pipeline
4. Home, search, title details, browse and discovery
5. Watch parties, notifications, casting/offline support and analytics

## Important deployment notes

A production deployment needs a managed PostgreSQL database, persistent session storage (Redis or a database-backed session store), HTTPS, and S3-compatible object storage. Do not put storage credentials, TMDB keys, or OAuth secrets in client-side variables. Creator tips are external links in the launch version; douyintv does not process or deduct creator earnings. Monetization checkout is intentionally disabled while the platform is free.
