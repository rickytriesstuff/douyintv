# douyintv

A cinematic streaming and creator platform built in staged releases.

## Stack
- React, TypeScript, Tailwind CSS, Vite
- Node.js, Express REST API
- Prisma + SQLite (no hosted PostgreSQL required)
- External video embeds for the current release; Cloudflare R2 planned for direct uploads
- Optional Google OAuth and TMDB metadata

## Requirements
- Node.js 20+
- npm 10+

## Local setup
1. Copy `.env.example` to `.env` and set a long random `SESSION_SECRET`.
2. Install dependencies from the repository root: `npm install`.
3. Generate Prisma client: `npm run db:generate`.
4. Create/update the local SQLite database: `npm run db:push`.
5. Seed sample movies and series: `npm run db:seed`.
6. Start both applications: `npm run dev`.

The API runs at http://localhost:4000 and the Vite client at http://localhost:5173. SQLite data is stored at `server/prisma/dev.db` by default. Uploaded videos are stored under `server/uploads` by default.

## First administrator
Register through the site, then promote your account using a one-time SQLite update (install sqlite3 CLI):

```sql
UPDATE User SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```

Sign out and back in. Admin UI and API routes enforce the server-side ADMIN role.

## Video hosting and deployment
- For now, add videos using external HTTP/HTTPS video URLs or iframe embed URLs. The original provider handles video hosting and playback bandwidth.
- Direct video uploads are intentionally disabled in both the admin and creator interfaces and their API endpoints return HTTP 410. This prevents video files from being stored in Git history or on an ephemeral application server.
- GitHub stores the source code and runs CI. GitHub is not used as a video CDN or media bucket, and GitHub Pages cannot run the Node.js API.
- Cloudflare R2 is the planned storage destination for a later upload release. The integration should use private object storage and controlled playback URLs or a media delivery layer.
- The Node.js API and SQLite database still need a persistent server host/volume for production accounts and library data.
- Only embed or link media that you own or are authorised to distribute.

## Optional integrations
Google OAuth requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a matching callback URL. TMDB metadata search requires `TMDB_API_KEY`. Neither is required for basic email/password accounts and manually entered titles.

## Current status
- Admin library supports movies, series, episodes, iframe/embed URLs, and Live TV channel management.
- Creator applications and publishing are available to Premium members after admin approval. Premium checkout is not enabled yet, so new accounts remain FREE.
- Creator tips are external links. douyintv does not process or deduct tips.
- HLS playback pipeline, FFmpeg transcoding, watch progress, dynamic recommendations, watch parties, and notifications remain future stages.
- Only upload or embed media that you own or are authorised to distribute.

## Environment
See `.env.example`. Keep secrets on the backend and never commit production credentials.
