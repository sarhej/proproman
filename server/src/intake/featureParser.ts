import { env } from "../env.js";
import type { CreationPlan, PlanItem } from "./creationPlanSchema.js";
import {
  featureDraftSchema,
  normalizeFeatureDraft,
  normalizeFeatureIntakeDrafts,
  type FeatureDraft,
  type FeatureIntakeDrafts,
  type FeaturePriority
} from "./featureDraftSchema.js";

export type FeatureParserInput = {
  rawText: string;
  creationPlan: CreationPlan;
  clarificationAnswers?: Record<string, string> | null;
};

export type FeatureParserResult = {
  drafts: FeatureIntakeDrafts;
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
      if (
        /^(problem|solution|persona|users?|value|priority|acceptance|risk|depend|question|outcome)\s*[:\-]/i.test(
          line
        )
      ) {
        break;
      }
      if (line.trim()) out.push(line.trim());
    }
  }
  return out.join("\n").trim();
}

function extractListSection(text: string, labels: RegExp): string[] {
  const block = extractSection(text, labels);
  if (!block) return [];
  return block
    .split(/\n/)
    .map((l) => l.replace(/^[\s*•\-]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function extractAcceptanceCriteria(text: string): string[] {
  const fromHeader = extractListSection(
    text,
    /^(acceptance(?:\s+criteria)?|ac)\s*[:\-]\s*/i
  );
  if (fromHeader.length) return fromHeader;
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*•\-\d.)]+/, "").trim())
    .filter((l) => l.length > 8 && /\b(should|must|can|able to)\b/i.test(l))
    .slice(0, 6);
}

function detectPriority(
  text: string,
  answers?: Record<string, string> | null
): FeaturePriority {
  const kind = (answers?.kind ?? "").toLowerCase();
  if (kind.includes("discovery") || kind.includes("exploration")) return "DISCOVERY";
  const fromAnswer = (answers?.priority ?? "").toUpperCase();
  if (
    fromAnswer === "P0" ||
    fromAnswer === "P1" ||
    fromAnswer === "P2" ||
    fromAnswer === "P3" ||
    fromAnswer === "DISCOVERY"
  ) {
    return fromAnswer;
  }
  const t = text.toLowerCase();
  if (/\b(discovery|spike|explore|research|unclear|vague)\b/.test(t)) return "DISCOVERY";
  if (/\b(p0|critical|blocker|urgent)\b/.test(t)) return "P0";
  if (/\b(p1|high priority|must-have)\b/.test(t)) return "P1";
  if (/\b(p3|nice.to.have|low priority)\b/.test(t)) return "P3";
  return "P2";
}

function defaultAc(title: string): string[] {
  return [
    `User can complete the core flow for: ${title}`,
    "Behavior is covered by an automated or manual test note"
  ];
}

function featurePlanItems(plan: CreationPlan): PlanItem[] {
  return plan.items.filter(
    (i) =>
      i.hubEntityType === "Feature" &&
      (i.storyType === "FUNCTIONAL" ||
        i.storyType === "TECH_DEBT" ||
        i.storyType === "RESEARCH" ||
        i.storyType == null)
  );
}

function childRequirements(plan: CreationPlan, parentKey: string): PlanItem[] {
  return plan.items.filter((i) => i.hubEntityType === "Requirement" && i.parentKey === parentKey);
}

