import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static checks on the hand-authored SDLC migration SQL (no database required).
 * Catches drift between migration file and plan: enums, tables, critical FKs, unique constraints.
 */
const MIGRATION_FILE = path.resolve(
  import.meta.dirname,
  "../../prisma/migrations/20260510180000_sdlc_ontology_integrations/migration.sql"
);

describe("SDLC migration SQL (static)", () => {
  const sql = fs.readFileSync(MIGRATION_FILE, "utf8");

  it("migration file exists and is non-trivial", () => {
    expect(sql.length).toBeGreaterThan(2000);
    expect(sql).toMatch(/CREATE TABLE/);
  });

  it("defines all SDLC enums", () => {
    const enums = [
      "AffectedEnvironment",
      "DeployedToStage",
      "WorkArtifactType",
      "DesignArtifactProvider",
      "VcsProvider",
      "ReleaseSource",
      "SecurityTopicCategory",
      "SecurityTopicStatus",
      "DemandSignalHint"
    ];
    for (const e of enums) {
      expect(sql).toMatch(new RegExp(`CREATE TYPE "${e}"`));
    }
  });

  it("extends Demand and Risk with signalHint default NONE", () => {
    expect(sql).toMatch(/ALTER TABLE "Demand" ADD COLUMN "signalHint"/);
    expect(sql).toMatch(/ALTER TABLE "Risk" ADD COLUMN "signalHint"/);
    expect(sql).toMatch(/DEFAULT 'NONE'/);
  });

  it("extends Feature and Requirement with deploy / env columns", () => {
    expect(sql).toMatch(/ALTER TABLE "Feature" ADD COLUMN "deployedToStage"/);
    expect(sql).toMatch(/ALTER TABLE "Requirement" ADD COLUMN "affectedEnvironment"/);
  });

  it("creates join and artifact tables with expected primary keys", () => {
    const tables = [
      "UseCase",
      "UseCaseInitiative",
      "UseCaseFeature",
      "SecurityTopic",
      "SecurityTopicInitiative",
      "SecurityTopicRisk",
      "SecurityTopicPartner",
      "RepositoryConnection",
      "WorkArtifactLink",
      "DesignArtifactLink",
      "Release",
      "ReleaseRequirement"
    ];
    for (const t of tables) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE "${t}"`));
    }
    expect(sql).toMatch(/CONSTRAINT "UseCaseInitiative_pkey" PRIMARY KEY \("useCaseId","initiativeId"\)/);
    expect(sql).toMatch(/CONSTRAINT "ReleaseRequirement_pkey" PRIMARY KEY \("releaseId","requirementId"\)/);
  });

  it("enforces unique (tenantId, provider, owner, repo) on RepositoryConnection", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "RepositoryConnection_tenantId_provider_owner_repo_key" ON "RepositoryConnection"/
    );
  });

  it("wires foreign keys with expected ON DELETE for hot paths", () => {
    expect(sql).toMatch(
      /"WorkArtifactLink_featureId_fkey" FOREIGN KEY \("featureId"\) REFERENCES "Feature"\("id"\) ON DELETE CASCADE/
    );
    expect(sql).toMatch(
      /"WorkArtifactLink_requirementId_fkey" FOREIGN KEY \("requirementId"\) REFERENCES "Requirement"\("id"\) ON DELETE CASCADE/
    );
    expect(sql).toMatch(
      /"WorkArtifactLink_repositoryConnectionId_fkey" FOREIGN KEY \("repositoryConnectionId"\) REFERENCES "RepositoryConnection"\("id"\) ON DELETE SET NULL/
    );
    expect(sql).toMatch(
      /"ReleaseRequirement_releaseId_fkey" FOREIGN KEY \("releaseId"\) REFERENCES "Release"\("id"\) ON DELETE CASCADE/
    );
  });

  it("does not drop legacy hub tables in this migration", () => {
    expect(sql.toUpperCase()).not.toMatch(/DROP TABLE\s+"Initiative"/i);
    expect(sql.toUpperCase()).not.toMatch(/DROP TABLE\s+"Feature"/i);
  });
});
