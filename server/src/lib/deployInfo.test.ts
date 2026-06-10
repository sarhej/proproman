import { afterEach, describe, expect, it } from "vitest";
import { buildHealthPayload, readDeployInfo } from "./deployInfo.js";

describe("deployInfo", () => {
  afterEach(() => {
    delete process.env.RAILWAY_GIT_COMMIT_SHA;
    delete process.env.RAILWAY_GIT_BRANCH;
    delete process.env.RAILWAY_ENVIRONMENT_NAME;
    delete process.env.RAILWAY_DEPLOYMENT_ID;
    delete process.env.RAILWAY_SERVICE_NAME;
    delete process.env.GIT_SHA;
  });

  it("returns null when no sha env is set", () => {
    expect(readDeployInfo()).toBeNull();
    expect(buildHealthPayload()).toEqual({ ok: true });
  });

  it("reads Railway deploy metadata", () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = "abc123def456";
    process.env.RAILWAY_GIT_BRANCH = "main";
    process.env.RAILWAY_ENVIRONMENT_NAME = "production";
    expect(readDeployInfo()).toEqual({
      sha: "abc123def456",
      branch: "main",
      environment: "production",
    });
    expect(buildHealthPayload()).toEqual({
      ok: true,
      deploy: {
        sha: "abc123def456",
        branch: "main",
        environment: "production",
      },
    });
  });
});