export function buildHeuristicFeatureDrafts(input: FeatureParserInput): FeatureIntakeDrafts {
  const text = input.rawText.trim();
  const features = featurePlanItems(input.creationPlan);
  const targets =
    features.length > 0
      ? features
      : [
          {
            key: "feat-1",
            hubEntityType: "Feature" as const,
            title: firstLineTitle(text, "Untitled feature"),
            storyType: "FUNCTIONAL" as const,
            parentKey: null,
            suggestedPriority: null
          }
        ];

  const priority = detectPriority(text, input.clarificationAnswers);
  const problem =
    extractSection(text, /^problem(?:\s+statement)?\s*[:\-]\s*/i) ||
    text.split(/\n/).slice(1).join("\n").trim() ||
    text;
  const solution = extractSection(text, /^(solution|proposal|approach)\s*[:\-]\s*/i);
  const personasFromText = extractListSection(text, /^(personas?|users?|actors?)\s*[:\-]\s*/i);
  const personaAnswer = input.clarificationAnswers?.persona?.trim();
  const personas =
    personasFromText.length > 0
      ? personasFromText
      : personaAnswer
        ? [personaAnswer]
        : [];
  const businessValue =
    extractSection(text, /^(business\s+value|value|why)\s*[:\-]\s*/i) ||
    input.clarificationAnswers?.outcome?.trim() ||
    "";
  const ac = extractAcceptanceCriteria(text);
  const risks = extractListSection(text, /^risks?\s*[:\-]\s*/i);
  const dependencies = extractListSection(text, /^dependenc(?:y|ies)\s*[:\-]\s*/i);
  const openQuestions = extractListSection(text, /^(open\s+questions?|questions?)\s*[:\-]\s*/i);
  const missingInputs: string[] = [];
  if (!personas.length) missingInputs.push("Primary persona");
  if (!businessValue) missingInputs.push("Business value / outcome");
  if (priority === "DISCOVERY") missingInputs.push("Success metric for Discovery spike");

  const rationale =
    priority === "DISCOVERY"
      ? "Input is exploratory or under-specified; draft as Discovery until scope clarifies."
      : `Priority ${priority} inferred from wording and clarification answers.`;

  const items: FeatureDraft[] = targets.map((item, idx) => {
    const planPriority =
      item.suggestedPriority === "P0" ||
      item.suggestedPriority === "P1" ||
      item.suggestedPriority === "P2" ||
      item.suggestedPriority === "P3" ||
      item.suggestedPriority === "DISCOVERY"
        ? item.suggestedPriority
        : priority;
    const title = item.title || firstLineTitle(text, "Untitled feature");
    const reqs = childRequirements(input.creationPlan, item.key).map((r) => ({
      key: r.key,
      title: r.title,
      description: "",
      approval: "pending" as const
    }));
    const storyType =
      item.storyType === "TECH_DEBT" || item.storyType === "RESEARCH"
        ? item.storyType
        : planPriority === "DISCOVERY"
          ? ("RESEARCH" as const)
          : ("FUNCTIONAL" as const);

    return normalizeFeatureDraft(
      featureDraftSchema.parse({
        key: item.key || `feat-${idx + 1}`,
        hubEntityType: "Feature",
        storyType,
        approval: "pending",
        fieldProvenance: {
          title: "ai",
          problem: "ai",
          solution: "ai",
          personas: "ai",
          businessValue: "ai",
          priority: "ai",
          priorityRationale: "ai",
          missingInputs: "ai",
          acceptanceCriteria: "ai",
          dependencies: "ai",
          risks: "ai",
          openQuestions: "ai"
        },
        title,
        problem: idx === 0 ? problem : title,
        solution: idx === 0 ? solution : "",
        personas: idx === 0 ? personas : [],
        businessValue: idx === 0 ? businessValue : "",
        priority: planPriority,
        priorityRationale: rationale,
        missingInputs: idx === 0 ? missingInputs : [],
        acceptanceCriteria: idx === 0 ? (ac.length ? ac : defaultAc(title)) : defaultAc(title),
        dependencies: idx === 0 ? dependencies : [],
        risks: idx === 0 ? risks : [],
        openQuestions: idx === 0 ? openQuestions : [],
        parentKey: item.parentKey ?? null,
        route: {
          initiativeId: item.routeHint?.initiativeId ?? null,
          featureId: item.routeHint?.featureId ?? null
        },
        requirements: reqs
      })
    );
  });

  return normalizeFeatureIntakeDrafts({
    items,
    source: "heuristic",
    generatedAt: new Date().toISOString()
  });
}

async function tryLlmFeatureDrafts(input: FeatureParserInput): Promise<FeatureIntakeDrafts | null> {
  if (!env.WORKSPACE_ATLAS_LLM_ENABLED || !env.WORKSPACE_ATLAS_OPENAI_API_KEY) return null;

  const system = `You are Tymio's feature intake parser. Return ONLY JSON:
{items:[{key, hubEntityType:"Feature", storyType:"FUNCTIONAL"|"TECH_DEBT"|"RESEARCH", title, problem, solution, personas[], businessValue, priority, priorityRationale, missingInputs[], acceptanceCriteria[], dependencies[], risks[], openQuestions[], parentKey?, requirements:[{key,title,description?}]}]}
Rules: priority P0|P1|P2|P3|DISCOVERY. Always include at least one acceptanceCriteria. Use DISCOVERY when vague. Keys must match plan Feature keys when provided. No markdown.`;

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
    normalizeFeatureDraft(
      featureDraftSchema.parse({
        ...(raw as object),
        hubEntityType: "Feature",
        approval: "pending",
        fieldProvenance: {
          title: "ai",
          problem: "ai",
          solution: "ai",
          personas: "ai",
          businessValue: "ai",
          priority: "ai",
          priorityRationale: "ai",
          missingInputs: "ai",
          acceptanceCriteria: "ai",
          dependencies: "ai",
          risks: "ai",
          openQuestions: "ai"
        }
      })
    )
  );

  return normalizeFeatureIntakeDrafts({
    items,
    source: "llm",
    generatedAt: new Date().toISOString()
  });
}

export async function parseFeatureDrafts(input: FeatureParserInput): Promise<FeatureParserResult> {
  try {
    const llm = await tryLlmFeatureDrafts(input);
    if (llm) return { drafts: llm, source: "llm" };
  } catch {
    /* fall through */
  }
  const drafts = buildHeuristicFeatureDrafts(input);
  return { drafts, source: "heuristic" };
}
