import { IntakeMode } from "@prisma/client";
import { env } from "../env.js";
import {
  creationPlanSchema,
  normalizeCreationPlan,
  type ClarificationQuestion,
  type CreationPlan,
  type PlanItem
} from "./creationPlanSchema.js";

export type PlannerInput = {
  mode: IntakeMode;
  rawText: string;
  productName?: string | null;
  clarificationAnswers?: Record<string, string> | null;
};

export type PlannerResult = {
  plan: CreationPlan;
  source: "heuristic" | "llm";
};

function slugKey(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

function firstLineTitle(text: string, fallback: string): string {
  const line = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*•\-\d.)]+/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return fallback;
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/** Split into candidate idea chunks (blank lines / numbered / bullets). */
export function splitIdeaChunks(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const numbered = normalized.split(/\n(?=\s*\d+[.)]\s+)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length >= 2) return numbered;

  const bullets = normalized.split(/\n(?=\s*[-*•]\s+)/).map((s) => s.trim()).filter(Boolean);
  if (bullets.length >= 2) return bullets;

  const paras = normalized.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  if (paras.length >= 2) return paras;

  return [normalized];
}

function isVague(text: string): boolean {
  const t = text.trim();
  if (t.length < 24) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 5) return true;
  const vagueHints = /^(improve|fix|add|make|better|something|stuff|thing)\b/i;
  return words.length < 12 && vagueHints.test(t);
}

function clarificationFor(mode: IntakeMode): ClarificationQuestion[] {
  if (mode === IntakeMode.BUG) {
    return [
      {
        id: "placement",
        prompt: "Where should this bug live?",
        choices: ["Under an existing initiative", "Under an existing feature", "New initiative under this product"]
      },
      {
        id: "severity",
        prompt: "How severe is the impact?",
        choices: ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
      }
    ];
  }
  return [
    { id: "persona", prompt: "Who is the primary user / persona?" },
    { id: "outcome", prompt: "What outcome should be true when done?" },
    {
      id: "kind",
      prompt: "Is this a bug, feature, or exploration (Discovery)?",
      choices: ["Bug", "Feature", "Discovery"]
    }
  ];
}

function heuristicBugPlan(text: string, answers?: Record<string, string> | null): CreationPlan {
  const title = firstLineTitle(text, "Untitled bug");
  const severityRaw = (answers?.severity ?? "MEDIUM").toUpperCase();
  const bugSeverity =
    severityRaw === "CRITICAL" || severityRaw === "HIGH" || severityRaw === "MEDIUM" || severityRaw === "LOW"
      ? severityRaw
      : "MEDIUM";
  const priorityMap = { CRITICAL: "P0", HIGH: "P1", MEDIUM: "P2", LOW: "P3" } as const;

  const items: PlanItem[] = [
    {
      key: slugKey("bug", 1),
      hubEntityType: "Feature",
      title,
      parentKey: null,
      storyType: "BUG",
      bugSeverity,
      suggestedPriority: priorityMap[bugSeverity]
    }
  ];

  const reqLines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s*•\-\d.)]+/, "").trim())
    .filter((l) => l.length > 8 && /should|must|expect|repro|step/i.test(l))
    .slice(0, 3);

  reqLines.forEach((line, idx) => {
    items.push({
      key: slugKey("req", idx + 1),
      hubEntityType: "Requirement",
      title: line.length > 120 ? `${line.slice(0, 117)}…` : line,
      parentKey: "bug-1",
      storyType: null,
      suggestedPriority: null,
      bugSeverity: null
    });
  });

  return normalizeCreationPlan({
    planType: items.length > 1 ? "MIXED" : "SINGLE_BUG_FEATURE",
    rationale: "Bug mode maps to a Feature with storyType BUG; optional requirement lines become child Requirements.",
    confidence: answers ? 0.72 : 0.64,
    needsClarification: false,
    items
  });
}

