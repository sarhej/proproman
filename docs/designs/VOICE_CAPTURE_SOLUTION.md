# Voice capture / STT — solution design

**Status:** IMPLEMENTED (v1) — Mic on Attachments + Feature/Requirement/Initiative description fields; Whisper STT; audio ORIGINAL + transcript DERIVATIVE  
**Date:** 2026-07-16  
**Related:** `FILE_PASTE_ANNOTATE_SOLUTION.md` (Attachment library), `FILE_PASTE_ANNOTATE_WIREFRAMES.svg`  
**Wireframes:** `VOICE_CAPTURE_WIREFRAMES.svg`  
**Tymio:** Initiative `cmrnqcuqn000vqv0qt2v5lt1w` / Feature `cmrnqcy76000xqv0qebasbvcw`

---

## 0. Executive recommendation

Extend the **workspace Attachment library** with **audio originals + transcript siblings**, and ship one shared **`VoiceMic` control** usable on many screens (attachments panel, description fields, later intake / annotator text).

**Flow**

1. User taps **Mic** &#x2192; browser `MediaRecorder` (WebM/Opus preferred; WAV fallback where needed).  
2. Client uploads audio to the hub (**server-side only** STT).  
3. Server calls **OpenAI Whisper** (`/v1/audio/transcriptions`) using the existing OpenAI key.  
4. Persist **ORIGINAL audio** blob; persist **transcript** as a sibling artifact (`DERIVATIVE` / transcript role) linked to the same entity; optionally **insert transcript text** into a caller-supplied field.

**Architecture mantra (unchanged):** *Attachment is the artifact; screens only link / consume it.* Voice is another capture path into the same library — not a parallel notes system.

---

## 1. API key / provider check (measured)

| Item | Result |
|------|--------|
| Dedicated Deepgram / AssemblyAI / Azure Speech keys in `server/.env` | **Not present** |
| `WORKSPACE_ATLAS_OPENAI_API_KEY` | **Present, non-empty, `sk-…` shape** |
| `WORKSPACE_ATLAS_LLM_ENABLED` | **true** |
| Other speech keys | None |

**Recommendation:** reuse OpenAI Whisper with the existing key.

- Prefer new optional env `SPEECH_OPENAI_API_KEY` (falls back to `WORKSPACE_ATLAS_OPENAI_API_KEY`) so speech can be rotated / disabled independently of atlas explain.  
- Gate with `SPEECH_STT_ENABLED=true` (default off in prod until ops confirms).  
- **Never** put the key in `VITE_*` or call OpenAI from the browser.

Whisper supports multilingual auto-detect (`language` omitted) — matches “any language.”

---

## 2. Product model

### 2.1 Two layers (same pattern as image annotate)

| Layer | `Attachment.kind` | MIME (v1) | Purpose |
|-------|-------------------|-----------|---------|
| Wave / recording | `ORIGINAL` | `audio/webm`, `audio/wav`, `audio/mpeg`, `audio/mp4`, `audio/ogg` | Listen later; evidence of tone/noise |
| Transcript | `DERIVATIVE` | `text/plain` (UTF-8 `.txt`) | Searchable text; editable after insert |

`parentAttachmentId` on transcript &#x2192; audio ORIGINAL.

Both get `AttachmentLink`s to the entity when used in **attachment mode**.

### 2.2 Shared control modes

| Mode | Mic behavior | Side effects |
|------|--------------|--------------|
| **`field`** | Record &#x2192; STT &#x2192; return `{ transcript, audioFile, language? }` | Caller appends/replaces textarea/input. **Also** uploads audio+transcript into library linked to entity when `target` provided (default **on** so wave is never lost). |
| **`attachment`** | Same capture | Upload + link only; show pair in attachments list (audio + transcript badges). No field mutation. |
| **`annotator-text`** (v1.5) | Short utterance &#x2192; transcript | Feeds image annotator **Text** tool / prompt — out of v1 scope but API-shaped the same. |

### 2.3 Placement (reuse surface)

