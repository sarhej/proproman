// Tymio API server (Express)
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
import { executionBoardsRouter } from "./routes/execution-boards.js";
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
import { meRouter, meSessionRouter } from "./routes/me.js";
import { ontologyRouter } from "./routes/ontology.js";
import { uiSettingsRouter } from "./routes/ui-settings.js";
import { agentGuideRouter } from "./routes/agent-guide.js";
import { prisma, prismaUnscoped } from "./db.js";
import { normalizePublicTenantSlug } from "./lib/publicTenantSlug.js";
import { apiKeyAuth } from "./middleware/apiKeyAuth.js";
import { requireAuth } from "./middleware/auth.js";
import { mountMcp } from "./mcp/setup.js";
import { requireTenant } from "./tenant/requireTenant.js";
import { tenantResolver } from "./tenant/tenantResolver.js";
import { tenantsRouter } from "./routes/tenants.js";
import {
  tenantRequestsRouter,
  tenantRequestLookupBySlugHandler,
} from "./routes/tenant-requests.js";
import { refreshMcpFeedbackNoticeCache } from "./lib/mcpFeedbackNotice.js";
import { buildMcpAgentContextJson } from "./lib/mcpAgentContextPayload.js";
import { ensureSystemTenant } from "./tenant/ensureSystemTenant.js";
import { registerLegalRoutes } from "./legal/serveLegalPages.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../../client/dist");
const adminDist = path.resolve(__dirname, "../../../admin/dist");

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
app.use(tenantResolver);

// Public routes (no auth required) — mounted before MCP OAuth middleware
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});
/** Public diagnostic; registered before `app.use("/api/tenant-requests")` and before `mountTenantScoped("/api", …)` so it never hits unauthenticated `requireAuth`. */
app.get("/api/tenant-requests/lookup-by-slug/:slug", tenantRequestLookupBySlugHandler);
app.use("/api/tenant-requests", tenantRequestsRouter);

app.get("/api/tenants/by-slug/:slug/public", async (req, res) => {
  try {
    const slug = normalizePublicTenantSlug(req.params.slug);
    if (!slug) {
      res.status(404).json({ error: "Workspace not found." });
      return;
    }
    // Unscoped client: never use extended `prisma` here (tenant ALS / row scoping must not affect control-plane Tenant).
    const tenant = await prismaUnscoped.tenant.findFirst({
      where: {
        slug: { equals: slug, mode: "insensitive" },
        status: "ACTIVE",
      },
      select: { name: true, slug: true, status: true },
    });
    if (!tenant) {
      console.warn("[tenants/by-slug/public] no active tenant", { slug });
      res.status(404).json({ error: "Workspace not found." });
      return;
    }
    res.json({ name: tenant.name, slug: tenant.slug });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

/** Public: instructions for coding agents (stdio MCP clients fetch this to append to tool output). */
app.get("/api/mcp/agent-context", async (_req, res) => {
  try {
    res.json(await buildMcpAgentContextJson());
  } catch {
    res.status(500).json({ error: "Failed to load agent context" });
  }
});

mountMcp(app);

function mountTenantScoped(path: string, router: express.Router): void {
  app.use(path, requireAuth, requireTenant, router);
}

app.use("/api/auth", authRouter);
mountTenantScoped("/api/meta", metaRouter);
mountTenantScoped("/api/initiatives", initiativesRouter);
mountTenantScoped("/api/features", featuresRouter);
mountTenantScoped("/api/decisions", decisionsRouter);
mountTenantScoped("/api/risks", risksRouter);
mountTenantScoped("/api/dependencies", dependenciesRouter);
mountTenantScoped("/api/products", productsRouter);
mountTenantScoped("/api", executionBoardsRouter);
mountTenantScoped("/api/accounts", accountsRouter);
mountTenantScoped("/api/partners", partnersRouter);
mountTenantScoped("/api/demands", demandsRouter);
mountTenantScoped("/api/requirements", requirementsRouter);
mountTenantScoped("/api/assignments", assignmentsRouter);
mountTenantScoped("/api/timeline", timelineRouter);
mountTenantScoped("/api/campaigns", campaignsRouter);
mountTenantScoped("/api/assets", assetsRouter);
mountTenantScoped("/api/campaign-links", campaignLinksRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin", importExportRouter);
app.use("/api/tenants", tenantsRouter);
mountTenantScoped("/api/domains", domainsRouter);
mountTenantScoped("/api/personas", personasRouter);
mountTenantScoped("/api/revenue-streams", revenueStreamsRouter);
mountTenantScoped("/api/milestones", milestonesRouter);
mountTenantScoped("/api/kpis", kpisRouter);
mountTenantScoped("/api/stakeholders", stakeholdersRouter);
mountTenantScoped("/api/messages", messagesRouter);
mountTenantScoped("/api/notification-subscriptions", notificationSubscriptionsRouter);
app.use("/api/me", meSessionRouter);
app.use("/api/me", meRouter);
app.use("/api/ontology", ontologyRouter);
app.use("/api/ui-settings", uiSettingsRouter);
app.use("/api/agent", agentGuideRouter);

app.get("/api/export/initiatives.csv", requireAuth, requireTenant, async (_req, res) => {
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

/** Public legal pages (same origin as API in production; Vite proxies /legal in dev). */
registerLegalRoutes(app);

if (env.NODE_ENV === "production") {
  // Separate SPA: SUPER_ADMIN tenant & registration console (not workspace /admin in main client).
  app.use("/platform", express.static(adminDist));
  app.get("/platform/*", (_req, res) => {
    res.sendFile(path.join(adminDist, "index.html"));
  });

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

async function bootstrap(): Promise<void> {
  try {
    await ensureSystemTenant();
    await refreshMcpFeedbackNoticeCache();
  } catch (err) {
    console.error("[startup] ensureSystemTenant / MCP feedback cache failed:", err);
  }
}

void bootstrap().then(() => {
  app.listen(Number(env.PORT), () => {
    console.log(`Server running on port ${env.PORT}`);
  });
});
