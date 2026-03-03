# Compliance Conclusion & Our Responsibilities

**Context:** Medical application in Czechia/EU using CometChat (or similar) for human chat after Infermedica symptom checker.

---

## Scope from product (Dr. Digital x Qest)

*Derived from sprint review and product scope.*

- **Platforms:** Android app (primary; Google Play planned), optional web application component.
- **Core features:** Patient–doctor chat (direct messaging, medical consultation), symptom checker (Infermedica), diagnosis support.
- **Integrations:** Chat SDK (CometChat or similar, headless in native app), medical information system / existing medical records.
- **Data:** Patient data, chat history, consultation content, and data exchanged with the medical information system.

Compliance below applies to all of the above (app, web if it processes the same data, chat, symptom checker, and medical records integration).

---

## Short conclusion on compliance

- **CometChat can be used** for chat/calling in a medical app in Czechia and the EU from a **data protection and security** perspective, **provided** we use the EU (Ireland) region, sign a proper Data Processing Addendum (DPA) including Standard Contractual Clauses where needed, and fulfil our obligations as **data controller**.
- CometChat’s certifications (GDPR, SOC 2, ISO 27001, HIPAA) cover **processor** security and contractual readiness; they **do not** replace our duties as controller or any **medical device (MDR/IVDR)** assessment of our app.

---

## What is already on the vendor side (CometChat)

| Area | Vendor provides |
|------|-----------------|
| **Certifications** | GDPR-aligned processing, SOC 2 Type II, ISO 27001, HIPAA + BAA (indicates healthcare-oriented controls). |
| **Security** | AES-256 at rest, SSL/TLS in transit, penetration testing, secure media options. |
| **Contract** | DPA (on request), sub-processors list, option for EU SCCs in DPA for transfers. |
| **Data residency** | Choice of region at signup (we must choose **EU / Ireland**). |
| **APIs** | Message/user/group APIs and moderation (e.g. delete message) to support compliance workflows. |

We **rely** on the above only after we have signed the DPA, chosen EU region, and verified sub-processors.

---

## What we must do on our side (full data protection)

### 1. Contract and configuration

- [ ] **Sign a Data Processing Addendum (DPA)** with CometChat that:
  - Reflects our role as **controller** and CometChat as **processor**.
  - Specifies processing of **health data** (and special categories under Art. 9 GDPR).
  - Includes **Standard Contractual Clauses** for any sub-processors outside the EEA.
- [ ] **Select EU (Ireland)** as the CometChat region at signup and confirm it in the DPA.
- [ ] **Review CometChat’s sub-processors list** and DPA; ensure we can object to or approve new sub-processors as required by our policy.

### 2. Legal basis and transparency

- [ ] **Define and document the legal basis** for processing health data in chat (e.g. Art. 9(2)(h) GDPR + national healthcare law).
- [ ] **Provide clear privacy information** to users (what we collect, why, how long, who processes it, including CometChat as processor if required by national practice).
- [ ] **Obtain consent or other lawful basis** where required (e.g. for non-essential processing or special categories beyond the healthcare exemption).

### 3. Data subject rights and procedures

- [ ] **Implement procedures** for access, rectification, erasure, portability, restriction, and objection.
- [ ] **Use CometChat APIs** (and our backend) to fulfil requests (e.g. delete messages, export, correct user data).
- [ ] **Respond within statutory deadlines** (e.g. one month under GDPR) and document requests and responses.

### 4. Retention and purpose limitation

- [ ] **Define retention periods** for chat and related data in line with Czech/EU healthcare and archival law.
- [ ] **Configure CometChat** (and our backend) to enforce retention and deletion where the product allows (e.g. via APIs or support).
- [ ] **Ensure we do not keep data longer than necessary** for the defined purpose.

### 5. Records and accountability

