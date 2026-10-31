# douyintv

A cinematic streaming and creator platform built in staged releases.

## Stack

- React, TypeScript, Tailwind CSS, Vite
- Node.js, Express REST API
- PostgreSQL + Prisma
- S3-compatible object storage for video files
- Google OAuth (optional)
- TMDB metadata search (optional)

## Requirements

- Node.js 20+
- PostgreSQL 14+
- npm 10+

## Local setup

1. Copy `.env.example` to `.env` and configure `DATABASE_URL`, a long random `SESSION_SECRET`, and `CLIENT_ORIGIN`.
2. Install dependencies from the repository root: `npm install`.
3. Generate Prisma client: `npm run db:generate`.
4. Create database tables: `npm run db:migrate`.
5. Seed the database: `npm run db:seed` (10 sample movies and 3 sample series).
6. Start both applications: `npm run dev`.

The API runs at http://localhost:4000 and the Vite client at http://localhost:5173.

## First administrator

Register your account through the site. Then run this once against PostgreSQL, replacing the email with the address you registered:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```

Sign out and sign back in. The Admin Studio menu is only rendered for accounts whose server-side role is ADMIN. All admin API routes independently verify that role.

## Google sign-in

Create an OAuth web client. Add `http://localhost:4000/api/auth/google/callback` as an authorised redirect URI, then configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL` in the server environment.

## Stage 2: Admin Studio, library and creator foundations

- Admin media library: create, edit and delete movies, series and episodes.
- Series episodes are linked to a parent series and include season and episode numbers.
- External embed URL support, including iframe snippets (the iframe `src` is extracted).
- Live TV channel management: add, edit, hide and remove channels.
- Public Live TV channel guide and embedded player.
- Optional TMDB title search for poster, backdrop, description, year, rating and content type.
- Presigned direct-to-S3 video uploads for admins and approved creators (single PUT, maximum 5GB).
- Premium-only creator applications, with administrator approval and suspension.
- Approved creator dashboard, external Tip Me link and creator publishing forms.
- Creator tips use external payment links. The creator receives tips directly; douyintv does not process or deduct them.

### Object storage setup

Configure these server environment variables:

- `S3_ENDPOINT`: provider endpoint (leave blank for AWS S3).
- `S3_REGION`: region name, or `auto` for compatible providers that require it.
- `S3_BUCKET`: bucket name.
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`: server-side credentials only.
- `S3_PUBLIC_BASE_URL`: public base URL used to form the final playback URL.

Configure bucket CORS to allow `PUT` from your deployed frontend origin and allow the `Content-Type` header. Make sure the bucket or CDN serves uploaded media publicly (or implement signed playback URLs before using private buckets). Never expose S3 credentials in Vite/client environment variables.

The current upload flow uses a single presigned PUT request, so the enforced maximum is 5GB. Larger files need a multipart upload implementation.

### TMDB metadata

Set `TMDB_API_KEY` on the server to enable the Admin Studio metadata search. Without it, the rest of the platform continues to work and metadata can be entered manually.

## Staged delivery

1. Authentication + database foundation.
2. Admin Studio, manual library management, embeds, live TV, creator application and publishing foundations.
3. HLS player, playback progress, transcoding and media processing.
4. Dynamic homepage, search, title pages, browse and recommendations.
5. Watch parties, notifications, casting/offline support and analytics.

## Important status and deployment notes

- Video playback and FFmpeg HLS transcoding are not implemented yet. Stage 2 stores media metadata and source URLs; Stage 3 will implement the streaming pipeline and player.
- Premium checkout is intentionally disabled. New accounts are FREE, so creator applications remain locked until an account is granted PREMIUM by the future billing integration or manually in the database for testing.
- Creator tip links are external links. Tip totals cannot be verified or automatically counted unless the external provider later supplies a webhook/API integration.
- Local-folder scanning requires a server with access to the media filesystem and is not part of this hosted deployment flow.
- Production requires HTTPS, a persistent session store (not Express's in-memory default), secure cookie configuration, database backups, object-storage lifecycle policies, and proper access control.
- Only upload or embed media that you own or are authorised to distribute. External players may restrict embedding on your domain.

## Environment variables

See `.env.example` for the complete server and client variable list. Put server secrets only in the backend environment. For the Vite client, set `VITE_API_URL` in `client/.env` if the API is not hosted at localhost:4000.