Shared component: `VoiceMicButton` + optional `VoiceCaptureSheet` (recording / reviewing / error).

| Screen | Mode | v1? |
|--------|------|-----|
| Feature / Requirement / Initiative **Attachments** panel | `attachment` | **Yes** |
| Description / problem / notes **textareas** (same entities) | `field` | **Yes** |
| AI Product Intake capture | `field` + attach | Later |
| Image annotator Text tool | `annotator-text` | Later |
| Demand / comments | `field` | Later |

---

## 3. UX (see wireframes)

1. Idle: mic icon button (toolbar next to Upload / or beside textarea).  
2. Recording: pulse + timer + **Stop**; cancel discards buffer.  
3. Processing: “Transcribing…” (server STT).  
4. Review sheet: play audio, show transcript (editable), actions **Attach & insert** / **Attach only** / **Discard**.  
5. List: pair **Audio (Original)** + nested **Transcript**; play via `<audio>` / content URL; open transcript as text.

Permissions: browser mic permission prompt; clear denial error.

---

## 4. Backend design

### 4.1 MIME / size

Extend attachment allowlist (images **plus** audio + transcript text):

- Audio: sniff WebM/Ogg/WAV/MP3/MP4 where reliable; else trusted claimed MIME for browser recordings with size cap.  
- Transcript: `text/plain` only for DERIVATIVE from STT pipeline (not arbitrary user text upload in v1 unless already planned).  
- Max audio: **25 MiB** (Whisper API limit) — align `ATTACHMENT_MAX_BYTES` for audio or use a separate `ATTACHMENT_AUDIO_MAX_BYTES`.

### 4.2 Endpoints

| Method | Path | Role |
|--------|------|------|
| `POST` | `/api/voice/transcribe` | multipart `file` &#x2192; `{ transcript, language, durationMs? }` (no persist) |
| `POST` | `/api/voice/capture` | multipart `file` + link target + optional `insertHint` &#x2192; creates audio ORIGINAL + transcript DERIVATIVE + links; returns both + transcript string |

RBAC: same as attachment content write (`requireWorkspaceContentWrite`).

CSP: allow `media-src 'self' blob:` for playback (mirror `blob:` lesson from image previews).

### 4.3 STT adapter

```
server/src/speech/whisperClient.ts
  transcribeAudio(buf, mime) → { text, language? }
```

Provider: OpenAI Whisper `whisper-1` (or `gpt-4o-mini-transcribe` if we standardize later). Timeout + size validation. No key &#x2192; `503 SPEECH_NOT_CONFIGURED`.

---

## 5. Security / privacy

- STT only on server; audit log `VOICE_TRANSCRIBED` / attachment creates.  
- PII warning in UI (voice may contain personal data).  
- Retire/backup: audio + transcript participate in existing Artifacts admin flows.  
- Do not send audio to STT without user completing Stop + confirming review (v1 default: review sheet required).

---

## 6. Phasing

| Phase | Scope |
|-------|--------|
| **v1** | MIME expand; Whisper adapter; `/api/voice/*`; `VoiceMic` on Attachments + description fields (Feature/Requirement/Initiative); list pairing audio/transcript; CSP `media-src`; tests |
| **v1.5** | Intake + annotator text; language override; re-transcribe |
| **v2** | Streaming STT; diarization; MCP voice tools |

---

## 7. Critical decisions (for approval)

1. **Provider:** OpenAI Whisper via existing atlas OpenAI key (+ optional `SPEECH_OPENAI_API_KEY` override).  
2. **Always keep wave:** yes — ORIGINAL audio always stored when mic used with an entity `target`.  
3. **Transcript:** sibling DERIVATIVE `.txt` + insert into field when in `field` mode.  
4. **Review before commit:** yes in v1.  
5. **v1 screens:** Attachments panel + description-like textareas on Feature / Requirement / Initiative.

---

## 8. Out of scope (v1)

Realtime streaming captions, speaker diarization, phone dial-in, client-side Web Speech API as primary STT (optional offline enhancement later), video.
