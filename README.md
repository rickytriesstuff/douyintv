# douyintv

A cinematic streaming and creator platform built in staged releases.

## Stack
- React, TypeScript, Tailwind CSS, Vite
- Node.js, Express REST API
- Prisma + SQLite (no hosted PostgreSQL required)
- Local persistent disk for uploaded videos (no S3 credentials or public bucket URL)
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

## Video uploads and deployment
- Admin and approved creators can upload video files directly to the API server. The current single-file upload limit is 5GB.
- Files are served from the API under `/media/<filename>`; the API returns the full playback URL automatically.
- Set `MEDIA_DIR` to a persistent mounted disk path on your hosting provider. Set `PUBLIC_API_URL` to the public HTTPS URL of the API service.
- The backend must run as a persistent Node.js service with persistent disk. GitHub stores the source code and can run CI, but GitHub Pages cannot run this backend or accept durable video uploads.
- Do not deploy the database or media directory on ephemeral storage. Without a persistent disk, uploads and SQLite data can disappear on restart/redeploy.
- This simple local-file approach serves original uploaded files. HLS transcoding/adaptive bitrate processing is a later stage and is not implemented yet.

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
