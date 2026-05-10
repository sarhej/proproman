import { VcsProvider } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireWorkspaceStructureWrite } from "../middleware/workspaceAuth.js";
import { getTenantId } from "../tenant/requireTenant.js";
import { logAudit } from "../services/audit.js";
import { notifyAtlasAuxiliaryChange } from "../services/hubChangeHub.js";

const repoConnSchema = z.object({
  provider: z.nativeEnum(VcsProvider),
  baseUrl: z.string().optional(),
  owner: z.string().min(1),
  repo: z.string().min(1),
  displayName: z.string().nullable().optional(),
  webhookSecret: z.string().nullable().optional()
});

export const repositoryConnectionsRouter = Router();
repositoryConnectionsRouter.use(requireAuth);

repositoryConnectionsRouter.get("/", async (_req, res) => {
  const repositoryConnections = await prisma.repositoryConnection.findMany({
    orderBy: [{ owner: "asc" }, { repo: "asc" }]
  });
  const sanitized = repositoryConnections.map((r) => ({
    ...r,
    oauthAccessToken: r.oauthAccessToken ? "[set]" : null,
    oauthRefreshToken: r.oauthRefreshToken ? "[set]" : null
  }));
  res.json({ repositoryConnections: sanitized });
});

repositoryConnectionsRouter.post("/", requireWorkspaceStructureWrite(), async (req, res) => {
  const parsed = repoConnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  const row = await prisma.repositoryConnection.upsert({
    where: {
      tenantId_provider_owner_repo: {
        tenantId: getTenantId(req),
        provider: p.provider,
        owner: p.owner,
        repo: p.repo
      }
    },
    create: {
      provider: p.provider,
      baseUrl: p.baseUrl ?? "",
      owner: p.owner,
      repo: p.repo,
      displayName: p.displayName ?? null,
      webhookSecret: p.webhookSecret ?? null
    },
    update: {
      baseUrl: p.baseUrl ?? "",
      displayName: p.displayName ?? null,
      webhookSecret: p.webhookSecret !== undefined ? p.webhookSecret : undefined
    }
  });
  await logAudit(req.user!.id, "CREATED", "REPOSITORY_CONNECTION", row.id, { owner: row.owner, repo: row.repo });
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(201).json({
    repositoryConnection: {
      ...row,
      oauthAccessToken: row.oauthAccessToken ? "[set]" : null,
      oauthRefreshToken: row.oauthRefreshToken ? "[set]" : null
    }
  });
});

repositoryConnectionsRouter.put("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  const parsed = repoConnSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const p = parsed.data;
  const row = await prisma.repositoryConnection.update({
    where: { id },
    data: {
      baseUrl: p.baseUrl,
      displayName: p.displayName !== undefined ? p.displayName : undefined,
      webhookSecret: p.webhookSecret !== undefined ? p.webhookSecret : undefined
    }
  });
  await logAudit(req.user!.id, "UPDATED", "REPOSITORY_CONNECTION", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.json({
    repositoryConnection: {
      ...row,
      oauthAccessToken: row.oauthAccessToken ? "[set]" : null,
      oauthRefreshToken: row.oauthRefreshToken ? "[set]" : null
    }
  });
});

repositoryConnectionsRouter.delete("/:id", requireWorkspaceStructureWrite(), async (req, res) => {
  const id = String(req.params.id);
  await prisma.repositoryConnection.delete({ where: { id } });
  await logAudit(req.user!.id, "DELETED", "REPOSITORY_CONNECTION", id);
  notifyAtlasAuxiliaryChange(getTenantId(req));
  res.status(204).send();
});
