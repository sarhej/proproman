// Tymio API (deploy trigger: watchPatterns include /server/**)
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Pool } from "pg";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "./env.js";
import "./auth/passport.js";
import { authRouter } from "./routes/auth.js";
import { initiativesRouter } from "./routes/initiatives.js";
import { metaRouter } from "./routes/meta.js";
import { featuresRouter } from "./routes/features.js";
import { decisionsRouter } from "./routes/decisions.js";
import { risksRouter } from "./routes/risks.js";
import { dependenciesRouter } from "./routes/dependencies.js";
import { productsRouter } from "./routes/products.js";
import { accountsRouter } from "./routes/accounts.js";
import { partnersRouter } from "./routes/partners.js";
import { demandsRouter } from "./routes/demands.js";
import { requirementsRouter } from "./routes/requirements.js";
import { assignmentsRouter } from "./routes/assignments.js";
import { timelineRouter } from "./routes/timeline.js";
import { campaignsRouter } from "./routes/campaigns.js";
import { assetsRouter } from "./routes/assets.js";
import { campaignLinksRouter } from "./routes/campaign-links.js";
import { adminRouter } from "./routes/admin.js";
import { domainsRouter } from "./routes/domains.js";
import { personasRouter } from "./routes/personas.js";
import { revenueStreamsRouter } from "./routes/revenue-streams.js";
import { importExportRouter } from "./routes/import-export.js";
import { milestonesRouter } from "./routes/milestones.js";
import { kpisRouter } from "./routes/kpis.js";
import { stakeholdersRouter } from "./routes/stakeholders.js";
import { messagesRouter } from "./routes/messages.js";
import { notificationSubscriptionsRouter } from "./routes/notification-subscriptions.js";
import { meRouter } from "./routes/me.js";
import { ontologyRouter } from "./routes/ontology.js";
import { uiSettingsRouter } from "./routes/ui-settings.js";
import { agentGuideRouter } from "./routes/agent-guide.js";
import { prisma } from "./db.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { mountMcp } from "./mcp/setup.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../../client/dist");

const PgStore = connectPgSimple(session);
const pool = new Pool({ connectionString: env.DATABASE_URL });

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "https://*.googleusercontent.com", "https://*.ggpht.com"],
        "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-inline/eval needed for some dev tools/react
        "connect-src": ["'self'", "ws:", "wss:"], // Allow websockets for HMR
      },
    },
  })
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 800, // Limit each IP (SPA + MCP; configurable via RATE_LIMIT_MAX if needed)
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  })
);

app.use(
  cors({
    origin: env.CLIENT_URL.replace(/\/$/, ""),
    credentials: true
  })
);
app.use(express.json({ limit: "10mb" }));

app.set("trust proxy", 1);
app.use(
  session({
    store: new PgStore({
      pool,
      tableName: "session",
      createTableIfMissing: true
    }),
    name: "dd.sid",
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 14,
      sameSite: "lax"
    }
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(apiKeyAuth);

mountMcp(app);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/meta", metaRouter);
app.use("/api/initiatives", initiativesRouter);
app.use("/api/features", featuresRouter);
app.use("/api/decisions", decisionsRouter);
app.use("/api/risks", risksRouter);
app.use("/api/dependencies", dependenciesRouter);
app.use("/api/products", productsRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/partners", partnersRouter);
app.use("/api/demands", demandsRouter);
app.use("/api/requirements", requirementsRouter);
app.use("/api/assignments", assignmentsRouter);
app.use("/api/timeline", timelineRouter);
app.use("/api/campaigns", campaignsRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/campaign-links", campaignLinksRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin", importExportRouter);
app.use("/api/domains", domainsRouter);
app.use("/api/personas", personasRouter);
app.use("/api/revenue-streams", revenueStreamsRouter);
app.use("/api/milestones", milestonesRouter);
app.use("/api/kpis", kpisRouter);
app.use("/api/stakeholders", stakeholdersRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/notification-subscriptions", notificationSubscriptionsRouter);
app.use("/api/me", meRouter);
app.use("/api/ontology", ontologyRouter);
app.use("/api/ui-settings", uiSettingsRouter);
app.use("/api/agent", agentGuideRouter);

app.get("/api/export/initiatives.csv", async (_req, res) => {
  const initiatives = await prisma.initiative.findMany({
    include: {
      domain: true,
      owner: true
    },
    orderBy: [{ createdAt: "asc" }]
  });
  const lines = [
    "title,domain,owner,priority,horizon,status,commercialType,isGap",
    ...initiatives.map((i) =>
      [
        i.title,
        i.domain.name,
        i.owner?.name ?? "",
        i.priority,
        i.horizon,
        i.status,
        i.commercialType,
        i.isGap ? "yes" : "no"
      ]
        .map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`)
        .join(",")
    )
  ];
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=initiatives.csv");
  res.send(lines.join("\n"));
});

if (env.NODE_ENV === "production") {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  void next;
  console.error(err);
  if (err.stack) console.error(err.stack);
  const isDbDown =
    (err as Error & { code?: string }).code === "ECONNREFUSED" ||
    (err as Error & { code?: string }).code === "P1001" ||
    String(err.message).includes("ECONNREFUSED") ||
    String(err.message).includes("connect");
  if (isDbDown) {
    res.status(503).json({ error: "Service temporarily unavailable. Please try again later." });
    return;
  }
  res.status(500).json({ error: "Internal server error" });
});

app.listen(Number(env.PORT), () => {
  console.log(`Server running on port ${env.PORT}`);
});
