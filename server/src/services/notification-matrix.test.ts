import { describe, expect, it } from "vitest";
import {
  notificationRuleMatchesEventKind,
  parseRuleDeliveryChannels,
} from "./notification-matrix.js";

describe("parseRuleDeliveryChannels", () => {
  it("defaults to IN_APP for empty or invalid", () => {
    expect(parseRuleDeliveryChannels(null)).toEqual(["IN_APP"]);
    expect(parseRuleDeliveryChannels(undefined)).toEqual(["IN_APP"]);
    expect(parseRuleDeliveryChannels({})).toEqual(["IN_APP"]);
    expect(parseRuleDeliveryChannels([])).toEqual(["IN_APP"]);
    expect(parseRuleDeliveryChannels(["UNKNOWN"])).toEqual(["IN_APP"]);
  });

  it("keeps valid channel names in order", () => {
    expect(parseRuleDeliveryChannels(["EMAIL", "IN_APP"])).toEqual(["EMAIL", "IN_APP"]);
    expect(parseRuleDeliveryChannels(["SLACK", "bogus", "WHATSAPP"])).toEqual(["SLACK", "WHATSAPP"]);
  });
});

describe("notificationRuleMatchesEventKind", () => {
  it("matches when rule has no event kind", () => {
    expect(notificationRuleMatchesEventKind(null, {})).toBe(true);
    expect(notificationRuleMatchesEventKind("", { eventKind: "x" })).toBe(true);
  });

  it("requires details.eventKind when rule sets one", () => {
    expect(notificationRuleMatchesEventKind("epic", {})).toBe(false);
    expect(notificationRuleMatchesEventKind("epic", { eventKind: "story" })).toBe(false);
    expect(notificationRuleMatchesEventKind("epic", { eventKind: "epic" })).toBe(true);
  });
});
