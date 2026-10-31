import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient, MediaKind, MediaSourceType, PublishStatus } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);
const s3 = process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? new S3Client({ region: process.env.S3_REGION || "auto", endpoint: process.env.S3_ENDPOINT || undefined, forcePathStyle: Boolean(process.env.S3_ENDPOINT), credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } }) : null;

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(session({
  name: "douyintv.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

type SessionUser = { id: string; email: string; displayName: string; role: string; subscription: string; creatorStatus: string };
passport.serializeUser((user: any, done) => done(null, user.id));
passport.deserializeUser(async (id: string, done) => { try { const user = await prisma.user.findUnique({ where: { id } }); done(null, user || false); } catch (error) { done(error); } });
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({ clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/api/auth/google/callback" }, async (_accessToken, _refreshToken, profile, done) => {
    try { const email = profile.emails?.[0]?.value?.toLowerCase(); if (!email) return done(new Error("Google account did not provide an email")); const user = await prisma.user.upsert({ where: { email }, update: { googleId: profile.id, avatarUrl: profile.photos?.[0]?.value }, create: { email, googleId: profile.id, displayName: profile.displayName || email.split("@")[0], avatarUrl: profile.photos?.[0]?.value, profiles: { create: { name: profile.displayName || "Main profile" } } } }); done(null, user); } catch (error) { done(error as Error); }
  }));
}
declare module "express-session" { interface SessionData { user?: SessionUser } }

const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(60)
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

function safeUser(user: any): SessionUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, subscription: user.subscription, creatorStatus: user.creatorStatus };
}
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required" });
  next();
}
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.session.user?.role !== "ADMIN") return res.status(403).json({ error: "Admin access required" });
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true, app: "douyintv", stage: 1 }));
app.post("/api/auth/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid details" });
  try {
    const email = parsed.data.email.toLowerCase();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, displayName: parsed.data.displayName, profiles: { create: { name: parsed.data.displayName } } }
    });
    req.session.user = safeUser(user);
    res.status(201).json({ user: req.session.user });
  } catch (error: any) {
    if (error.code === "P2002") return res.status(409).json({ error: "An account with this email already exists" });
    console.error(error); res.status(500).json({ error: "Could not create account" });
  }
});
app.post("/api/auth/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password" });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user?.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect" });
  req.session.user = safeUser(user);
  res.json({ user: req.session.user });
});
app.get("/api/auth/google", (req, res, next) => { if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return res.status(503).json({ error: "Google sign-in is not configured yet" }); passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next); });
app.get("/api/auth/google/callback", passport.authenticate("google", { failureRedirect: (process.env.CLIENT_ORIGIN || "http://localhost:5173") + "?auth=failed" }), (req, res) => { req.session.user = safeUser(req.user as any); res.redirect(process.env.CLIENT_ORIGIN || "http://localhost:5173"); });
app.get("/api/auth/me", (req, res) => res.json({ user: req.session.user || null }));
app.post("/api/auth/logout", (req, res) => req.session.destroy(() => { res.clearCookie("douyintv.sid"); res.status(204).end(); }));
app.get("/api/profiles", requireAuth, async (req, res) => {
  const profiles = await prisma.profile.findMany({ where: { userId: req.session.user!.id }, orderBy: { createdAt: "asc" } });
  res.json({ profiles });
});
app.post("/api/profiles", requireAuth, async (req, res) => {
  const count = await prisma.profile.count({ where: { userId: req.session.user!.id } });
  if (count >= 5) return res.status(400).json({ error: "Free accounts can create up to 5 profiles during this launch phase" });
  const name = z.string().trim().min(1).max(40).safeParse(req.body.name);
  if (!name.success) return res.status(400).json({ error: "Profile name is required" });
  const profile = await prisma.profile.create({ data: { userId: req.session.user!.id, name: name.data, isKids: Boolean(req.body.isKids) } });
  res.status(201).json({ profile });
});

