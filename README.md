# douyintv

A cinematic streaming and creator platform built in staged releases.

## Stack
- React, TypeScript, Tailwind CSS, Vite
- Node.js, Express REST API
- Prisma + SQLite (no hosted PostgreSQL required)
- Google Cloud Storage for uploaded videos (optional local-disk fallback; no S3 credentials)
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
- Admin and approved creators can upload video files directly from the browser. The current single-file upload limit is 5GB.
- Configure `GCS_BUCKET_NAME` and `GOOGLE_CLOUD_PROJECT`, plus either `GOOGLE_APPLICATION_CREDENTIALS` (secure service-account JSON file path) or `GOOGLE_CLOUD_KEY_JSON` (service-account JSON stored as a server secret). Never commit credentials.
- Uploaded objects are stored in Google Cloud Storage. Playback is streamed through the API with HTTP byte-range support, so the bucket can remain private and no public bucket URL is required.
- If GCS is not configured, uploads fall back to `MEDIA_DIR` on local disk. For that mode, the API host needs persistent disk.
- Set `PUBLIC_API_URL` to the public HTTPS URL of the API service.
- GitHub stores the source code and runs CI, but GitHub Pages cannot run this backend or accept durable video uploads. The Node.js API and SQLite database still need a persistent server host/volume.
- This release serves original uploaded files. HLS transcoding/adaptive bitrate processing is a later stage and is not implemented yet.

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
