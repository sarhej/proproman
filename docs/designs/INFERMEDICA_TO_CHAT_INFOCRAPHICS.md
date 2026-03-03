# Infographics: Infermedica → Human Chat Options

Infographics for the seamless transition from Infermedica symptom checker to human chat (CometChat or similar).

## Assets

| File | Description |
|------|-------------|
| [infographic-handoff-user-flow.png](../../assets/infographic-handoff-user-flow.png) | **User flow** – From app + Infermedica → "Talk to doctor" → backend sends context → CometChat chat opens with context visible. |
| [infographic-solutions-comparison.png](../../assets/infographic-solutions-comparison.png) | **Solutions comparison** – Solution 1: Direct handoff (recommended) vs Solution 2: AI handoff inside chat; when to use which. |
| [infographic-technical-sequence.png](../../assets/infographic-technical-sequence.png) | **Technical sequence** – Step-by-step: user tap → app → backend → Infermedica summary → CometChat REST → app opens chat → doctor sees context. |
| [infographic-platform-options.png](../../assets/infographic-platform-options.png) | **Platform options** – CometChat, Sendbird, Twilio, Stream; same handoff pattern, different products. |

## Usage

- **Presentations**: Use the flow and comparison for stakeholders; use the technical sequence for engineering.
- **Docs**: Reference from architecture or product docs that describe the Infermedica → chat handoff.
- **Location**: PNGs are under `assets/`; this index is in `docs/designs/`.

## Summary

- **Recommended**: Direct handoff (Solution 1) – keep Infermedica in the native app; on "Talk to doctor", backend sends a context message and app opens human chat.
- **Optional**: Use Infermedica `/triage` and `/recommend_specialist` (e.g. `text_teleconsultation`) to decide when to offer chat and which specialist type to route to.
