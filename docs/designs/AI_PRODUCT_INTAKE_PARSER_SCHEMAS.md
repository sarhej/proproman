# AI Product Intake — parser & session schemas

**Status:** Phase 0 design (approve with wireframes before coding)  
**Date:** 2026-09-07  
**Wireframes:** `AI_PRODUCT_INTAKE_WIREFRAMES.svg`  
**Hub initiative:** `cmpblw2ha000bms0q127a8ueq` — AI-assisted product intake — Create Bug & Create Feature  
**Foundation feature:** `cmpblw662000dms0qnlgcrydu`

Related platform: workspace Attachments (`intakeSessionId` soft link already on `AttachmentLink`).

---

## 1. IntakeSession (Prisma — Phase 1)

New tenant-scoped model. No hub backlog mutation until **commit**.

```prisma
enum IntakeMode {
  BUG
  FEATURE
}

enum IntakeSessionStatus {
  CAPTURING
  ANALYZING
  CLARIFYING
  PLAN_READY
  DRAFTING
  REVIEWING
  COMMITTING
  COMMITTED
  FAILED
  ABANDONED
}

model IntakeSession {
  id              String              @id @default(cuid())
  tenantId        String
  productId       String
  mode            IntakeMode
  status          IntakeSessionStatus @default(CAPTURING)
  rawText         String              @default("") @db.Text
  /// SHA-256 hex of normalized rawText (+ ordered attachment ids) for audit
  rawExcerptHash  String?
  sourceChannel   String?             // ui_product | paste | upload | url_fetch | voice
  clarification   Json?               // Q/A answers when clarifying
  creationPlan    Json?               // see §3
  drafts          Json?               // see §4
  analyzeError    String?
  confidence      Float?
  createdById     String?
  committedAt     DateTime?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@index([tenantId, productId])
  @@index([tenantId, status])
}
```

Attachments: reuse `Attachment` + `AttachmentLink.intakeSessionId` (no FK required in v1).

### Source metadata (stored on session and/or analyze result)

```json
{
  "channel": "ui_product",
  "capturedAt": "2026-09-07T15:00:00.000Z",
  "rawExcerptHash": "sha256:…",
  "attachments": [
    {
      "id": "cuid",
      "mimeType": "image/png",
      "filename": "shot.png",
      "storageRef": "…",
      "source": "upload | paste | url_fetch"
    }
  ],
  "urlFetches": [
    {
      "url": "https://…",
      "status": "ok | failed | skipped",
      "httpStatus": 200,
      "fetchedAt": "…",
      "normalizedTextRef": "attachmentId | null",
      "error": null
    }
  ]
}
```

---

## 2. REST surface (Phase 1+)

All under workspace auth + product scope. Prefix: `/api/intake-sessions` (and `/t/:slug/api/…`).

| Method | Path | Purpose | Phase |
|--------|------|---------|-------|
| `POST` | `/` | Create session `{ productId, mode }` | 1 |
| `GET` | `/:id` | Load session + linked attachments | 1 |
| `PATCH` | `/:id` | Update `rawText`, status transitions allowed for client | 1 |
| `POST` | `/:id/analyze` | Run analyze now (also server debounce helper optional) | 1 stub / 2–4 real |
| `POST` | `/:id/clarify` | Submit clarification answers | 3–4 |
| `PATCH` | `/:id/plan` | User edits to `creationPlan` | 2 |
| `POST` | `/:id/drafts` | Generate full drafts from plan | 5 |
| `PATCH` | `/:id/drafts/:draftKey` | Edit / approve / skip one draft | 5 |
| `POST` | `/:id/commit` | Persist approved drafts to hub | 5 |

**Phase 1 analyze stub:** returns `{ status: "PLAN_READY", creationPlan: null, needsClarification: false, confidence: null }` or a deterministic empty single-item plan **without** writing Initiative/Feature/Requirement rows. Prefer `needsClarification: false` and leave plan null so UI can show manual form path without fake ontology.

---

