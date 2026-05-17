import { describe, expect, it } from "vitest";
import { GitActivityKind } from "@prisma/client";
import {
  parseGithubWebhookActivities,
  parseGitlabWebhookActivities
} from "../services/gitActivityIngest.js";

describe("parseGithubWebhookActivities", () => {
  it("parses push events", () => {
    const drafts = parseGithubWebhookActivities("push", "del-1", {
      ref: "refs/heads/main",
      pusher: { name: "alice" },
      head_commit: {
        id: "abc123",
        message: "feat: atlas hub\n\nbody",
        url: "https://github.com/o/r/commit/abc123",
        timestamp: "2026-05-17T12:00:00Z"
      }
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      kind: GitActivityKind.PUSH,
      action: "push",
      deliveryId: "push:del-1",
      branch: "main",
      title: "feat: atlas hub",
      authorLogin: "alice",
      commitSha: "abc123"
    });
  });

  it("parses pull_request events", () => {
    const drafts = parseGithubWebhookActivities("pull_request", "del-2", {
      action: "opened",
      pull_request: {
        number: 42,
        title: "Atlas connections",
        html_url: "https://github.com/o/r/pull/42",
        updated_at: "2026-05-17T13:00:00Z",
        user: { login: "bob" },
        head: { ref: "feature/atlas", sha: "deadbeef" }
      }
    });
    expect(drafts[0]).toMatchObject({
      kind: GitActivityKind.PULL_REQUEST,
      action: "opened",
      prNumber: 42,
      branch: "feature/atlas",
      authorLogin: "bob"
    });
  });

  it("ignores unrelated events", () => {
    expect(parseGithubWebhookActivities("ping", "del-3", {})).toEqual([]);
  });
});

describe("parseGitlabWebhookActivities", () => {
  it("parses push hook", () => {
    const drafts = parseGitlabWebhookActivities("Push Hook", "gl-1", {
      ref: "refs/heads/main",
      user_name: "carol",
      commits: [{ id: "c1", message: "fix", url: "https://gitlab.com/o/r/-/commit/c1" }]
    });
    expect(drafts[0]?.kind).toBe(GitActivityKind.PUSH);
    expect(drafts[0]?.branch).toBe("main");
  });

  it("parses merge request hook", () => {
    const drafts = parseGitlabWebhookActivities("Merge Request Hook", "gl-2", {
      user: { username: "dana" },
      object_attributes: {
        action: "open",
        iid: 7,
        title: "MR title",
        source_branch: "dev",
        url: "https://gitlab.com/o/r/-/merge_requests/7",
        updated_at: "2026-05-17T14:00:00Z",
        last_commit: { id: "sha" }
      }
    });
    expect(drafts[0]).toMatchObject({
      kind: GitActivityKind.PULL_REQUEST,
      action: "open",
      prNumber: 7,
      authorLogin: "dana"
    });
  });
});
