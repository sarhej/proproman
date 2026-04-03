import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { allocateUniqueProductSlug, tryParseProductSlug } from "../lib/productSlug.js";
import { requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

export const importExportRouter = Router();
/** Full DB export includes global `User` rows — platform super-admin only (not workspace ADMIN). */
importExportRouter.use(requireRole(UserRole.SUPER_ADMIN));

const EXPORT_VERSION = 1;

/* ── Export ────────────────────────────────────────────────────────── */

const ALL_ENTITY_KEYS = [
  "users", "products", "executionBoards", "executionColumns", "domains", "personas", "revenueStreams",
  "accounts", "partners", "initiatives", "features", "requirements",
  "decisions", "risks", "demands", "demandLinks", "dependencies",
  "campaigns", "assets", "campaignLinks",
  "milestones", "kpis", "stakeholders",
  "capabilities", "capabilityBindings", "compiledBriefs",
] as const;

type EntityKey = typeof ALL_ENTITY_KEYS[number];

function normalizeLabels(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
}

importExportRouter.get("/export", async (req, res) => {
  try {
    // ?entities=users,products,initiatives  (comma-separated, omit for all)
    const entitiesParam = typeof req.query.entities === "string" ? req.query.entities : "";
    const requested = new Set<EntityKey>(
      entitiesParam
        ? entitiesParam.split(",").filter((k): k is EntityKey => ALL_ENTITY_KEYS.includes(k as EntityKey))
        : [...ALL_ENTITY_KEYS]
    );

    const inc = (k: EntityKey) => requested.has(k);

    const fetchers: Record<EntityKey, () => Promise<unknown[]>> = {
      users: () => prisma.user.findMany({ include: { emails: true }, orderBy: { createdAt: "asc" } }),
      products: () => prisma.product.findMany({ orderBy: { sortOrder: "asc" } }),
      executionBoards: () => prisma.executionBoard.findMany({ orderBy: { createdAt: "asc" } }),
      executionColumns: () => prisma.executionColumn.findMany({ orderBy: [{ boardId: "asc" }, { sortOrder: "asc" }] }),
      domains: () => prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
      personas: () => prisma.persona.findMany(),
      revenueStreams: () => prisma.revenueStream.findMany(),
      accounts: () => prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
      partners: () => prisma.partner.findMany({ orderBy: { createdAt: "asc" } }),
      initiatives: () => prisma.initiative.findMany({ include: { personaImpacts: true, revenueWeights: true, assignments: true }, orderBy: { sortOrder: "asc" } }),
      features: () => prisma.feature.findMany({ orderBy: { sortOrder: "asc" } }),
      requirements: () => prisma.requirement.findMany({ orderBy: { createdAt: "asc" } }),
      decisions: () => prisma.decision.findMany({ orderBy: { createdAt: "asc" } }),
      risks: () => prisma.risk.findMany({ orderBy: { createdAt: "asc" } }),
      demands: () => prisma.demand.findMany({ orderBy: { createdAt: "asc" } }),
      demandLinks: () => prisma.demandLink.findMany(),
      dependencies: () => prisma.dependency.findMany(),
      campaigns: () => prisma.campaign.findMany({ orderBy: { createdAt: "asc" } }),
      assets: () => prisma.asset.findMany({ orderBy: { createdAt: "asc" } }),
      campaignLinks: () => prisma.campaignLink.findMany(),
      milestones: () => prisma.initiativeMilestone.findMany({ orderBy: { sequence: "asc" } }),
      kpis: () => prisma.initiativeKPI.findMany({ orderBy: { createdAt: "asc" } }),
      stakeholders: () => prisma.stakeholder.findMany({ orderBy: { createdAt: "asc" } }),
      capabilities: () => prisma.capability.findMany({ orderBy: [{ sortOrder: "asc" }, { slug: "asc" }] }),
      capabilityBindings: () => prisma.capabilityBinding.findMany({ orderBy: [{ bindingType: "asc" }, { bindingKey: "asc" }] }),
      compiledBriefs: () => prisma.compiledBrief.findMany({ orderBy: [{ format: "asc" }, { mode: "asc" }] }),
    };

    const payload: Record<string, unknown> = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
    };

    const keysToFetch = ALL_ENTITY_KEYS.filter(inc);
    const results = await Promise.all(keysToFetch.map((k) => fetchers[k]()));
    for (let i = 0; i < keysToFetch.length; i++) {
      payload[keysToFetch[i]] = results[i];
    }

    await logAudit(req.user!.id, "CREATED", "EXPORT", undefined, { entityCounts: summarize(payload) });

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="dd-export-${Date.now()}.json"`);
    res.json(payload);
  } catch (err) {
    console.error("Export failed:", err);
    res.status(500).json({ error: "Export failed" });
  }
});

/* ── Import ───────────────────────────────────────────────────────── */

importExportRouter.post("/import", async (req, res) => {
  const data = req.body;

  if (!data || data.version !== EXPORT_VERSION) {
    res.status(400).json({ error: `Invalid format. Expected version ${EXPORT_VERSION}.` });
    return;
  }

  const mode: "replace" | "merge" = data.mode === "merge" ? "merge" : "replace";

  // For replace mode, check that at least one entity array is provided
  if (mode === "replace") {
    const entityKeys = [
      "users", "products", "executionBoards", "executionColumns", "domains", "personas", "revenueStreams",
      "accounts", "partners", "initiatives", "features", "requirements",
      "demands", "demandLinks", "dependencies", "campaigns", "assets", "campaignLinks",
      "milestones", "kpis", "stakeholders",
    ];
    const hasAny = entityKeys.some((k) => Array.isArray(data[k]));
    if (!hasAny) {
      res.status(400).json({ error: "No entity arrays found in payload." });
      return;
    }
    // Validate that provided keys are actually arrays
    for (const key of entityKeys) {
      if (data[key] !== undefined && !Array.isArray(data[key])) {
        res.status(400).json({ error: `Invalid value for "${key}": expected array.` });
        return;
      }
    }
  }

  try {
    let counts: Record<string, number>;
    let auditUserId = req.user!.id;

    if (mode === "replace") {
      const currentEmail = req.user!.email;
      const result = await replaceImport(data);
      counts = result.counts;

      // Re-map session to the newly created user matching the caller's email
      if (Array.isArray(data.users)) {
        const newSelf = await prisma.user.findFirst({
          where: { emails: { some: { email: currentEmail } } },
        });
        if (newSelf) {
          auditUserId = newSelf.id;
          if (req.session) {
            (req.session as any).passport = { user: newSelf.id };
          }
        }
      }
    } else {
      counts = await mergeImport(data);
    }

    try {
      await logAudit(auditUserId, "CREATED", "IMPORT", undefined, { mode, counts });
    } catch {
      // Audit log is non-critical; don't fail the import
    }

    res.json({ ok: true, mode, counts });
  } catch (err) {
    console.error("Import failed:", err);
    res.status(500).json({ error: "Import failed. Transaction rolled back." });
  }
});

/* ── Replace import (original behavior) ───────────────────────────── */

async function replaceImport(data: any) {
  const has = (key: string) => Array.isArray(data[key]);

  return prisma.$transaction(async (tx) => {
    // Pre-load existing IDs for entities NOT being replaced so FK refs resolve
    const idMap = new Map<string, string>();

    if (!has("users")) {
      for (const u of await tx.user.findMany()) idMap.set(u.id, u.id);
    }
    if (!has("products")) {
      for (const p of await tx.product.findMany()) idMap.set(p.id, p.id);
    }
    if (!has("domains")) {
      for (const d of await tx.domain.findMany()) idMap.set(d.id, d.id);
    }
    if (!has("personas")) {
      for (const p of await tx.persona.findMany()) idMap.set(p.id, p.id);
    }
    if (!has("revenueStreams")) {
      for (const s of await tx.revenueStream.findMany()) idMap.set(s.id, s.id);
    }
    if (!has("accounts")) {
      for (const a of await tx.account.findMany()) idMap.set(a.id, a.id);
    }
    if (!has("partners")) {
      for (const p of await tx.partner.findMany()) idMap.set(p.id, p.id);
    }
    if (!has("initiatives")) {
      for (const i of await tx.initiative.findMany()) idMap.set(i.id, i.id);
    }
    if (!has("features")) {
      for (const f of await tx.feature.findMany()) idMap.set(f.id, f.id);
    }
    if (!has("demands")) {
      for (const d of await tx.demand.findMany()) idMap.set(d.id, d.id);
    }
    if (!has("campaigns")) {
      for (const c of await tx.campaign.findMany()) idMap.set(c.id, c.id);
    }

    // Delete only the entities being replaced (in FK-safe order)
    if (has("campaignLinks")) await tx.campaignLink.deleteMany();
    if (has("assets")) await tx.asset.deleteMany();
    if (has("campaigns")) { await tx.campaignLink.deleteMany(); await tx.asset.deleteMany(); await tx.campaign.deleteMany(); }
    if (has("demandLinks")) await tx.demandLink.deleteMany();
    if (has("demands")) { await tx.demandLink.deleteMany(); await tx.demand.deleteMany(); }
    if (has("dependencies")) await tx.dependency.deleteMany();
    if (has("risks")) await tx.risk.deleteMany();
    if (has("decisions")) await tx.decision.deleteMany();
    if (has("requirements")) await tx.requirement.deleteMany();
    if (has("features")) { await tx.requirement.deleteMany(); await tx.feature.deleteMany(); }
    if (has("initiatives")) {
      await tx.initiativeMilestone.deleteMany();
      await tx.initiativeKPI.deleteMany();
      await tx.stakeholder.deleteMany();
      await tx.initiativeAssignment.deleteMany();
      await tx.initiativeRevenueStream.deleteMany();
      await tx.initiativePersonaImpact.deleteMany();
      await tx.dependency.deleteMany();
      await tx.risk.deleteMany();
      await tx.decision.deleteMany();
      await tx.requirement.deleteMany();
      await tx.feature.deleteMany();
      await tx.initiative.deleteMany();
    }
    if (has("accounts")) { await tx.account.deleteMany(); }
    if (has("partners")) { await tx.partner.deleteMany(); }
    if (has("products")) await tx.product.deleteMany();
    if (has("domains")) await tx.domain.deleteMany();
    if (has("personas")) await tx.persona.deleteMany();
    if (has("revenueStreams")) await tx.revenueStream.deleteMany();
    if (has("users")) { await tx.userEmail.deleteMany(); await tx.user.deleteMany(); }

    // Re-create provided entities
    if (has("users")) {
      for (const u of data.users) {
        const created = await tx.user.create({
          data: {
            email: u.email, name: u.name, avatarUrl: u.avatarUrl ?? null,
            role: u.role, isActive: u.isActive ?? true, googleId: u.googleId ?? null,
            microsoftId: u.microsoftId ?? null,
          },
        });
        idMap.set(u.id, created.id);
        await tx.userEmail.create({ data: { email: u.email, userId: created.id, isPrimary: true } });
        if (Array.isArray(u.emails)) {
          for (const e of u.emails) {
            if (e.email !== u.email) {
              await tx.userEmail.create({ data: { email: e.email, userId: created.id, isPrimary: false } });
            }
          }
        }
      }
    }

    if (has("products")) {
      for (const p of data.products) {
        const tenantId = typeof p.tenantId === "string" ? p.tenantId : null;
        const slug = await allocateUniqueProductSlug(tx, {
          tenantId,
          fromName: p.name,
          explicitSlug: typeof p.slug === "string" ? p.slug : null
        });
        const created = await tx.product.create({
          data: {
            name: p.name,
            slug,
            description: p.description ?? null,
            sortOrder: p.sortOrder ?? 0,
            itemType: p.itemType ?? "PRODUCT"
          }
        });
        idMap.set(p.id, created.id);
      }
    }

    if (has("executionBoards")) {
      for (const b of data.executionBoards) {
        const productId = idMap.get(b.productId);
        if (!productId) continue;
        const created = await tx.executionBoard.create({
          data: {
            productId,
            name: b.name,
            provider: b.provider ?? "INTERNAL",
            isDefault: b.isDefault ?? false,
            syncState: b.syncState ?? "HEALTHY",
            externalRef: b.externalRef ?? null,
            config: b.config === undefined || b.config === null ? undefined : b.config
          }
        });
        idMap.set(b.id, created.id);
      }
    }

    if (has("executionColumns")) {
      for (const c of data.executionColumns) {
        const boardId = idMap.get(c.boardId);
        if (!boardId) continue;
        const created = await tx.executionColumn.create({
          data: {
            boardId,
            name: c.name,
            sortOrder: c.sortOrder ?? 0,
            mappedStatus: c.mappedStatus,
            isDefault: c.isDefault ?? false,
            externalRef: c.externalRef ?? null
          }
        });
        idMap.set(c.id, created.id);
      }
    }

    if (has("domains")) {
      for (const d of data.domains) {
        const created = await tx.domain.create({ data: { name: d.name, color: d.color, sortOrder: d.sortOrder ?? 0 } });
        idMap.set(d.id, created.id);
      }
    }

    if (has("personas")) {
      for (const p of data.personas) {
        const created = await tx.persona.create({ data: { name: p.name, icon: p.icon ?? null, category: p.category ?? "NONE" } });
        idMap.set(p.id, created.id);
      }
    }

    if (has("revenueStreams")) {
      for (const s of data.revenueStreams) {
        const created = await tx.revenueStream.create({ data: { name: s.name, color: s.color } });
        idMap.set(s.id, created.id);
      }
    }

    if (has("accounts")) {
      for (const a of data.accounts) {
        const created = await tx.account.create({
          data: {
            name: a.name, type: a.type, segment: a.segment ?? null,
            ownerId: mapId(idMap, a.ownerId), arrImpact: a.arrImpact ?? null,
            renewalDate: a.renewalDate ? new Date(a.renewalDate) : null,
            dealStage: a.dealStage ?? null, strategicTier: a.strategicTier ?? null,
          },
        });
        idMap.set(a.id, created.id);
      }
    }

    if (has("partners")) {
      for (const p of data.partners) {
        const created = await tx.partner.create({ data: { name: p.name, kind: p.kind, ownerId: mapId(idMap, p.ownerId) } });
        idMap.set(p.id, created.id);
      }
    }

    if (has("initiatives")) await importInitiatives(tx, data.initiatives, idMap);
    if (has("features")) await importFeatures(tx, data.features, idMap);
    if (has("requirements")) await importRequirements(tx, data.requirements, idMap);
    if (has("decisions")) await importDecisions(tx, data.decisions, idMap);
    if (has("risks")) await importRisks(tx, data.risks, idMap);
    if (has("demands")) await importDemands(tx, data.demands, idMap);
    if (has("demandLinks")) await importDemandLinks(tx, data.demandLinks, idMap);
    if (has("dependencies")) await importDependencies(tx, data.dependencies, idMap);
    if (has("campaigns")) await importCampaigns(tx, data.campaigns, idMap);
    if (has("assets")) await importAssets(tx, data.assets, idMap);
    if (has("campaignLinks")) await importCampaignLinks(tx, data.campaignLinks, idMap);

    if (has("milestones")) {
      await tx.initiativeMilestone.deleteMany();
      for (const m of data.milestones) {
        const initId = idMap.get(m.initiativeId);
        if (initId) {
          await tx.initiativeMilestone.create({
            data: {
              initiativeId: initId, title: m.title,
              description: m.description ?? null,
              targetDate: m.targetDate ? new Date(m.targetDate) : null,
              status: m.status ?? "TODO", sequence: m.sequence ?? 0,
              ownerId: mapId(idMap, m.ownerId),
            },
          });
        }
      }
    }

    if (has("kpis")) {
      await tx.initiativeKPI.deleteMany();
      for (const k of data.kpis) {
        const initId = idMap.get(k.initiativeId);
        if (initId) {
          await tx.initiativeKPI.create({
            data: {
              initiativeId: initId, title: k.title,
              targetValue: k.targetValue ?? null, currentValue: k.currentValue ?? null,
              unit: k.unit ?? null, targetDate: k.targetDate ? new Date(k.targetDate) : null,
            },
          });
        }
      }
    }

    if (has("stakeholders")) {
      await tx.stakeholder.deleteMany();
      for (const s of data.stakeholders) {
        const initId = idMap.get(s.initiativeId);
        if (initId) {
          await tx.stakeholder.create({
            data: {
              initiativeId: initId, name: s.name,
              role: s.role, type: s.type,
              organization: s.organization ?? null,
            },
          });
        }
      }
    }

    return { counts: buildCounts(data), idMap };
  }, { timeout: 60_000 });
}

/* ── Merge import ─────────────────────────────────────────────────── */

async function mergeImport(data: any) {
  return prisma.$transaction(async (tx) => {
    const idMap = new Map<string, string>();

    // Pre-load all existing records for natural-key matching
    const existingUsers = await tx.user.findMany({ include: { emails: true } });
    const existingProducts = await tx.product.findMany();
    const existingDomains = await tx.domain.findMany();
    const existingPersonas = await tx.persona.findMany();
    const existingStreams = await tx.revenueStream.findMany();
    const existingAccounts = await tx.account.findMany();
    const existingPartners = await tx.partner.findMany();
    const existingInitiatives = await tx.initiative.findMany();
    const existingFeatures = await tx.feature.findMany();
    const existingRequirements = await tx.requirement.findMany();
    const existingDecisions = await tx.decision.findMany();
    const existingRisks = await tx.risk.findMany();
    const existingDemands = await tx.demand.findMany();
    const existingCampaigns = await tx.campaign.findMany();

    // Map existing DB IDs so foreign keys resolve for non-imported entities
    for (const u of existingUsers) idMap.set(u.id, u.id);
    for (const p of existingProducts) idMap.set(p.id, p.id);
    for (const d of existingDomains) idMap.set(d.id, d.id);
    for (const p of existingPersonas) idMap.set(p.id, p.id);
    for (const s of existingStreams) idMap.set(s.id, s.id);
    for (const a of existingAccounts) idMap.set(a.id, a.id);
    for (const p of existingPartners) idMap.set(p.id, p.id);
    for (const i of existingInitiatives) idMap.set(i.id, i.id);
    for (const f of existingFeatures) idMap.set(f.id, f.id);
    for (const r of existingRequirements) idMap.set(r.id, r.id);
    for (const d of existingDecisions) idMap.set(d.id, d.id);
    for (const r of existingRisks) idMap.set(r.id, r.id);
    for (const d of existingDemands) idMap.set(d.id, d.id);
    for (const c of existingCampaigns) idMap.set(c.id, c.id);

    // Users
    if (Array.isArray(data.users)) {
      for (const u of data.users) {
        // Match by primary email or any alias
        const allEmails = [u.email, ...(Array.isArray(u.emails) ? u.emails.map((e: any) => e.email) : [])];
        let match = existingUsers.find(
          (eu) => eu.email === u.email || eu.emails.some((ae) => allEmails.includes(ae.email))
        );

        if (match) {
          await tx.user.update({
            where: { id: match.id },
            data: { name: u.name, role: u.role, isActive: u.isActive ?? true, avatarUrl: u.avatarUrl ?? null },
          });
          idMap.set(u.id, match.id);
          // Sync aliases
          if (Array.isArray(u.emails)) {
            for (const e of u.emails) {
              const exists = match.emails.find((ae) => ae.email === e.email);
              if (!exists) {
                const taken = await tx.userEmail.findUnique({ where: { email: e.email } });
                if (!taken) {
                  await tx.userEmail.create({ data: { email: e.email, userId: match.id, isPrimary: e.isPrimary ?? false } });
                }
              }
            }
          }
        } else {
          const created = await tx.user.create({
            data: {
              email: u.email, name: u.name, avatarUrl: u.avatarUrl ?? null,
              role: u.role, isActive: u.isActive ?? true, googleId: u.googleId ?? null,
              microsoftId: u.microsoftId ?? null,
            },
          });
          idMap.set(u.id, created.id);
          await tx.userEmail.create({ data: { email: u.email, userId: created.id, isPrimary: true } });
          if (Array.isArray(u.emails)) {
            for (const e of u.emails) {
              if (e.email !== u.email) {
                await tx.userEmail.create({ data: { email: e.email, userId: created.id, isPrimary: false } });
              }
            }
          }
        }
      }
    }

    // Products
    if (Array.isArray(data.products)) {
      for (const p of data.products) {
        const match = existingProducts.find((ep) => ep.name === p.name);
        const tenantId = match?.tenantId ?? (typeof p.tenantId === "string" ? p.tenantId : null);
        if (match) {
          const normalized = tryParseProductSlug(typeof p.slug === "string" ? p.slug : null);
          let nextSlug = match.slug;
          if (normalized && normalized !== match.slug) {
            const taken = await tx.product.findFirst({
              where: {
                tenantId: tenantId === null ? { equals: null } : tenantId,
                slug: normalized,
                NOT: { id: match.id }
              }
            });
            if (!taken) nextSlug = normalized;
          }
          await tx.product.update({
            where: { id: match.id },
            data: {
              slug: nextSlug,
              description: p.description ?? null,
              sortOrder: p.sortOrder ?? 0,
              itemType: p.itemType ?? "PRODUCT"
            }
          });
          idMap.set(p.id, match.id);
        } else {
          const slug = await allocateUniqueProductSlug(tx, {
            tenantId,
            fromName: p.name,
            explicitSlug: typeof p.slug === "string" ? p.slug : null
          });
          const created = await tx.product.create({
            data: {
              name: p.name,
              slug,
              description: p.description ?? null,
              sortOrder: p.sortOrder ?? 0,
              itemType: p.itemType ?? "PRODUCT"
            }
          });
          idMap.set(p.id, created.id);
        }
      }
    }

    // Domains
    if (Array.isArray(data.domains)) {
      for (const d of data.domains) {
        const match = existingDomains.find((ed) => ed.name === d.name);
        if (match) {
          await tx.domain.update({ where: { id: match.id }, data: { color: d.color, sortOrder: d.sortOrder ?? 0 } });
          idMap.set(d.id, match.id);
        } else {
          const created = await tx.domain.create({ data: { name: d.name, color: d.color, sortOrder: d.sortOrder ?? 0 } });
          idMap.set(d.id, created.id);
        }
      }
    }

    // Personas
    if (Array.isArray(data.personas)) {
      for (const p of data.personas) {
        const match = existingPersonas.find((ep) => ep.name === p.name);
        if (match) {
          await tx.persona.update({ where: { id: match.id }, data: { icon: p.icon ?? null, category: p.category ?? "NONE" } });
          idMap.set(p.id, match.id);
        } else {
          const created = await tx.persona.create({ data: { name: p.name, icon: p.icon ?? null, category: p.category ?? "NONE" } });
          idMap.set(p.id, created.id);
        }
      }
    }

    // Revenue Streams
    if (Array.isArray(data.revenueStreams)) {
      for (const s of data.revenueStreams) {
        const match = existingStreams.find((es) => es.name === s.name);
        if (match) {
          await tx.revenueStream.update({ where: { id: match.id }, data: { color: s.color } });
          idMap.set(s.id, match.id);
        } else {
          const created = await tx.revenueStream.create({ data: { name: s.name, color: s.color } });
          idMap.set(s.id, created.id);
        }
      }
    }

    // Accounts
    if (Array.isArray(data.accounts)) {
      for (const a of data.accounts) {
        const match = existingAccounts.find((ea) => ea.name === a.name);
        if (match) {
          await tx.account.update({
            where: { id: match.id },
            data: { type: a.type, segment: a.segment ?? null, ownerId: mapId(idMap, a.ownerId), arrImpact: a.arrImpact ?? null, renewalDate: a.renewalDate ? new Date(a.renewalDate) : null, dealStage: a.dealStage ?? null, strategicTier: a.strategicTier ?? null },
          });
          idMap.set(a.id, match.id);
        } else {
          const created = await tx.account.create({ data: { name: a.name, type: a.type, segment: a.segment ?? null, ownerId: mapId(idMap, a.ownerId), arrImpact: a.arrImpact ?? null, renewalDate: a.renewalDate ? new Date(a.renewalDate) : null, dealStage: a.dealStage ?? null, strategicTier: a.strategicTier ?? null } });
          idMap.set(a.id, created.id);
        }
      }
    }

    // Partners
    if (Array.isArray(data.partners)) {
      for (const p of data.partners) {
        const match = existingPartners.find((ep) => ep.name === p.name);
        if (match) {
          await tx.partner.update({ where: { id: match.id }, data: { kind: p.kind, ownerId: mapId(idMap, p.ownerId) } });
          idMap.set(p.id, match.id);
        } else {
          const created = await tx.partner.create({ data: { name: p.name, kind: p.kind, ownerId: mapId(idMap, p.ownerId) } });
          idMap.set(p.id, created.id);
        }
      }
    }

    // Initiatives (with nested sub-record replacement)
    if (Array.isArray(data.initiatives)) {
      for (const i of data.initiatives) {
        const match = existingInitiatives.find((ei) => ei.title === i.title);
        const initData = {
          productId: mapId(idMap, i.productId), title: i.title, description: i.description ?? null,
          domainId: idMap.get(i.domainId)!, ownerId: mapId(idMap, i.ownerId),
          priority: i.priority, horizon: i.horizon, status: i.status, commercialType: i.commercialType,
          isGap: i.isGap ?? false,
          isEpic: i.isEpic ?? false,
          targetDate: i.targetDate ? new Date(i.targetDate) : null,
          startDate: i.startDate ? new Date(i.startDate) : null,
          milestoneDate: i.milestoneDate ? new Date(i.milestoneDate) : null,
          dateConfidence: i.dateConfidence ?? null, arrImpact: i.arrImpact ?? null,
          renewalDate: i.renewalDate ? new Date(i.renewalDate) : null,
          dealStage: i.dealStage ?? null, strategicTier: i.strategicTier ?? null,
          notes: i.notes ?? null, sortOrder: i.sortOrder ?? 0,
        };

        let initId: string;
        if (match) {
          await tx.initiative.update({ where: { id: match.id }, data: initData });
          initId = match.id;
          // Replace nested sub-records
          await tx.initiativePersonaImpact.deleteMany({ where: { initiativeId: initId } });
          await tx.initiativeRevenueStream.deleteMany({ where: { initiativeId: initId } });
          await tx.initiativeAssignment.deleteMany({ where: { initiativeId: initId } });
        } else {
          const created = await tx.initiative.create({ data: initData });
          initId = created.id;
        }
        idMap.set(i.id, initId);

        if (Array.isArray(i.personaImpacts)) {
          for (const pi of i.personaImpacts) {
            const personaId = idMap.get(pi.personaId);
            if (personaId) await tx.initiativePersonaImpact.create({ data: { initiativeId: initId, personaId, impact: pi.impact } });
          }
        }
        if (Array.isArray(i.revenueWeights)) {
          for (const rw of i.revenueWeights) {
            const streamId = idMap.get(rw.revenueStreamId);
            if (streamId) await tx.initiativeRevenueStream.create({ data: { initiativeId: initId, revenueStreamId: streamId, weight: rw.weight } });
          }
        }
        if (Array.isArray(i.assignments)) {
          for (const a of i.assignments) {
            const userId = idMap.get(a.userId);
            if (userId) await tx.initiativeAssignment.create({ data: { initiativeId: initId, userId, role: a.role, allocation: a.allocation ?? null } });
          }
        }
      }
    }

    // Features
    if (Array.isArray(data.features)) {
      for (const f of data.features) {
        const resolvedInitId = idMap.get(f.initiativeId);
        const match = existingFeatures.find((ef) => ef.title === f.title && (resolvedInitId ? ef.initiativeId === resolvedInitId : true));
        const fData = {
          title: f.title, description: f.description ?? null,
          initiativeId: resolvedInitId!, ownerId: mapId(idMap, f.ownerId),
          status: f.status ?? "IDEA",
          startDate: f.startDate ? new Date(f.startDate) : null,
          targetDate: f.targetDate ? new Date(f.targetDate) : null,
          milestoneDate: f.milestoneDate ? new Date(f.milestoneDate) : null,
          dateConfidence: f.dateConfidence ?? null, sortOrder: f.sortOrder ?? 0,
          labels: normalizeLabels(f.labels),
        };
        if (match) {
          await tx.feature.update({ where: { id: match.id }, data: fData });
          idMap.set(f.id, match.id);
        } else {
          const created = await tx.feature.create({ data: fData });
          idMap.set(f.id, created.id);
        }
      }
    }

    // Requirements
    if (Array.isArray(data.requirements)) {
      for (const r of data.requirements) {
        const resolvedFeatId = idMap.get(r.featureId);
        const match = existingRequirements.find((er) => er.title === r.title && (resolvedFeatId ? er.featureId === resolvedFeatId : true));
        const rData = {
          featureId: resolvedFeatId!,
          title: r.title,
          description: r.description ?? null,
          status: r.status ?? "NOT_STARTED",
          isDone: r.isDone ?? false,
          priority: r.priority ?? "P2",
          labels: normalizeLabels(r.labels),
          executionColumnId: mapId(idMap, r.executionColumnId)
        };
        if (match) {
          await tx.requirement.update({ where: { id: match.id }, data: rData });
          idMap.set(r.id, match.id);
        } else {
          const created = await tx.requirement.create({ data: rData });
          idMap.set(r.id, created.id);
        }
      }
    }

    if (Array.isArray(data.decisions)) await importDecisions(tx, data.decisions, idMap);
    if (Array.isArray(data.risks)) await importRisks(tx, data.risks, idMap);

    // Demands
    if (Array.isArray(data.demands)) {
      for (const d of data.demands) {
        const match = existingDemands.find((ed) => ed.title === d.title);
        const dData = {
          title: d.title, description: d.description ?? null, sourceType: d.sourceType,
          status: d.status ?? "NEW", urgency: d.urgency ?? 3,
          accountId: mapId(idMap, d.accountId), partnerId: mapId(idMap, d.partnerId), ownerId: mapId(idMap, d.ownerId),
        };
        if (match) {
          await tx.demand.update({ where: { id: match.id }, data: dData });
          idMap.set(d.id, match.id);
        } else {
          const created = await tx.demand.create({ data: dData });
          idMap.set(d.id, created.id);
        }
      }
    }

    if (Array.isArray(data.demandLinks)) await importDemandLinks(tx, data.demandLinks, idMap);
    if (Array.isArray(data.dependencies)) await importDependencies(tx, data.dependencies, idMap);

    // Campaigns
    if (Array.isArray(data.campaigns)) {
      for (const c of data.campaigns) {
        const match = existingCampaigns.find((ec) => ec.name === c.name);
        const cData = {
          name: c.name, description: c.description ?? null, type: c.type,
          status: c.status ?? "DRAFT",
          startDate: c.startDate ? new Date(c.startDate) : null,
          endDate: c.endDate ? new Date(c.endDate) : null,
          budget: c.budget ?? null, ownerId: mapId(idMap, c.ownerId),
        };
        if (match) {
          await tx.campaign.update({ where: { id: match.id }, data: cData });
          idMap.set(c.id, match.id);
        } else {
          const created = await tx.campaign.create({ data: cData });
          idMap.set(c.id, created.id);
        }
      }
    }

    if (Array.isArray(data.assets)) await importAssets(tx, data.assets, idMap);
    if (Array.isArray(data.campaignLinks)) await importCampaignLinks(tx, data.campaignLinks, idMap);

    if (Array.isArray(data.milestones)) {
      for (const m of data.milestones) {
        const initId = idMap.get(m.initiativeId);
        if (!initId) continue;
        const existing = await tx.initiativeMilestone.findFirst({ where: { initiativeId: initId, title: m.title } });
        const mData = {
          initiativeId: initId, title: m.title,
          targetDate: m.targetDate ? new Date(m.targetDate) : null,
          status: m.status ?? "TODO", sequence: m.sequence ?? 0,
          ownerId: mapId(idMap, m.ownerId),
        };
        if (existing) {
          await tx.initiativeMilestone.update({ where: { id: existing.id }, data: mData });
        } else {
          await tx.initiativeMilestone.create({ data: mData });
        }
      }
    }

    if (Array.isArray(data.kpis)) {
      for (const k of data.kpis) {
        const initId = idMap.get(k.initiativeId);
        if (!initId) continue;
        const existing = await tx.initiativeKPI.findFirst({ where: { initiativeId: initId, title: k.title } });
        const kData = {
          initiativeId: initId, title: k.title,
          targetValue: k.targetValue ?? null, currentValue: k.currentValue ?? null,
          unit: k.unit ?? null, targetDate: k.targetDate ? new Date(k.targetDate) : null,
        };
        if (existing) {
          await tx.initiativeKPI.update({ where: { id: existing.id }, data: kData });
        } else {
          await tx.initiativeKPI.create({ data: kData });
        }
      }
    }

    if (Array.isArray(data.stakeholders)) {
      for (const s of data.stakeholders) {
        const initId = idMap.get(s.initiativeId);
        if (!initId) continue;
        const existing = await tx.stakeholder.findFirst({ where: { initiativeId: initId, name: s.name } });
        const sData = {
          initiativeId: initId, name: s.name,
          role: s.role, type: s.type,
          organization: s.organization ?? null,
        };
        if (existing) {
          await tx.stakeholder.update({ where: { id: existing.id }, data: sData });
        } else {
          await tx.stakeholder.create({ data: sData });
        }
      }
    }

    return buildCounts(data);
  }, { timeout: 60_000 });
}

/* ── Shared import helpers ────────────────────────────────────────── */

async function importInitiatives(tx: any, initiatives: any[], idMap: Map<string, string>) {
  for (const i of initiatives) {
    const created = await tx.initiative.create({
      data: {
        productId: mapId(idMap, i.productId), title: i.title, description: i.description ?? null,
        domainId: idMap.get(i.domainId)!, ownerId: mapId(idMap, i.ownerId),
        priority: i.priority, horizon: i.horizon, status: i.status, commercialType: i.commercialType,
        isGap: i.isGap ?? false,
        isEpic: i.isEpic ?? false,
        targetDate: i.targetDate ? new Date(i.targetDate) : null,
        startDate: i.startDate ? new Date(i.startDate) : null,
        milestoneDate: i.milestoneDate ? new Date(i.milestoneDate) : null,
        dateConfidence: i.dateConfidence ?? null, arrImpact: i.arrImpact ?? null,
        renewalDate: i.renewalDate ? new Date(i.renewalDate) : null,
        dealStage: i.dealStage ?? null, strategicTier: i.strategicTier ?? null,
        notes: i.notes ?? null, sortOrder: i.sortOrder ?? 0,
      },
    });
    idMap.set(i.id, created.id);

    if (Array.isArray(i.personaImpacts)) {
      for (const pi of i.personaImpacts) {
        const personaId = idMap.get(pi.personaId);
        if (personaId) await tx.initiativePersonaImpact.create({ data: { initiativeId: created.id, personaId, impact: pi.impact } });
      }
    }
    if (Array.isArray(i.revenueWeights)) {
      for (const rw of i.revenueWeights) {
        const streamId = idMap.get(rw.revenueStreamId);
        if (streamId) await tx.initiativeRevenueStream.create({ data: { initiativeId: created.id, revenueStreamId: streamId, weight: rw.weight } });
      }
    }
    if (Array.isArray(i.assignments)) {
      for (const a of i.assignments) {
        const userId = idMap.get(a.userId);
        if (userId) await tx.initiativeAssignment.create({ data: { initiativeId: created.id, userId, role: a.role, allocation: a.allocation ?? null } });
      }
    }
  }
}

async function importFeatures(tx: any, features: any[], idMap: Map<string, string>) {
  for (const f of features) {
    const created = await tx.feature.create({
      data: {
        title: f.title, description: f.description ?? null,
        initiativeId: idMap.get(f.initiativeId)!, ownerId: mapId(idMap, f.ownerId),
        status: f.status ?? "IDEA",
        startDate: f.startDate ? new Date(f.startDate) : null,
        targetDate: f.targetDate ? new Date(f.targetDate) : null,
        milestoneDate: f.milestoneDate ? new Date(f.milestoneDate) : null,
        dateConfidence: f.dateConfidence ?? null, sortOrder: f.sortOrder ?? 0,
        labels: normalizeLabels(f.labels),
      },
    });
    idMap.set(f.id, created.id);
  }
}

async function importRequirements(tx: any, requirements: any[], idMap: Map<string, string>) {
  for (const r of requirements) {
    const created = await tx.requirement.create({
      data: {
        featureId: idMap.get(r.featureId)!,
        title: r.title,
        description: r.description ?? null,
        status: r.status ?? "NOT_STARTED",
        isDone: r.isDone ?? false,
        priority: r.priority ?? "P2",
        labels: normalizeLabels(r.labels),
        assigneeId: mapId(idMap, r.assigneeId),
        dueDate: r.dueDate ? new Date(r.dueDate) : null,
        estimate: r.estimate ?? null,
        taskType: r.taskType ?? null,
        blockedReason: r.blockedReason ?? null,
        externalRef: r.externalRef ?? null,
        metadata: r.metadata === undefined || r.metadata === null ? undefined : r.metadata,
        sortOrder: r.sortOrder ?? 0,
        executionColumnId: mapId(idMap, r.executionColumnId)
      },
    });
    idMap.set(r.id, created.id);
  }
}

async function importDecisions(tx: any, decisions: any[] | undefined, idMap: Map<string, string>) {
  for (const d of (decisions ?? [])) {
    await tx.decision.create({
      data: { title: d.title, rationale: d.rationale ?? null, impactedTeams: d.impactedTeams ?? null, initiativeId: idMap.get(d.initiativeId)!, decidedAt: d.decidedAt ? new Date(d.decidedAt) : null },
    });
  }
}

async function importRisks(tx: any, risks: any[] | undefined, idMap: Map<string, string>) {
  for (const r of (risks ?? [])) {
    await tx.risk.create({
      data: { title: r.title, probability: r.probability, impact: r.impact, mitigation: r.mitigation ?? null, ownerId: mapId(idMap, r.ownerId), initiativeId: idMap.get(r.initiativeId)! },
    });
  }
}

async function importDemands(tx: any, demands: any[], idMap: Map<string, string>) {
  for (const d of demands) {
    const created = await tx.demand.create({
      data: { title: d.title, description: d.description ?? null, sourceType: d.sourceType, status: d.status ?? "NEW", urgency: d.urgency ?? 3, accountId: mapId(idMap, d.accountId), partnerId: mapId(idMap, d.partnerId), ownerId: mapId(idMap, d.ownerId) },
    });
    idMap.set(d.id, created.id);
  }
}

async function importDemandLinks(tx: any, demandLinks: any[], idMap: Map<string, string>) {
  for (const dl of demandLinks) {
    const demandId = idMap.get(dl.demandId);
    if (demandId) {
      await tx.demandLink.create({ data: { demandId, initiativeId: mapId(idMap, dl.initiativeId), featureId: mapId(idMap, dl.featureId) } });
    }
  }
}

async function importDependencies(tx: any, dependencies: any[], idMap: Map<string, string>) {
  for (const dep of dependencies) {
    const fromId = idMap.get(dep.fromInitiativeId);
    const toId = idMap.get(dep.toInitiativeId);
    if (fromId && toId) {
      await tx.dependency.create({ data: { fromInitiativeId: fromId, toInitiativeId: toId, description: dep.description ?? null } });
    }
  }
}

async function importCampaigns(tx: any, campaigns: any[], idMap: Map<string, string>) {
  for (const c of campaigns) {
    const created = await tx.campaign.create({
      data: { name: c.name, description: c.description ?? null, type: c.type, status: c.status ?? "DRAFT", startDate: c.startDate ? new Date(c.startDate) : null, endDate: c.endDate ? new Date(c.endDate) : null, budget: c.budget ?? null, ownerId: mapId(idMap, c.ownerId) },
    });
    idMap.set(c.id, created.id);
  }
}

async function importAssets(tx: any, assets: any[], idMap: Map<string, string>) {
  for (const a of assets) {
    const campaignId = idMap.get(a.campaignId);
    if (campaignId) {
      await tx.asset.create({
        data: { campaignId, name: a.name, description: a.description ?? null, type: a.type, status: a.status ?? "DRAFT", url: a.url ?? null, personaId: mapId(idMap, a.personaId), partnerId: mapId(idMap, a.partnerId), accountId: mapId(idMap, a.accountId) },
      });
    }
  }
}

async function importCampaignLinks(tx: any, campaignLinks: any[], idMap: Map<string, string>) {
  for (const cl of campaignLinks) {
    const campaignId = idMap.get(cl.campaignId);
    if (campaignId) {
      await tx.campaignLink.create({
        data: { campaignId, initiativeId: mapId(idMap, cl.initiativeId), featureId: mapId(idMap, cl.featureId), accountId: mapId(idMap, cl.accountId), partnerId: mapId(idMap, cl.partnerId) },
      });
    }
  }
}

/* ── Clear All Data ────────────────────────────────────────────────── */

importExportRouter.post("/clear", async (req, res) => {
  const currentUserId = req.user!.id;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.auditEntry.deleteMany();
      await tx.campaignLink.deleteMany();
      await tx.asset.deleteMany();
      await tx.campaign.deleteMany();
      await tx.initiativeAssignment.deleteMany();
      await tx.demandLink.deleteMany();
      await tx.demand.deleteMany();
      await tx.account.deleteMany();
      await tx.partner.deleteMany();
      await tx.dependency.deleteMany();
      await tx.risk.deleteMany();
      await tx.decision.deleteMany();
      await tx.requirement.deleteMany();
      await tx.feature.deleteMany();
      await tx.initiativeMilestone.deleteMany();
      await tx.initiativeKPI.deleteMany();
      await tx.stakeholder.deleteMany();
      await tx.initiativeRevenueStream.deleteMany();
      await tx.initiativePersonaImpact.deleteMany();
      await tx.initiative.deleteMany();
      await tx.product.deleteMany();
      await tx.domain.deleteMany();
      await tx.persona.deleteMany();
      await tx.revenueStream.deleteMany();
      await tx.userEmail.deleteMany({ where: { user: { id: { not: currentUserId } } } });
      await tx.user.deleteMany({ where: { id: { not: currentUserId } } });
    }, { timeout: 30_000 });

    await logAudit(currentUserId, "DELETED", "ALL_DATA", undefined, { action: "clear" });

    res.json({ ok: true, message: "All data cleared. Your user account was preserved." });
  } catch (err) {
    console.error("Clear failed:", err);
    res.status(500).json({ error: "Clear failed. Transaction rolled back." });
  }
});

/* ── Helpers ──────────────────────────────────────────────────────── */

function mapId(idMap: Map<string, string>, oldId: string | null | undefined): string | null {
  if (!oldId) return null;
  return idMap.get(oldId) ?? null;
}

function summarize(payload: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(payload)) {
    if (Array.isArray(val)) result[key] = val.length;
  }
  return result;
}

function buildCounts(data: any): Record<string, number> {
  const keys = [
    "users", "products", "executionBoards", "executionColumns", "domains", "personas", "revenueStreams", "accounts", "partners",
    "initiatives", "features", "requirements", "decisions", "risks",
    "demands", "demandLinks", "dependencies", "campaigns", "assets", "campaignLinks",
    "milestones", "kpis", "stakeholders",
    "capabilities", "capabilityBindings", "compiledBriefs",
  ];
  const result: Record<string, number> = {};
  for (const k of keys) {
    if (Array.isArray(data[k])) result[k] = data[k].length;
  }
  return result;
}