- [ ] **Maintain a Record of Processing Activities (RoPA)** that includes:
  - Chat/calling processing (CometChat as processor, purpose, data categories, recipients, retention, safeguards).
  - **Patient–doctor communication** (purpose: medical consultation; categories: health data, identifiers).
  - **Medical information system integration** (what data we send/receive, purpose, retention, legal basis).
  - **Chat history and data persistence** (where stored, how long, how deleted).
- [ ] **Document** that we use EU region, signed DPA, and (if applicable) SCCs for transfers.
- [ ] **Keep evidence** of sub-processor review and any approvals/objections.

### 6. Security and breach response

- [ ] **Apply appropriate technical and organisational measures** in our app and backend (access control, encryption, logging).
- [ ] **Have a process** for detecting, assessing, and reporting personal data breaches (including those that may involve CometChat); notify the supervisory authority and data subjects when required.
- [ ] **Ensure the DPA** requires CometChat to notify us of breaches and assist in our notification obligations.

### 7. Infermedica and handoff data

- [ ] **Ensure Infermedica** (symptom checker and any API data) is covered by our legal basis, privacy notice, and RoPA.
- [ ] **Minimise context** sent into chat (e.g. symptom summary): only what is necessary for the human to assist; avoid sending full raw Infermedica payloads if not needed.
- [ ] **Document** that we pass only necessary data to CometChat and that it is processed under the same legal basis and purpose.

### 8. Medical device (MDR/IVDR)

- [ ] **Assess separately** whether our application (or parts of it) qualifies as a medical device under MDR/IVDR; CometChat’s compliance does **not** cover this.
- [ ] **If applicable**, fulfil clinical, labelling, and post-market obligations for the device; treat chat as a supporting feature, not the device itself.

### 9. Czech-specific

- [ ] **Comply with Act No. 110/2019** (implementation of GDPR in Czech law); the above steps support this.
- [ ] **Be prepared for possible audits** by the ÚOOÚ (Office for Personal Data Protection); keep DPA, RoPA, and procedures up to date.

### 10. App and distribution (from product scope)

- [ ] **Google Play:** Complete Data safety form (data types, purpose, sharing, security); provide privacy policy URL; ensure app behaviour matches declared data practices.
- [ ] **Web application (if used):** Apply same controller obligations (legal basis, notice, rights, retention) as for the mobile app when it processes the same patient/chat data.
- [ ] **SDK in native app (headless chat):** Ensure chat data is only processed via the chosen vendor (CometChat) under the signed DPA and that no duplicate or ungoverned storage of full chat history exists outside the vendor and our defined retention.

---

## From Dr. Digital x Qest sprint review – what we took into compliance

*Meeting: Sprint review, 26 Feb 2025. Summary mapped to this document.*

| Meeting point | Taken into compliance doc |
|---------------|---------------------------|
| Android app, Google Play next month | **Scope:** Android primary; **Checklist §10:** Google Play Data safety, privacy policy. |
| Patient–doctor chat, medical consultation | **Scope:** patient–doctor communication; **RoPA (§5):** explicit entry for patient–doctor communication and consultation. |
| Integration with medical information system / medical records | **Scope:** medical records integration; **RoPA (§5):** entry for MIS integration (data flows, purpose, retention). |
| Chat history and data persistence | **RoPA (§5):** where chat is stored, retention, deletion; **§4:** retention and purpose limitation. |
| SDK integration, native app, headless chat | **Scope:** headless chat in native app; **Checklist §10:** SDK usage under DPA, no ungoverned duplicate storage. |
| Web application component | **Scope:** web app in scope when processing same data; **Checklist §10:** same controller obligations for web. |
| Compliance requirements (discussed) | Documented in this file; use as single reference for data protection and related compliance. |

---

## One-line summary

**Vendor (CometChat):** provides a compliant, certified **processor** and EU region option; we must **sign the DPA, choose EU, and verify sub-processors**.  
**Our side:** act as a compliant **controller** (legal basis, transparency, rights, retention, RoPA, security, breach process, minimal data in chat, and separate MDR/IVDR assessment if applicable).
