import { env } from "../env.js";
import type { CreationPlan, PlanItem } from "./creationPlanSchema.js";
import {
  bugDraftSchema,
  normalizeBugDraft,
  normalizeIntakeDrafts,
  severityToPriority,
  type BugDraft,
  type BugSeverity,
  type IntakeDrafts
} from "./bugDraftSchema.js";

export type BugParserInput = {
  rawText: string;
  creationPlan: CreationPlan;
  clarificationAnswers?: Record<string, string> | null;
};

export type BugParserResult = {
  drafts: IntakeDrafts;
  source: "heuristic" | "llm";
};

function firstLineTitle(text: string, fallback: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*•\-\d.)]+/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return fallback;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

function extractSection(text: string, labels: RegExp): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let collecting = false;
  const out: string[] = [];
  for (const line of lines) {
    if (labels.test(line)) {
      collecting = true;
      const after = line.replace(labels, "").trim();
      if (after) out.push(after);
      continue;
    }
    if (collecting) {
      if (/^(steps|expected|actual|environment|severity|priority|repro|title|description)\s*[:\-]/i.test(line)) {
        break;
      }
      if (line.trim()) out.push(line.trim());
    }
  }
  return out.join("\n").trim();
}

function extractSteps(text: string): string[] {
  const block = extractSection(
    text,
    /^(steps(?:\s+to\s+reproduce)?|repro(?:duction)?(?:\s+steps)?)\s*[:\-]\s*/i
  );
  if (!block) {
    const numbered = text
      .split(/\n/)
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter((l) => l.length > 3 && /tap|click|open|go to|navigate|select|enter/i.test(l));
    return numbered.slice(0, 8);
  }
  return block
    .split(/\n/)
    .map((l) => l.replace(/^[\s*•\-]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function detectSeverity(text: string, answers?: Record<string, string> | null): BugSeverity {
  const fromAnswer = (answers?.severity ?? "").toUpperCase();
  if (fromAnswer === "CRITICAL" || fromAnswer === "HIGH" || fromAnswer === "MEDIUM" || fromAnswer === "LOW") {
    return fromAnswer;
  }
  const t = text.toLowerCase();
  if (/\b(critical|blocker|p0|sev[\s-]?0|data loss|security)\b/.test(t)) return "CRITICAL";
  if (/\b(high|sev[\s-]?1|urgent|broken|crash|cannot|can't login)\b/.test(t)) return "HIGH";
  if (/\b(low|minor|cosmetic|nit|typo)\b/.test(t)) return "LOW";
  return "MEDIUM";
}

function extractAcceptanceCriteria(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*•\-\d.)]+/, "").trim())
    .filter((l) => l.length > 8 && /\b(should|must|expect|acceptance)\b/i.test(l))
    .slice(0, 6);
}

function bugPlanItems(plan: CreationPlan): PlanItem[] {
  return plan.items.filter((i) => i.hubEntityType === "Feature" && i.storyType === "BUG");
}

function childRequirements(plan: CreationPlan, parentKey: string): PlanItem[] {
  return plan.items.filter((i) => i.hubEntityType === "Requirement" && i.parentKey === parentKey);
}

export function buildHeuristicBugDrafts(input: BugParserInput): IntakeDrafts {
  const text = input.rawText.trim();
  const bugs = bugPlanItems(input.creationPlan);
  const targets =
    bugs.length > 0
      ? bugs
      : [
          {
            key: "bug-1",
            hubEntityType: "Feature" as const,
            title: firstLineTitle(text, "Untitled bug"),
            storyType: "BUG" as const,
            parentKey: null,
            bugSeverity: null,
            suggestedPriority: null
          }
        ];

  const severity = detectSeverity(text, input.clarificationAnswers);
  const steps = extractSteps(text);
  const expected = extractSection(text, /^expected(?:\s+result)?\s*[:\-]\s*/i);
  const actual = extractSection(text, /^actual(?:\s+result)?\s*[:\-]\s*/i);
  const environment = extractSection(text, /^environment\s*[:\-]\s*/i);
  const ac = extractAcceptanceCriteria(text);
  const description =
    text
      .split(/\n/)
      .slice(1)
      .join("\n")
      .trim() || text;

  const items: BugDraft[] = targets.map((item, idx) => {
    const sev =
      item.bugSeverity === "CRITICAL" ||
      item.bugSeverity === "HIGH" ||
      item.bugSeverity === "MEDIUM" ||
      item.bugSeverity === "LOW"
        ? item.bugSeverity
        : severity;
    const reqs = childRequirements(input.creationPlan, item.key).map((r) => ({
      key: r.key,
      title: r.title,
      description: "",
      approval: "pending" as const
    }));

    return normalizeBugDraft(
      bugDraftSchema.parse({
        key: item.key || `bug-${idx + 1}`,
        hubEntityType: "Feature",
        storyType: "BUG",
        approval: "pending",
        fieldProvenance: {
          title: "ai",
          description: "ai",
          severity: "ai",
          priority: "ai",
          stepsToReproduce: "ai",
          expected: "ai",
          actual: "ai",
          environment: "ai",
          acceptanceCriteria: "ai",
          affectedArea: "ai"
        },
        title: item.title || firstLineTitle(text, "Untitled bug"),
        description: idx === 0 ? description : item.title,
        stepsToReproduce: idx === 0 ? steps : [],
        expected: idx === 0 ? expected : "",
        actual: idx === 0 ? actual : "",
        environment: idx === 0 ? environment : "",
        severity: sev,
        priority: severityToPriority(sev),
        acceptanceCriteria: idx === 0 ? ac : [],
        affectedArea: "",
        parentKey: item.parentKey ?? null,
        route: {
          initiativeId: item.routeHint?.initiativeId ?? null,
          featureId: item.routeHint?.featureId ?? null
        },
        requirements: reqs
      })
    );
  });

  return normalizeIntakeDrafts({
    items,
    source: "heuristic",
    generatedAt: new Date().toISOString()
  });
}

async function tryLlmBugDrafts(input: BugParserInput): Promise<IntakeDrafts | null> {
  if (!env.WORKSPACE_ATLAS_LLM_ENABLED || !env.WORKSPACE_ATLAS_OPENAI_API_KEY) return null;

  const system = `You are Tymio's bug intake parser. Return ONLY JSON:
{items:[{key, hubEntityType:"Feature", storyType:"BUG", title, description, stepsToReproduce[], expected, actual, environment, severity, priority, acceptanceCriteria[], affectedArea, parentKey?, route?, requirements:[{key,title,description?}]}]}
Rules: severity CRITICAL|HIGH|MEDIUM|LOW; priority must match severity defaults (CRITICAL=P0,HIGH=P1,MEDIUM=P2,LOW=P3) unless text contradicts. Keys must match plan bug Feature keys when provided. No markdown.`;

  const user = JSON.stringify({
    rawText: input.rawText.slice(0, 12_000),
    clarificationAnswers: input.clarificationAnswers ?? null,
    planItems: input.creationPlan.items
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WORKSPACE_ATLAS_OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.WORKSPACE_ATLAS_OPENAI_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content;
  if (!text) return null;
  const json = JSON.parse(text) as { items?: unknown[] };
  if (!Array.isArray(json.items) || json.items.length === 0) return null;

  const items = json.items.map((raw) =>
    normalizeBugDraft(
      bugDraftSchema.parse({
        ...(raw as object),
        hubEntityType: "Feature",
        storyType: "BUG",
        approval: "pending",
        fieldProvenance: {
          title: "ai",
          description: "ai",
          severity: "ai",
          priority: "ai",
          stepsToReproduce: "ai",
          expected: "ai",
          actual: "ai",
          environment: "ai",
          acceptanceCriteria: "ai",
          affectedArea: "ai"
        }
      })
    )
  );

  return normalizeIntakeDrafts({
    items,
    source: "llm",
    generatedAt: new Date().toISOString()
  });
}

export async function parseBugDrafts(input: BugParserInput): Promise<BugParserResult> {
  try {
    const llm = await tryLlmBugDrafts(input);
    if (llm) return { drafts: llm, source: "llm" };
  } catch {
    /* fall through */
  }
  const drafts = buildHeuristicBugDrafts(input);
  return { drafts, source: "heuristic" };
}
