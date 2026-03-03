import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Pool } from "pg";
import { env } from "./env.js";
import "./auth/passport.js";
import { authRouter } from "./routes/auth.js";
import { initiativesRouter } from "./routes/initiatives.js";
import { metaRouter } from "./routes/meta.js";
import { featuresRouter } from "./routes/features.js";
import { decisionsRouter } from "./routes/decisions.js";
import { risksRouter } from "./routes/risks.js";
import { dependenciesRouter } from "./routes/dependencies.js";
import { prisma } from "./db.js";
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../client/dist");
const PgStore = connectPgSimple(session);
const pool = new Pool({ connectionString: env.DATABASE_URL });
app.use(cors({
    origin: env.CLIENT_URL,
    credentials: true
}));
app.use(express.json({ limit: "2mb" }));
app.set("trust proxy", 1);
app.use(session({
    store: new PgStore({
        pool,
        tableName: "session"
    }),
    name: "dd.sid",
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 14
    }
}));
app.use(passport.initialize());
app.use(passport.session());
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
        ...initiatives.map((i) => [
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
            .join(","))
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
app.use((err, _req, res, next) => {
    void next;
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
});
app.listen(Number(env.PORT), () => {
    console.log(`Server running on port ${env.PORT}`);
});