const embedUrlSchema = z.preprocess((value) => { if (typeof value !== "string") return value; const match = value.match(/<iframe[^>]+src="([^"]+)"/i) || value.match(/<iframe[^>]+src=\x27([^\x27]+)\x27/i); return match ? match[1] : value.trim(); }, z.string().url().or(z.literal("")));
const mediaSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(5000).optional(),
  kind: z.nativeEnum(MediaKind),
  sourceType: z.nativeEnum(MediaSourceType).default("EMBED"),
  sourceUrl: embedUrlSchema.optional(),
  posterUrl: z.string().url().optional().or(z.literal("")),
  backdropUrl: z.string().url().optional().or(z.literal("")),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  trailerUrl: z.string().url().optional().or(z.literal("")),
  year: z.number().int().min(1888).max(2200).optional(),
  ageRating: z.string().max(12).optional(),
  rating: z.number().min(0).max(10).optional(),
  genres: z.array(z.string().max(40)).max(12).default([]),
  cast: z.array(z.string().max(80)).max(30).default([]),
  status: z.nativeEnum(PublishStatus).default("DRAFT"),
  isFeatured: z.boolean().default(false),
  parentId: z.string().optional(),
  seasonNumber: z.number().int().min(1).optional(),
  episodeNumber: z.number().int().min(1).optional()
});
const slugify = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 150) + "-" + randomUUID().slice(0, 8);
const safeExternalUrl = (value: string) => { try { const u = new URL(value); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } };

app.get("/api/media", async (req, res) => {
  const where: any = { status: "PUBLISHED" };
  if (req.query.kind && Object.values(MediaKind).includes(req.query.kind as MediaKind)) where.kind = req.query.kind;
  if (typeof req.query.search === "string" && req.query.search.trim()) where.OR = [{ title: { contains: req.query.search.trim(), mode: "insensitive" } }, { description: { contains: req.query.search.trim(), mode: "insensitive" } }];
  const media = await prisma.media.findMany({ where, include: { episodes: { where: { status: "PUBLISHED" }, orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }] }, creator: { select: { id: true, displayName: true, avatarUrl: true } } }, orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }], take: 100 });
  res.json({ media });
});
app.get("/api/admin/media", requireAuth, requireAdmin, async (_req, res) => res.json({ media: await prisma.media.findMany({ include: { episodes: true }, orderBy: { updatedAt: "desc" } }) }));
app.post("/api/admin/media", requireAuth, requireAdmin, async (req, res) => {
  const parsed = mediaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid media details" });
  if (parsed.data.sourceType === "EMBED" && (!parsed.data.sourceUrl || !safeExternalUrl(parsed.data.sourceUrl))) return res.status(400).json({ error: "Provide a valid HTTP or HTTPS embed URL" });
  if (parsed.data.kind === "EPISODE" && !parsed.data.parentId) return res.status(400).json({ error: "Episodes must belong to a series" });
  if (parsed.data.parentId) { const parent = await prisma.media.findUnique({ where: { id: parsed.data.parentId } }); if (!parent || parent.kind !== "SERIES") return res.status(400).json({ error: "Select a valid series for this episode" }); }
  const data: any = { ...parsed.data, slug: slugify(parsed.data.title), sourceUrl: parsed.data.sourceUrl || null, posterUrl: parsed.data.posterUrl || null, backdropUrl: parsed.data.backdropUrl || null, thumbnailUrl: parsed.data.thumbnailUrl || null, trailerUrl: parsed.data.trailerUrl || null };
  const media = await prisma.media.create({ data });
  res.status(201).json({ media });
});
app.patch("/api/admin/media/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = mediaSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid media details" });
  const data: any = { ...parsed.data };
  if (data.title) data.slug = slugify(data.title);
  const media = await prisma.media.update({ where: { id: req.params.id }, data });
  res.json({ media });
});
app.delete("/api/admin/media/:id", requireAuth, requireAdmin, async (req, res) => { await prisma.media.delete({ where: { id: req.params.id } }); res.status(204).end(); });
app.post("/api/admin/uploads/presign", requireAuth, requireAdmin, async (req, res) => {
  if (!s3 || !process.env.S3_BUCKET) return res.status(503).json({ error: "S3 storage is not configured. Add the S3 environment variables first." });
  const parsed = z.object({ fileName: z.string().min(1).max(240), contentType: z.string().min(1).max(120), size: z.number().int().positive().max(5 * 1024 * 1024 * 1024) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Provide a file name, content type and valid file size (maximum 5GB)" });
  if (!parsed.data.contentType.startsWith("video/")) return res.status(400).json({ error: "Only video uploads are supported here" });
  const ext = parsed.data.fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "mp4";
  const key = "uploads/" + new Date().toISOString().slice(0,10) + "/" + randomUUID() + "." + ext;
  const command = new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: parsed.data.contentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });
  const base = (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/$/, "");
  res.json({ uploadUrl, key, sourceUrl: base ? base + "/" + key : null, expiresIn: 900 });
});
app.get("/api/admin/live-channels", requireAuth, requireAdmin, async (_req, res) => res.json({ channels: await prisma.liveChannel.findMany({ orderBy: { sortOrder: "asc" } }) }));
app.post("/api/admin/live-channels", requireAuth, requireAdmin, async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).optional(), embedUrl: embedUrlSchema, thumbnailUrl: z.string().url().optional().or(z.literal("")), category: z.string().max(80).optional(), isActive: z.boolean().default(true), sortOrder: z.number().int().default(0) }).safeParse(req.body);
  if (!parsed.success || !safeExternalUrl(parsed.data?.embedUrl || "")) return res.status(400).json({ error: "Enter a channel name and valid HTTP/HTTPS embed or iframe URL" });
  const channel = await prisma.liveChannel.create({ data: { ...parsed.data, thumbnailUrl: parsed.data.thumbnailUrl || null } });
  res.status(201).json({ channel });
});
app.patch("/api/admin/live-channels/:id", requireAuth, requireAdmin, async (req, res) => {
  const parsed = z.object({ name: z.string().min(1).max(120).optional(), description: z.string().max(500).optional(), embedUrl: embedUrlSchema.optional(), thumbnailUrl: z.string().url().optional().or(z.literal("")), category: z.string().max(80).optional(), isActive: z.boolean().optional(), sortOrder: z.number().int().optional() }).safeParse(req.body);
  if (!parsed.success || (parsed.data.embedUrl && !safeExternalUrl(parsed.data.embedUrl))) return res.status(400).json({ error: "Invalid channel details" });
  const channel = await prisma.liveChannel.update({ where: { id: req.params.id }, data: { ...parsed.data, thumbnailUrl: parsed.data.thumbnailUrl || null } });
  res.json({ channel });
});
app.delete("/api/admin/live-channels/:id", requireAuth, requireAdmin, async (req, res) => { await prisma.liveChannel.delete({ where: { id: req.params.id } }); res.status(204).end(); });
app.get("/api/live-channels", async (_req, res) => res.json({ channels: await prisma.liveChannel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }) }));
app.get("/api/admin/tmdb", requireAuth, requireAdmin, async (req, res) => {
  if (!process.env.TMDB_API_KEY) return res.status(503).json({ error: "TMDB_API_KEY is not configured" });
  const query = z.string().trim().min(1).max(150).safeParse(req.query.title);
  if (!query.success) return res.status(400).json({ error: "Enter a title to search" });
  const response = await fetch("https://api.themoviedb.org/3/search/multi?query=" + encodeURIComponent(query.data) + "&include_adult=false", { headers: { Authorization: "Bearer " + process.env.TMDB_API_KEY, accept: "application/json" } });
  if (!response.ok) return res.status(502).json({ error: "TMDB lookup failed" });
  const data: any = await response.json();
  res.json({ results: (data.results || []).filter((x: any) => x.media_type === "movie" || x.media_type === "tv").slice(0, 10).map((x: any) => ({ id: x.id, title: x.title || x.name, description: x.overview, year: Number((x.release_date || x.first_air_date || "").slice(0,4)) || null, posterUrl: x.poster_path ? "https://image.tmdb.org/t/p/w500" + x.poster_path : null, backdropUrl: x.backdrop_path ? "https://image.tmdb.org/t/p/w1280" + x.backdrop_path : null, rating: x.vote_average, kind: x.media_type === "tv" ? "SERIES" : "MOVIE" })) });
});
app.post("/api/creators/apply", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.user!.id } });
  if (user?.subscription !== "PREMIUM") return res.status(403).json({ error: "Creator accounts are available to Premium members. Premium checkout is not enabled yet." });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { creatorStatus: "PENDING" } });
  req.session.user = safeUser(updated);
  res.json({ user: req.session.user });
});
app.get("/api/creator/overview", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.user!.id }, include: { media: { orderBy: { createdAt: "desc" } } } });
  if (user?.subscription !== "PREMIUM" || user.creatorStatus !== "ACTIVE") return res.status(403).json({ error: "An active Premium creator account is required" });
  const tipLink = await prisma.tipLink.findUnique({ where: { creatorId: user.id } });
  const tips = await prisma.creatorTip.aggregate({ where: { creatorId: user.id }, _sum: { amount: true }, _count: true });
  res.json({ media: user.media, tipLink, tips: { total: tips._sum.amount || 0, count: tips._count, creatorShare: "100%" } });
});
app.put("/api/creator/tip-link", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.user!.id } });
  if (user?.subscription !== "PREMIUM" || user.creatorStatus !== "ACTIVE") return res.status(403).json({ error: "An active Premium creator account is required" });
  const parsed = z.object({ platform: z.string().trim().min(1).max(40), url: z.string().url() }).safeParse(req.body);
  if (!parsed.success || !safeExternalUrl(parsed.data?.url || "")) return res.status(400).json({ error: "Enter a valid tip link" });
  const tipLink = await prisma.tipLink.upsert({ where: { creatorId: user.id }, create: { creatorId: user.id, ...parsed.data }, update: parsed.data });
  res.json({ tipLink });
});
app.post("/api/creator/media", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.user!.id } });
  if (user?.subscription !== "PREMIUM" || user.creatorStatus !== "ACTIVE") return res.status(403).json({ error: "An active Premium creator account is required" });
  const parsed = mediaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid media details" });
  if (parsed.data.kind === "EPISODE" && !parsed.data.parentId) return res.status(400).json({ error: "Episodes must belong to a series" });
  if (parsed.data.sourceType === "EMBED" && (!parsed.data.sourceUrl || !safeExternalUrl(parsed.data.sourceUrl))) return res.status(400).json({ error: "Provide a valid embed URL" });
  const media = await prisma.media.create({ data: { ...parsed.data, slug: slugify(parsed.data.title), creatorId: user.id, sourceUrl: parsed.data.sourceUrl || null } });
  res.status(201).json({ media });
});


app.get("/api/admin/creators", requireAuth, requireAdmin, async (_req, res) => {
 const creators = await prisma.user.findMany({ where: { creatorStatus: { in: ["PENDING","ACTIVE","SUSPENDED"] } }, select: { id: true, email: true, displayName: true, subscription: true, creatorStatus: true, createdAt: true }, orderBy: { createdAt: "desc" } });
 res.json({ creators });
});
app.patch("/api/admin/creators/:id", requireAuth, requireAdmin, async (req, res) => {
 const status = z.enum(["ACTIVE","SUSPENDED","NONE"]).safeParse(req.body.status);
 if (!status.success) return res.status(400).json({ error: "Invalid creator status" });
 const user = await prisma.user.update({ where: { id: req.params.id }, data: { creatorStatus: status.data } });
 res.json({ creator: safeUser(user) });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  const [users, media, creators] = await Promise.all([prisma.user.count(), prisma.media.count(), prisma.user.count({ where: { creatorStatus: "ACTIVE" } })]);
  res.json({ users, media, creators });
});
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err); res.status(500).json({ error: "Unexpected server error" });
});

app.listen(port, () => console.log(`douyintv API listening on :${port}`));
