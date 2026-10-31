import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import session from "express-session";
import passport from "passport";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 4000);

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
app.get("/api/admin/overview", requireAuth, requireAdmin, async (_req, res) => {
  const [users, media, creators] = await Promise.all([prisma.user.count(), prisma.media.count(), prisma.user.count({ where: { creatorStatus: "ACTIVE" } })]);
  res.json({ users, media, creators });
});
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err); res.status(500).json({ error: "Unexpected server error" });
});

app.listen(port, () => console.log(`douyintv API listening on :${port}`));