function heuristicFeaturePlan(text: string, answers?: Record<string, string> | null): CreationPlan {
  const chunks = splitIdeaChunks(text);
  const kind = (answers?.kind ?? "").toLowerCase();
  const discovery = kind.includes("discover");

  if (chunks.length >= 3) {
    const epicKey = slugKey("init", 1);
    const items: PlanItem[] = [
      {
        key: epicKey,
        hubEntityType: "Initiative",
        title: firstLineTitle(text, "New initiative"),
        parentKey: null,
        storyType: null,
        suggestedPriority: "P1"
      },
      ...chunks.slice(0, 6).map((chunk, idx) => ({
        key: slugKey("feat", idx + 1),
        hubEntityType: "Feature" as const,
        title: firstLineTitle(chunk, `Feature ${idx + 1}`),
        parentKey: epicKey,
        storyType: "FUNCTIONAL" as const,
        suggestedPriority: (discovery ? "DISCOVERY" : "P2") as PlanItem["suggestedPriority"]
      }))
    ];
    return normalizeCreationPlan({
      planType: "INITIATIVE_TREE",
      rationale: "Multiple distinct chunks detected; grouped under one Initiative with child Features.",
      confidence: 0.7,
      needsClarification: false,
      items
    });
  }

  if (chunks.length === 2) {
    const items: PlanItem[] = chunks.map((chunk, idx) => ({
      key: slugKey("feat", idx + 1),
      hubEntityType: "Feature" as const,
      title: firstLineTitle(chunk, `Feature ${idx + 1}`),
      parentKey: null,
      storyType: "FUNCTIONAL" as const,
      suggestedPriority: (discovery ? "DISCOVERY" : "P2") as PlanItem["suggestedPriority"]
    }));
    return normalizeCreationPlan({
      planType: "MULTI_ITEMS",
      rationale: "Two separate ideas detected; proposing independent Features.",
      confidence: 0.68,
      needsClarification: false,
      items
    });
  }

  return normalizeCreationPlan({
    planType: "SINGLE_FEATURE",
    rationale: "Single feature proposal from intake text.",
    confidence: answers ? 0.75 : 0.66,
    needsClarification: false,
    items: [
      {
        key: slugKey("feat", 1),
        hubEntityType: "Feature",
        title: firstLineTitle(text, "Untitled feature"),
        parentKey: null,
        storyType: "FUNCTIONAL",
        suggestedPriority: discovery ? "DISCOVERY" : "P2"
      }
    ]
  });
}

export function buildHeuristicCreationPlan(input: PlannerInput): CreationPlan {
  const text = [input.rawText.trim(), formatAnswers(input.clarificationAnswers)].filter(Boolean).join("\n\n");
  if (!text.trim()) {
    return normalizeCreationPlan({
      planType: input.mode === IntakeMode.BUG ? "SINGLE_BUG_FEATURE" : "SINGLE_FEATURE",
      rationale: "Empty input — placeholder item for manual edit.",
      confidence: 0.2,
      needsClarification: true,
      clarificationQuestions: clarificationFor(input.mode),
      items: [
        {
          key: input.mode === IntakeMode.BUG ? "bug-1" : "feat-1",
          hubEntityType: "Feature",
          title: input.mode === IntakeMode.BUG ? "Untitled bug" : "Untitled feature",
          parentKey: null,
          storyType: input.mode === IntakeMode.BUG ? "BUG" : "FUNCTIONAL",
          suggestedPriority: "P3",
          bugSeverity: input.mode === IntakeMode.BUG ? "MEDIUM" : null
        }
      ]
    });
  }

  if (isVague(text) && !input.clarificationAnswers) {
    const base =
      input.mode === IntakeMode.BUG ? heuristicBugPlan(text) : heuristicFeaturePlan(text);
    return normalizeCreationPlan({
      ...base,
      confidence: Math.min(base.confidence, 0.45),
      needsClarification: true,
      clarificationQuestions: clarificationFor(input.mode)
    });
  }

  return input.mode === IntakeMode.BUG
    ? heuristicBugPlan(text, input.clarificationAnswers)
    : heuristicFeaturePlan(text, input.clarificationAnswers);
}

function formatAnswers(answers?: Record<string, string> | null): string {
  if (!answers) return "";
  return Object.entries(answers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

async function tryLlmPlan(input: PlannerInput): Promise<CreationPlan | null> {
  if (!env.WORKSPACE_ATLAS_LLM_ENABLED || !env.WORKSPACE_ATLAS_OPENAI_API_KEY) return null;

  const system = `You are Tymio's product intake planner. Return ONLY JSON matching creationPlan:
{planType, rationale, confidence (0-1), needsClarification?, clarificationQuestions?, items:[{key, hubEntityType, title, parentKey?, storyType?, suggestedPriority?, bugSeverity?}]}
Rules: Bugs -> Feature with storyType BUG. Use Initiative parent when grouping related work. Max 8 items. No markdown.`;

  const user = JSON.stringify({
    mode: input.mode,
    productName: input.productName ?? null,
    rawText: input.rawText.slice(0, 12_000),
    clarificationAnswers: input.clarificationAnswers ?? null
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
  const parsed = creationPlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return null;
  return normalizeCreationPlan(parsed.data);
}

export async function planIntake(input: PlannerInput): Promise<PlannerResult> {
  try {
    const llm = await tryLlmPlan(input);
    if (llm) return { plan: llm, source: "llm" };
  } catch {
    /* fall through to heuristic */
  }
  return { plan: buildHeuristicCreationPlan(input), source: "heuristic" };
}
