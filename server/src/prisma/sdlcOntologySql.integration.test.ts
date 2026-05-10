import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  CommercialType,
  DemandSignalHint,
  DemandSourceType,
  DemandStatus,
  FeatureStatus,
  Horizon,
  InitiativeStatus,
  Prisma,
  Priority,
  SecurityTopicCategory,
  SecurityTopicStatus,
  TaskStatus,
  VcsProvider,
  WorkArtifactType,
  DesignArtifactProvider,
  ReleaseSource
} from "@prisma/client";
import { prisma } from "../db.js";
import { slugify } from "../lib/productSlug.js";

/**
 * Postgres + Prisma integration tests for SDLC ontology migration (enums, constraints, cascades, raw SQL edge cases).
 *
 * Requires: RUN_DB_INTEGRATION_TESTS=1 and DATABASE_URL; schema must include migration
 * `20260510180000_sdlc_ontology_integrations` (`npx prisma migrate deploy` from server/).
 */
const enabled = process.env.RUN_DB_INTEGRATION_TESTS === "1";

describe.skipIf(!enabled)("SDLC ontology migration — SQL & Prisma integration", () => {
  let pool: Pool;
  let suffix: string;
  let domainId: string;
  let productId: string;
  let initiativeId: string;
  let featureId: string;
  let requirementId: string;
  let partnerId: string;
  let riskId: string;
  /** Synthetic tenant key for RepositoryConnection uniqueness (no FK to Tenant in schema). */
  let syntheticTenantKey: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for integration tests");
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    syntheticTenantKey = `sdlc-sql-it-${suffix}`;

    try {
      await seedFixture();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
        throw new Error(
          "[integration] Schema missing SDLC columns/tables. From server/: npx prisma migrate deploy"
        );
      }
      throw e;
    }
  });

  async function seedFixture() {
    const domain = await prisma.domain.create({
      data: { name: `SDL-Domain-${suffix}`, color: "#111111", sortOrder: 0 }
    });
    domainId = domain.id;

    const product = await prisma.product.create({
      data: { name: `SDL-Product-${suffix}`, slug: slugify(`sdl-product-${suffix}`), sortOrder: 0 }
    });
    productId = product.id;

    const initiative = await prisma.initiative.create({
      data: {
        productId,
        title: `SDL Initiative ${suffix}`,
        domainId,
        priority: Priority.P1,
        horizon: Horizon.NOW,
        status: InitiativeStatus.IN_PROGRESS,
        commercialType: CommercialType.CONTRACT_ENABLER
      }
    });
    initiativeId = initiative.id;

    const feature = await prisma.feature.create({
      data: { initiativeId, title: `SDL Feature ${suffix}`, sortOrder: 0, status: FeatureStatus.IDEA }
    });
    featureId = feature.id;

    const reqRow = await prisma.requirement.create({
      data: {
        featureId,
        title: `SDL Requirement ${suffix}`,
        priority: Priority.P2,
        status: TaskStatus.NOT_STARTED,
        isDone: false
      }
    });
    requirementId = reqRow.id;

    const partner = await prisma.partner.create({
      data: { name: `SDL Partner ${suffix}`, kind: "integration-test" }
    });
    partnerId = partner.id;

    const risk = await prisma.risk.create({
      data: {
        initiativeId,
        title: `SDL Risk ${suffix}`,
        probability: "MEDIUM",
        impact: "MEDIUM"
      }
    });
    riskId = risk.id;
  }

  afterAll(async () => {
    try {
      await prisma.releaseRequirement.deleteMany({
        where: { requirementId }
      });
      await prisma.release.deleteMany({ where: { tag: { startsWith: `sdl-tag-${suffix}` } } });
      await prisma.workArtifactLink.deleteMany({ where: { OR: [{ featureId }, { requirementId }] } });
      await prisma.designArtifactLink.deleteMany({ where: { OR: [{ featureId }, { requirementId }] } });
      await prisma.repositoryConnection.deleteMany({
        where: { tenantId: syntheticTenantKey }
      });
      await prisma.useCaseFeature.deleteMany({ where: { featureId } });
      await prisma.useCaseInitiative.deleteMany({ where: { initiativeId } });
      await prisma.useCase.deleteMany({ where: { title: { startsWith: `SDL UC ${suffix}` } } });
      await prisma.securityTopicPartner.deleteMany({ where: { partnerId } });
      await prisma.securityTopicRisk.deleteMany({ where: { riskId } });
      await prisma.securityTopicInitiative.deleteMany({ where: { initiativeId } });
      await prisma.securityTopic.deleteMany({ where: { title: { startsWith: `SDL Sec ${suffix}` } } });
      await prisma.risk.deleteMany({ where: { id: riskId } });
      await prisma.partner.deleteMany({ where: { id: partnerId } });
      await prisma.requirement.deleteMany({ where: { id: requirementId } });
      await prisma.feature.deleteMany({ where: { id: featureId } });
      await prisma.initiative.deleteMany({ where: { id: initiativeId } });
      await prisma.executionBoard.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.domain.deleteMany({ where: { id: domainId } });
    } finally {
      await pool.end().catch(() => {});
      await prisma.$disconnect().catch(() => {});
    }
  });

  it("PostgreSQL: SDLC enums exist", async () => {
    const { rows } = await pool.query<{ typname: string }>(
      `SELECT typname FROM pg_type WHERE typname = ANY($1::text[]) ORDER BY typname`,
      [
        [
          "AffectedEnvironment",
          "DeployedToStage",
          "WorkArtifactType",
          "DesignArtifactProvider",
          "VcsProvider",
          "ReleaseSource",
          "SecurityTopicCategory",
          "SecurityTopicStatus",
          "DemandSignalHint"
        ]
      ]
    );
    expect(rows.map((r) => r.typname)).toEqual([
      "AffectedEnvironment",
      "DemandSignalHint",
      "DeployedToStage",
      "DesignArtifactProvider",
      "ReleaseSource",
      "SecurityTopicCategory",
      "SecurityTopicStatus",
      "VcsProvider",
      "WorkArtifactType"
    ]);
  });

  it("PostgreSQL: SDLC tables exist in public schema", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name
      `,
      [
        [
          "DesignArtifactLink",
          "Release",
          "ReleaseRequirement",
          "RepositoryConnection",
          "SecurityTopic",
          "SecurityTopicInitiative",
          "SecurityTopicPartner",
          "SecurityTopicRisk",
          "UseCase",
          "UseCaseFeature",
          "UseCaseInitiative",
          "WorkArtifactLink"
        ]
      ]
    );
    expect(rows).toHaveLength(12);
  });

  it("Prisma: RepositoryConnection unique (tenantId, provider, owner, repo) rejects duplicate", async () => {
    const owner = `sdl-owner-${suffix}`;
    const repo = `sdl-repo-${suffix}`;
    const first = await prisma.repositoryConnection.create({
      data: {
        tenantId: syntheticTenantKey,
        provider: VcsProvider.GITHUB,
        owner,
        repo,
        baseUrl: ""
      }
    });
    expect(first.id).toBeTruthy();
    await expect(
      prisma.repositoryConnection.create({
        data: {
          tenantId: syntheticTenantKey,
          provider: VcsProvider.GITHUB,
          owner,
          repo,
          baseUrl: ""
        }
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("PostgreSQL edge case: multiple RepositoryConnection rows with NULL tenantId and same owner/repo are allowed (NULL distinct in UNIQUE)", async () => {
    const owner = `sdl-owner-null-${suffix}`;
    const repo = `sdl-repo-null-${suffix}`;
    const a = await prisma.repositoryConnection.create({
      data: { tenantId: null, provider: VcsProvider.GITLAB, owner, repo, baseUrl: "" }
    });
    const b = await prisma.repositoryConnection.create({
      data: { tenantId: null, provider: VcsProvider.GITLAB, owner, repo, baseUrl: "" }
    });
    expect(a.id).not.toBe(b.id);
    await prisma.repositoryConnection.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });

  it("Prisma: WorkArtifactLink rejects invalid featureId (FK)", async () => {
    const conn = await prisma.repositoryConnection.create({
      data: {
        tenantId: syntheticTenantKey,
        provider: VcsProvider.GITHUB,
        owner: `sdl-owner-fk-${suffix}`,
        repo: `sdl-repo-fk-${suffix}`,
        baseUrl: ""
      }
    });
    await expect(
      prisma.workArtifactLink.create({
        data: {
          repositoryConnectionId: conn.id,
          featureId: "nonexistent-feature-id-xxxxxxxx",
          artifactType: WorkArtifactType.PR,
          url: "https://github.com/o/r/pull/1"
        }
      })
    ).rejects.toMatchObject({ code: "P2003" });
    await prisma.repositoryConnection.delete({ where: { id: conn.id } });
  });

  it("Prisma: deleting Feature CASCADE deletes WorkArtifactLink rows", async () => {
    const feat = await prisma.feature.create({
      data: { initiativeId, title: `Cascade feature ${suffix}`, sortOrder: 99, status: FeatureStatus.IDEA }
    });
    const link = await prisma.workArtifactLink.create({
      data: {
        featureId: feat.id,
        artifactType: WorkArtifactType.PR,
        url: `https://example.com/pr/${suffix}`
      }
    });
    await prisma.feature.delete({ where: { id: feat.id } });
    const gone = await prisma.workArtifactLink.findUnique({ where: { id: link.id } });
    expect(gone).toBeNull();
  });

  it("Prisma: deleting RepositoryConnection SET NULL on WorkArtifactLink.repositoryConnectionId", async () => {
    const conn = await prisma.repositoryConnection.create({
      data: {
        tenantId: syntheticTenantKey,
        provider: VcsProvider.GITHUB,
        owner: `sdl-owner-setnull-${suffix}`,
        repo: `sdl-repo-setnull-${suffix}`,
        baseUrl: ""
      }
    });
    const link = await prisma.workArtifactLink.create({
      data: {
        featureId,
        repositoryConnectionId: conn.id,
        artifactType: WorkArtifactType.ISSUE,
        url: `https://github.com/o/r/issues/1-${suffix}`
      }
    });
    await prisma.repositoryConnection.delete({ where: { id: conn.id } });
    const updated = await prisma.workArtifactLink.findUnique({ where: { id: link.id } });
    expect(updated?.repositoryConnectionId).toBeNull();
    await prisma.workArtifactLink.delete({ where: { id: link.id } });
  });

  it("PostgreSQL: duplicate ReleaseRequirement primary key fails (23505)", async () => {
    const rel = await prisma.release.create({
      data: {
        tenantId: syntheticTenantKey,
        tag: `sdl-tag-${suffix}`,
        name: `SDL Release ${suffix}`,
        source: ReleaseSource.MANUAL
      }
    });
    await prisma.releaseRequirement.create({
      data: { releaseId: rel.id, requirementId }
    });
    await expect(
      pool.query(
        `INSERT INTO "ReleaseRequirement" ("releaseId", "requirementId") VALUES ($1, $2)`,
        [rel.id, requirementId]
      )
    ).rejects.toMatchObject({ code: "23505" });
    await prisma.release.delete({ where: { id: rel.id } });
  });

  it("Raw SQL: invalid enum literal for WorkArtifactType is rejected", async () => {
    await expect(
      pool.query(
        `INSERT INTO "WorkArtifactLink" ("id","tenantId","featureId","artifactType","url","createdAt","updatedAt")
         VALUES ($1, null, $2, $3::"WorkArtifactType", $4, NOW(), NOW())`,
        [ `sdl-wal-bad-${suffix}`, featureId, "NOT_A_VALID_ENUM_VALUE", "https://example.com" ]
      )
    ).rejects.toThrow(/invalid input value for enum/i);
  });

  it("Raw SQL: Demand.signalHint accepts valid enum and rejects invalid", async () => {
    const d = await prisma.demand.create({
      data: {
        title: `SDL Demand ${suffix}`,
        sourceType: DemandSourceType.INTERNAL,
        status: DemandStatus.NEW,
        signalHint: DemandSignalHint.MONITORING
      }
    });
    const { rows } = await pool.query<{ signalHint: string }>(
      `SELECT "signalHint"::text FROM "Demand" WHERE id = $1`,
      [d.id]
    );
    expect(rows[0]?.signalHint).toBe("MONITORING");

    await expect(
      pool.query(`UPDATE "Demand" SET "signalHint" = $1::"DemandSignalHint" WHERE id = $2`, [
        "INVALID_HINT",
        d.id
      ])
    ).rejects.toThrow(/invalid input value for enum/i);

    await prisma.demand.delete({ where: { id: d.id } });
  });

  it("Prisma: UseCase CASCADE deletes join rows", async () => {
    const uc = await prisma.useCase.create({
      data: {
        title: `SDL UC ${suffix}`,
        priority: Priority.P2,
        initiativeLinks: { create: [{ initiativeId }] },
        featureLinks: { create: [{ featureId }] }
      },
      include: { initiativeLinks: true, featureLinks: true }
    });
    expect(uc.initiativeLinks.length).toBe(1);
    await prisma.useCase.delete({ where: { id: uc.id } });
    const ij = await prisma.useCaseInitiative.findMany({ where: { useCaseId: uc.id } });
    const fj = await prisma.useCaseFeature.findMany({ where: { useCaseId: uc.id } });
    expect(ij).toHaveLength(0);
    expect(fj).toHaveLength(0);
  });

  it("Prisma: SecurityTopicPartner rows removed when Partner deleted (FK CASCADE)", async () => {
    const ephemeralPartner = await prisma.partner.create({
      data: { name: `SDL Ephemeral Partner ${suffix}`, kind: "integration-test" }
    });
    const st = await prisma.securityTopic.create({
      data: {
        title: `SDL Sec partner-cascade ${suffix}`,
        category: SecurityTopicCategory.DATA,
        status: SecurityTopicStatus.PLANNED,
        partnerLinks: { create: [{ partnerId: ephemeralPartner.id }] }
      }
    });
    await prisma.partner.delete({ where: { id: ephemeralPartner.id } });
    const links = await prisma.securityTopicPartner.findMany({ where: { securityTopicId: st.id } });
    expect(links).toHaveLength(0);
    await prisma.securityTopic.delete({ where: { id: st.id } });
  });

  it("Prisma: DesignArtifactLink CASCADE-deleted when Requirement deleted", async () => {
    const reqTemp = await prisma.requirement.create({
      data: {
        featureId,
        title: `SDL temp req dal ${suffix}`,
        priority: Priority.P2,
        status: TaskStatus.NOT_STARTED,
        isDone: false
      }
    });
    const dal = await prisma.designArtifactLink.create({
      data: {
        requirementId: reqTemp.id,
        provider: DesignArtifactProvider.FIGMA,
        url: `https://figma.com/file/x-${suffix}`
      }
    });
    await prisma.requirement.delete({ where: { id: reqTemp.id } });
    expect(await prisma.designArtifactLink.findUnique({ where: { id: dal.id } })).toBeNull();
  });
});