## 3. creationPlan JSON schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "tymio.intake.creationPlan",
  "type": "object",
  "required": ["planType", "rationale", "confidence", "items"],
  "properties": {
    "planType": {
      "enum": [
        "SINGLE_FEATURE",
        "SINGLE_BUG_FEATURE",
        "MULTI_ITEMS",
        "INITIATIVE_TREE",
        "MIXED"
      ]
    },
    "rationale": { "type": "string", "minLength": 1 },
    "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
    "needsClarification": { "type": "boolean" },
    "clarificationQuestions": {
      "type": "array",
      "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["id", "prompt"],
        "properties": {
          "id": { "type": "string" },
          "prompt": { "type": "string" },
          "choices": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "items": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/planItem" }
    }
  },
  "$defs": {
    "planItem": {
      "type": "object",
      "required": ["key", "hubEntityType", "title"],
      "properties": {
        "key": { "type": "string" },
        "hubEntityType": { "enum": ["Initiative", "Feature", "Requirement"] },
        "title": { "type": "string" },
        "parentKey": { "type": ["string", "null"] },
        "storyType": {
          "enum": ["FUNCTIONAL", "BUG", "TECH_DEBT", "RESEARCH", null]
        },
        "suggestedPriority": {
          "enum": ["P0", "P1", "P2", "P3", "DISCOVERY", null]
        },
        "bugSeverity": {
          "enum": ["CRITICAL", "HIGH", "MEDIUM", "LOW", null]
        },
        "routeHint": {
          "type": "object",
          "properties": {
            "initiativeId": { "type": ["string", "null"] },
            "featureId": { "type": ["string", "null"] },
            "rationale": { "type": "string" }
          }
        }
      }
    }
  }
}
```

**Mapping rules**

- Bugs → `hubEntityType: Feature` + `storyType: BUG`; tasks/AC → child `Requirement`s.
- Vague product ideas may use `suggestedPriority: DISCOVERY` (UI label only until committed; commit maps Discovery to Feature `RESEARCH` or initiative note — decide in Phase 4).
- User may reclassify / split / merge items before draft generation (`PATCH …/plan`).

---

## 4. Draft payloads

### 4.1 Bug draft (`mode=BUG` or plan item storyType BUG)

```json
{
  "key": "item-2",
  "hubEntityType": "Feature",
  "storyType": "BUG",
  "approval": "pending | approved | skipped",
  "fieldProvenance": {
    "title": "ai | user",
    "description": "ai | user",
    "severity": "ai | user",
    "priority": "ai | user"
  },
  "title": "string",
  "description": "string",
  "stepsToReproduce": ["string"],
  "expected": "string",
  "actual": "string",
  "environment": "string",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "priority": "P0 | P1 | P2 | P3",
  "acceptanceCriteria": ["string"],
  "affectedArea": "string",
  "parentKey": "item-1",
  "route": { "initiativeId": null, "featureId": null },
  "requirements": [
    {
      "key": "item-2-r1",
      "title": "string",
      "description": "string",
      "approval": "pending | approved | skipped"
    }
  ]
}
```

### 4.2 Feature draft

```json
{
  "key": "item-3",
  "hubEntityType": "Feature",
  "storyType": "FUNCTIONAL",
  "approval": "pending",
  "fieldProvenance": {},
  "title": "string",
  "problem": "string",
  "solution": "string",
  "personas": ["string"],
  "businessValue": "string",
  "priority": "P0 | P1 | P2 | P3 | DISCOVERY",
  "priorityRationale": "string",
  "missingInputs": ["string"],
  "acceptanceCriteria": ["string"],
  "dependencies": ["string"],
  "risks": ["string"],
  "openQuestions": ["string"],
  "parentKey": "item-1",
  "requirements": []
}
```

### 4.3 Initiative draft

```json
{
  "key": "item-1",
  "hubEntityType": "Initiative",
  "approval": "pending",
  "title": "string",
  "description": "string",
  "priority": "P0 | P1 | P2 | P3",
  "horizon": "NOW | NEXT | LATER",
  "productId": "string"
}
```

---

## 5. Severity → priority (bugs)

| Severity | Default priority |
|----------|------------------|
| CRITICAL | P0 |
| HIGH     | P1 |
| MEDIUM   | P2 |
| LOW      | P3 |

User may override **either** field independently; both stored on draft + committed Feature metadata (`metadata.severity` recommended).

---

## 6. Analyze pipeline (Phases 2–4)

```
rawText + attachments (+ fetched URL text)
        │
        ▼
┌───────────────────┐
│ Shared preprocess │  extract text, OCR hooks, size caps
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Mode router       │  BUG → bug parser; FEATURE → feature parser
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ Planner           │  creationPlan (multi-object)
└─────────┬─────────┘
          ▼
   confidence gate
    ├─ high → PLAN_READY
    └─ low  → CLARIFYING (questions or placement options)
```

Strict JSON validation on planner/parser outputs (Zod on server). On failure: set `status=FAILED` or keep `CAPTURING` with `analyzeError` and UI manual fallback (wireframe G) — **never** write hub entities.

---

## 7. Commit (Phase 5)

`POST /:id/commit` creates only drafts with `approval=approved`, in parent-before-child order:

1. Initiatives  
2. Features (with `storyType`, priority, metadata)  
3. Requirements  

Link work artifacts / attachments from session → new entity ids. Set session `COMMITTED` + `committedAt`. Idempotent: second commit no-ops or returns already-created ids.

---

## 8. Phase 1 acceptance (foundation only)

Aligned with hub AC for Shared AI product intake foundation:

1. Product page exposes **Create Bug** and **Create Feature** → open shell with `mode` + `productId`.  
2. User can type, paste, upload images/docs; attachments link via `intakeSessionId`.  
3. Debounced typing + Analyze button call `POST …/analyze` (stub OK).  
4. Parser/analyze failure → non-blocking manual form path.  
5. Source metadata + `rawExcerptHash` persisted on session.

---

## 9. Out of scope until later phases

- Real LLM planner / domain parsers  
- Per-draft approve UI + batch hub create  
- External URL fetch (Notion, Google Docs, Jira, Slack) with credentials  
- Voice mic on intake (reuse VoiceCapture when ready)
