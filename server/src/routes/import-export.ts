import { Router } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../db.js";
import { requireRole } from "../middleware/auth.js";
import { logAudit } from "../services/audit.js";

export const importExportRouter = Router();
importExportRouter.use(requireRole(UserRole.SUPER_ADMIN, UserRole.ADMIN));

const EXPORT_VERSION = 1;

/* ── Export ────────────────────────────────────────────────────────── */

importExportRouter.get("/export", async (req, res) => {
  try {
    const [
      users,
      products,
      domains,
      personas,
      revenueStreams,
      accounts,
      partners,
      initiatives,
      features,
      requirements,
      demands,
      demandLinks,
      dependencies,
      campaigns,
      assets,
      campaignLinks,
    ] = await Promise.all([
      prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.product.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.domain.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.persona.findMany(),
      prisma.revenueStream.findMany(),
      prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.partner.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.initiative.findMany({
        include: {
          personaImpacts: true,
          revenueWeights: true,
          assignments: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.feature.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.requirement.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.demand.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.demandLink.findMany(),
      prisma.dependency.findMany(),
      prisma.campaign.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.asset.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.campaignLink.findMany(),
    ]);

    const decisions = await prisma.decision.findMany({ orderBy: { createdAt: "asc" } });
    const risks = await prisma.risk.findMany({ orderBy: { createdAt: "asc" } });

    const payload = {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      users,
      products,
      domains,
      personas,
      revenueStreams,
      accounts,
      partners,
      initiatives,
      features,
      requirements,
      decisions,
      risks,
      demands,
      demandLinks,
      dependencies,
      campaigns,
      assets,
      campaignLinks,
    };

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

  const required = [
    "users", "products", "domains", "personas", "revenueStreams",
    "accounts", "partners", "initiatives", "features", "requirements",
    "demands", "demandLinks", "dependencies", "campaigns", "assets", "campaignLinks",
  ] as const;

  for (const key of required) {
    if (!Array.isArray(data[key])) {
      res.status(400).json({ error: `Missing or invalid array: "${key}"` });
      return;
    }
  }

  try {
    const counts = await prisma.$transaction(async (tx) => {
      // 1. Delete everything in reverse dependency order
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
      await tx.initiativeRevenueStream.deleteMany();
      await tx.initiativePersonaImpact.deleteMany();
      await tx.initiative.deleteMany();
      await tx.product.deleteMany();
      await tx.domain.deleteMany();
      await tx.persona.deleteMany();
      await tx.revenueStream.deleteMany();
      await tx.user.deleteMany();

      const idMap = new Map<string, string>();

      // 2. Users
      for (const u of data.users) {
        const created = await tx.user.create({
          data: {
            email: u.email,
            name: u.name,
            avatarUrl: u.avatarUrl ?? null,
            role: u.role,
            isActive: u.isActive ?? true,
            googleId: u.googleId ?? null,
          },
        });
        idMap.set(u.id, created.id);
      }

      // 3. Products
      for (const p of data.products) {
        const created = await tx.product.create({
          data: { name: p.name, description: p.description ?? null, sortOrder: p.sortOrder ?? 0 },
        });
        idMap.set(p.id, created.id);
      }

      // 4. Domains
      for (const d of data.domains) {
        const created = await tx.domain.create({
          data: { name: d.name, color: d.color, sortOrder: d.sortOrder ?? 0 },
        });
        idMap.set(d.id, created.id);
      }

      // 5. Personas
      for (const p of data.personas) {
        const created = await tx.persona.create({
          data: { name: p.name, icon: p.icon ?? null, category: p.category ?? "NONE" },
        });
        idMap.set(p.id, created.id);
      }

      // 6. Revenue Streams
      for (const s of data.revenueStreams) {
        const created = await tx.revenueStream.create({
          data: { name: s.name, color: s.color },
        });
        idMap.set(s.id, created.id);
      }

      // 7. Accounts
      for (const a of data.accounts) {
        const created = await tx.account.create({
          data: {
            name: a.name,
            type: a.type,
            segment: a.segment ?? null,
            ownerId: mapId(idMap, a.ownerId),
            arrImpact: a.arrImpact ?? null,
            renewalDate: a.renewalDate ? new Date(a.renewalDate) : null,
            dealStage: a.dealStage ?? null,
            strategicTier: a.strategicTier ?? null,
          },
        });
        idMap.set(a.id, created.id);
      }

      // 8. Partners
      for (const p of data.partners) {
        const created = await tx.partner.create({
          data: {
            name: p.name,
            kind: p.kind,
            ownerId: mapId(idMap, p.ownerId),
          },
        });
        idMap.set(p.id, created.id);
      }

      // 9. Initiatives + nested sub-records
      for (const i of data.initiatives) {
        const created = await tx.initiative.create({
          data: {
            productId: mapId(idMap, i.productId),
            title: i.title,
            description: i.description ?? null,
            domainId: idMap.get(i.domainId)!,
            ownerId: mapId(idMap, i.ownerId),
            priority: i.priority,
            horizon: i.horizon,
            status: i.status,
            commercialType: i.commercialType,
            isGap: i.isGap ?? false,
            targetDate: i.targetDate ? new Date(i.targetDate) : null,
            startDate: i.startDate ? new Date(i.startDate) : null,
            milestoneDate: i.milestoneDate ? new Date(i.milestoneDate) : null,
            dateConfidence: i.dateConfidence ?? null,
            arrImpact: i.arrImpact ?? null,
            renewalDate: i.renewalDate ? new Date(i.renewalDate) : null,
            dealStage: i.dealStage ?? null,
            strategicTier: i.strategicTier ?? null,
            notes: i.notes ?? null,
            sortOrder: i.sortOrder ?? 0,
          },
        });
        idMap.set(i.id, created.id);

        // Persona impacts (nested in initiative export)
        if (Array.isArray(i.personaImpacts)) {
          for (const pi of i.personaImpacts) {
            const personaId = idMap.get(pi.personaId);
            if (personaId) {
              await tx.initiativePersonaImpact.create({
                data: { initiativeId: created.id, personaId, impact: pi.impact },
              });
            }
          }
        }

        // Revenue weights
        if (Array.isArray(i.revenueWeights)) {
          for (const rw of i.revenueWeights) {
            const streamId = idMap.get(rw.revenueStreamId);
            if (streamId) {
              await tx.initiativeRevenueStream.create({
                data: { initiativeId: created.id, revenueStreamId: streamId, weight: rw.weight },
              });
            }
          }
        }

        // Assignments
        if (Array.isArray(i.assignments)) {
          for (const a of i.assignments) {
            const userId = idMap.get(a.userId);
            if (userId) {
              await tx.initiativeAssignment.create({
                data: { initiativeId: created.id, userId, role: a.role, allocation: a.allocation ?? null },
              });
            }
          }
        }
      }

      // 10. Features
      for (const f of data.features) {
        const created = await tx.feature.create({
          data: {
            title: f.title,
            description: f.description ?? null,
            initiativeId: idMap.get(f.initiativeId)!,
            ownerId: mapId(idMap, f.ownerId),
            status: f.status ?? "IDEA",
            startDate: f.startDate ? new Date(f.startDate) : null,
            targetDate: f.targetDate ? new Date(f.targetDate) : null,
            milestoneDate: f.milestoneDate ? new Date(f.milestoneDate) : null,
            dateConfidence: f.dateConfidence ?? null,
            sortOrder: f.sortOrder ?? 0,
          },
        });
        idMap.set(f.id, created.id);
      }

      // 11. Requirements
      for (const r of data.requirements) {
        const created = await tx.requirement.create({
          data: {
            featureId: idMap.get(r.featureId)!,
            title: r.title,
            description: r.description ?? null,
            isDone: r.isDone ?? false,
            priority: r.priority ?? "P2",
          },
        });
        idMap.set(r.id, created.id);
      }

      // 12. Decisions
      const decisions = Array.isArray(data.decisions) ? data.decisions : [];
      for (const d of decisions) {
        await tx.decision.create({
          data: {
            title: d.title,
            rationale: d.rationale ?? null,
            impactedTeams: d.impactedTeams ?? null,
            initiativeId: idMap.get(d.initiativeId)!,
            decidedAt: d.decidedAt ? new Date(d.decidedAt) : null,
          },
        });
      }

      // 13. Risks
      const risks = Array.isArray(data.risks) ? data.risks : [];
      for (const r of risks) {
        await tx.risk.create({
          data: {
            title: r.title,
            probability: r.probability,
            impact: r.impact,
            mitigation: r.mitigation ?? null,
            ownerId: mapId(idMap, r.ownerId),
            initiativeId: idMap.get(r.initiativeId)!,
          },
        });
      }

      // 14. Demands
      for (const d of data.demands) {
        const created = await tx.demand.create({
          data: {
            title: d.title,
            description: d.description ?? null,
            sourceType: d.sourceType,
            status: d.status ?? "NEW",
            urgency: d.urgency ?? 3,
            accountId: mapId(idMap, d.accountId),
            partnerId: mapId(idMap, d.partnerId),
            ownerId: mapId(idMap, d.ownerId),
          },
        });
        idMap.set(d.id, created.id);
      }

      // 15. Demand Links
      for (const dl of data.demandLinks) {
        await tx.demandLink.create({
          data: {
            demandId: idMap.get(dl.demandId)!,
            initiativeId: mapId(idMap, dl.initiativeId),
            featureId: mapId(idMap, dl.featureId),
          },
        });
      }

      // 16. Dependencies
      for (const dep of data.dependencies) {
        const fromId = idMap.get(dep.fromInitiativeId);
        const toId = idMap.get(dep.toInitiativeId);
        if (fromId && toId) {
          await tx.dependency.create({
            data: { fromInitiativeId: fromId, toInitiativeId: toId, description: dep.description ?? null },
          });
        }
      }

      // 17. Campaigns
      for (const c of data.campaigns) {
        const created = await tx.campaign.create({
          data: {
            name: c.name,
            description: c.description ?? null,
            type: c.type,
            status: c.status ?? "DRAFT",
            startDate: c.startDate ? new Date(c.startDate) : null,
            endDate: c.endDate ? new Date(c.endDate) : null,
            budget: c.budget ?? null,
            ownerId: mapId(idMap, c.ownerId),
          },
        });
        idMap.set(c.id, created.id);
      }

      // 18. Assets
      for (const a of data.assets) {
        await tx.asset.create({
          data: {
            campaignId: idMap.get(a.campaignId)!,
            name: a.name,
            description: a.description ?? null,
            type: a.type,
            status: a.status ?? "DRAFT",
            url: a.url ?? null,
            personaId: mapId(idMap, a.personaId),
            partnerId: mapId(idMap, a.partnerId),
            accountId: mapId(idMap, a.accountId),
          },
        });
      }

      // 19. Campaign Links
      for (const cl of data.campaignLinks) {
        await tx.campaignLink.create({
          data: {
            campaignId: idMap.get(cl.campaignId)!,
            initiativeId: mapId(idMap, cl.initiativeId),
            featureId: mapId(idMap, cl.featureId),
            accountId: mapId(idMap, cl.accountId),
            partnerId: mapId(idMap, cl.partnerId),
          },
        });
      }

      return {
        users: data.users.length,
        products: data.products.length,
        domains: data.domains.length,
        personas: data.personas.length,
        revenueStreams: data.revenueStreams.length,
        accounts: data.accounts.length,
        partners: data.partners.length,
        initiatives: data.initiatives.length,
        features: data.features.length,
        requirements: data.requirements.length,
        decisions: decisions.length,
        risks: risks.length,
        demands: data.demands.length,
        demandLinks: data.demandLinks.length,
        dependencies: data.dependencies.length,
        campaigns: data.campaigns.length,
        assets: data.assets.length,
        campaignLinks: data.campaignLinks.length,
      };
    }, { timeout: 60_000 });

    await logAudit(req.user!.id, "CREATED", "IMPORT", undefined, { counts });

    res.json({ ok: true, counts });
  } catch (err) {
    console.error("Import failed:", err);
    res.status(500).json({ error: "Import failed. Transaction rolled back." });
  }
});

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
