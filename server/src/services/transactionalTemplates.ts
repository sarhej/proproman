import { env } from "../env.js";

export type TransactionalLocale = "en" | "cs" | "sk" | "pl" | "uk";

export function normalizeTransactionalLocale(raw: string | null | undefined): TransactionalLocale {
  if (!raw) return "en";
  const base = raw.split("-")[0]?.toLowerCase() ?? "en";
  if (base === "cs" || base === "sk" || base === "pl" || base === "uk") return base;
  return "en";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function origin(): string {
  return env.CLIENT_URL.replace(/\/$/, "");
}

const FOOTER: Record<TransactionalLocale, { brand: string; unsub: string }> = {
  en: { brand: "Tymio App", unsub: "Transactional email — unsubscribe not applicable." },
  cs: { brand: "Tymio App", unsub: "Transakční e-mail — odhlášení není k dispozici." },
  sk: { brand: "Tymio App", unsub: "Transakčný e-mail — odhlásenie nie je k dispozícii." },
  pl: { brand: "Tymio App", unsub: "E-mail transakcyjny — rezygnacja z subskrypcji nie dotyczy." },
  uk: { brand: "Tymio App", unsub: "Транзакційний лист — відписатися не застосовується." },
};

function footText(locale: TransactionalLocale): string {
  const f = FOOTER[locale];
  return `\n\n---\n${f.brand}\n${f.unsub}\n`;
}

function footHtml(locale: TransactionalLocale): string {
  const f = FOOTER[locale];
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/><p style="font-size:12px;color:#64748b">${escapeHtml(f.brand)}</p><p style="font-size:12px;color:#64748b">${escapeHtml(f.unsub)}</p>`;
}

/** E1 — new workspace request (super admins). */
export function buildE1NewWorkspaceRequestEmail(input: {
  locale: TransactionalLocale;
  teamName: string;
  slug: string;
  contactEmail: string;
  contactName: string;
  requestId: string;
}): { subject: string; text: string; html: string } {
  const t = E1_COPY[input.locale];
  const team = input.teamName;
  const slug = input.slug;
  const sub = t.subject(team);
  const baseUrl = origin();
  const text =
    t.bodyText({
      team,
      slug,
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      requestId: input.requestId,
      baseUrl,
    }) + footText(input.locale);
  const html =
    t.bodyHtml({
      team,
      slug,
      contactEmail: input.contactEmail,
      contactName: input.contactName,
      requestId: input.requestId,
      baseUrl,
    }) + footHtml(input.locale);
  return { subject: sub, text, html };
}

/** E2 — tenant request approved (contact). */
export function buildE2WorkspaceApprovedEmail(input: {
  locale: TransactionalLocale;
  teamName: string;
  slug: string;
}): { subject: string; text: string; html: string } {
  const t = E2_COPY[input.locale];
  const baseUrl = origin();
  const workspaceUrl = `${baseUrl}/t/${encodeURIComponent(input.slug)}`;
  const sub = t.subject(input.teamName);
  const text = t.bodyText({ team: input.teamName, slug: input.slug, workspaceUrl, baseUrl }) + footText(input.locale);
  const html =
    t.bodyHtml({ team: input.teamName, slug: input.slug, workspaceUrl, baseUrl }) + footHtml(input.locale);
  return { subject: sub, text, html };
}

/** E3 — tenant request rejected (contact). */
export function buildE3WorkspaceRejectedEmail(input: {
  locale: TransactionalLocale;
  teamName: string;
  slug: string;
  reviewNote: string | null;
}): { subject: string; text: string; html: string } {
  const t = E3_COPY[input.locale];
  const sub = t.subject(input.teamName);
  const note = input.reviewNote?.trim() || null;
  const text = t.bodyText({ team: input.teamName, slug: input.slug, note, baseUrl: origin() }) + footText(input.locale);
  const html = t.bodyHtml({ team: input.teamName, slug: input.slug, note, baseUrl: origin() }) + footHtml(input.locale);
  return { subject: sub, text, html };
}

/** E4 — global role no longer PENDING (user). English-only copy (no stored locale on user for this path). */
export function buildE4PlatformRoleActivatedEmail(input: { name: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const baseUrl = origin();
  const sub = "Your Tymio account is active";
  const greetingName = input.name?.trim() ? `, ${input.name.trim()}` : "";
  const text = `Hello${greetingName},

Your Tymio account has been activated. You can sign in with Google, Microsoft, or email magic link:

${baseUrl}/

If you did not expect this message, contact your workspace admin.

---
Tymio App
Transactional email — unsubscribe not applicable.
`;
  const trimmedName = input.name?.trim() ?? "";
  const htmlGreet = trimmedName ? `Hello, ${escapeHtml(trimmedName)}` : "Hello";
  const html = `<p>${htmlGreet}</p><p>Your Tymio account has been activated. You can sign in with Google, Microsoft, or email magic link:</p><p><a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p><p>If you did not expect this message, contact your workspace admin.</p>${footHtml("en")}`;
  return { subject: sub, text, html };
}

type E1Strings = {
  subject: (team: string) => string;
  bodyText: (p: {
    team: string;
    slug: string;
    contactEmail: string;
    contactName: string;
    requestId: string;
    baseUrl: string;
  }) => string;
  bodyHtml: (p: {
    team: string;
    slug: string;
    contactEmail: string;
    contactName: string;
    requestId: string;
    baseUrl: string;
  }) => string;
};

const E1_COPY: Record<TransactionalLocale, E1Strings> = {
  en: {
    subject: (team) => `New workspace request: ${team}`,
    bodyText: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `A new workspace registration request needs review.

Team: ${team}
Slug: ${slug}
Contact: ${contactName} <${contactEmail}>
Request ID: ${requestId}

Open the platform admin to review: ${baseUrl}/`,
    bodyHtml: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `<p>A new workspace registration request needs review.</p><ul><li><strong>Team:</strong> ${escapeHtml(team)}</li><li><strong>Slug:</strong> ${escapeHtml(slug)}</li><li><strong>Contact:</strong> ${escapeHtml(contactName)} &lt;${escapeHtml(contactEmail)}&gt;</li><li><strong>Request ID:</strong> ${escapeHtml(requestId)}</li></ul><p><a href="${escapeHtml(baseUrl)}/">Open Tymio</a> to review in the platform admin.</p>`,
  },
  cs: {
    subject: (team) => `Nová žádost o workspace: ${team}`,
    bodyText: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `Nová žádost o registraci workspace čeká na schválení.

Tým: ${team}
Slug: ${slug}
Kontakt: ${contactName} <${contactEmail}>
ID žádosti: ${requestId}

Otevřete administraci: ${baseUrl}/`,
    bodyHtml: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `<p>Nová žádost o registraci workspace čeká na schválení.</p><ul><li><strong>Tým:</strong> ${escapeHtml(team)}</li><li><strong>Slug:</strong> ${escapeHtml(slug)}</li><li><strong>Kontakt:</strong> ${escapeHtml(contactName)} &lt;${escapeHtml(contactEmail)}&gt;</li><li><strong>ID žádosti:</strong> ${escapeHtml(requestId)}</li></ul><p><a href="${escapeHtml(baseUrl)}/">Otevřít Tymio</a></p>`,
  },
  sk: {
    subject: (team) => `Nová žiadosť o workspace: ${team}`,
    bodyText: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `Nová žiadosť o registráciu workspace čaká na schválenie.

Tím: ${team}
Slug: ${slug}
Kontakt: ${contactName} <${contactEmail}>
ID žiadosti: ${requestId}

Otvorte administráciu: ${baseUrl}/`,
    bodyHtml: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `<p>Nová žiadosť o registráciu workspace čaká na schválenie.</p><ul><li><strong>Tím:</strong> ${escapeHtml(team)}</li><li><strong>Slug:</strong> ${escapeHtml(slug)}</li><li><strong>Kontakt:</strong> ${escapeHtml(contactName)} &lt;${escapeHtml(contactEmail)}&gt;</li><li><strong>ID žiadosti:</strong> ${escapeHtml(requestId)}</li></ul><p><a href="${escapeHtml(baseUrl)}/">Otvoriť Tymio</a></p>`,
  },
  pl: {
    subject: (team) => `Nowy wniosek o workspace: ${team}`,
    bodyText: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `Nowy wniosek o rejestrację workspace oczekuje na przegląd.

Zespół: ${team}
Slug: ${slug}
Kontakt: ${contactName} <${contactEmail}>
ID wniosku: ${requestId}

Otwórz panel administracyjny: ${baseUrl}/`,
    bodyHtml: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `<p>Nowy wniosek o rejestrację workspace oczekuje na przegląd.</p><ul><li><strong>Zespół:</strong> ${escapeHtml(team)}</li><li><strong>Slug:</strong> ${escapeHtml(slug)}</li><li><strong>Kontakt:</strong> ${escapeHtml(contactName)} &lt;${escapeHtml(contactEmail)}&gt;</li><li><strong>ID wniosku:</strong> ${escapeHtml(requestId)}</li></ul><p><a href="${escapeHtml(baseUrl)}/">Otwórz Tymio</a></p>`,
  },
  uk: {
    subject: (team) => `Новий запит на workspace: ${team}`,
    bodyText: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `Новий запит на реєстрацію workspace очікує розгляду.

Команда: ${team}
Slug: ${slug}
Контакт: ${contactName} <${contactEmail}>
ID запиту: ${requestId}

Відкрийте адмін-панель: ${baseUrl}/`,
    bodyHtml: ({ team, slug, contactEmail, contactName, requestId, baseUrl }) =>
      `<p>Новий запит на реєстрацію workspace очікує розгляду.</p><ul><li><strong>Команда:</strong> ${escapeHtml(team)}</li><li><strong>Slug:</strong> ${escapeHtml(slug)}</li><li><strong>Контакт:</strong> ${escapeHtml(contactName)} &lt;${escapeHtml(contactEmail)}&gt;</li><li><strong>ID запиту:</strong> ${escapeHtml(requestId)}</li></ul><p><a href="${escapeHtml(baseUrl)}/">Відкрити Tymio</a></p>`,
  },
};

type E23 = {
  subject: (team: string) => string;
  bodyText: (p: { team: string; slug: string; workspaceUrl?: string; note?: string | null; baseUrl: string }) => string;
  bodyHtml: (p: { team: string; slug: string; workspaceUrl?: string; note?: string | null; baseUrl: string }) => string;
};

const E2_COPY: Record<TransactionalLocale, E23> = {
  en: {
    subject: (team) => `Your workspace “${team}” is approved`,
    bodyText: ({ team, slug, workspaceUrl, baseUrl }) =>
      `Your workspace request for “${team}” (slug: ${slug}) has been approved.

Open your workspace: ${workspaceUrl}

You can sign in with Google, Microsoft, or email magic link: ${baseUrl}/`,
    bodyHtml: ({ team, slug, workspaceUrl, baseUrl }) =>
      `<p>Your workspace request for <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) has been approved.</p><p><a href="${escapeHtml(workspaceUrl!)}">Open your workspace</a></p><p>You can sign in with Google, Microsoft, or email magic link: <a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`,
  },
  cs: {
    subject: (team) => `Váš workspace „${team}“ byl schválen`,
    bodyText: ({ team, slug, workspaceUrl, baseUrl }) =>
      `Vaše žádost o workspace „${team}“ (slug: ${slug}) byla schválena.

Otevřete workspace: ${workspaceUrl}

Přihlášení: Google, Microsoft nebo e-mailem: ${baseUrl}/`,
    bodyHtml: ({ team, slug, workspaceUrl, baseUrl }) =>
      `<p>Vaše žádost o workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) byla schválena.</p><p><a href="${escapeHtml(workspaceUrl!)}">Otevřít workspace</a></p><p>Přihlášení přes Google, Microsoft nebo e-mail: <a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`,
  },
  sk: {
    subject: (team) => `Váš workspace „${team}“ bol schválený`,
    bodyText: ({ team, slug, workspaceUrl, baseUrl }) =>
      `Vaša žiadosť o workspace „${team}“ (slug: ${slug}) bola schválená.

Otvorte workspace: ${workspaceUrl}

Prihlásenie: Google, Microsoft alebo e-mailom: ${baseUrl}/`,
    bodyHtml: ({ team, slug, workspaceUrl, baseUrl }) =>
      `<p>Vaša žiadosť o workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) bola schválená.</p><p><a href="${escapeHtml(workspaceUrl!)}">Otvoriť workspace</a></p><p>Prihlásenie cez Google, Microsoft alebo e-mail: <a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`,
  },
  pl: {
    subject: (team) => `Twój workspace „${team}” został zatwierdzony`,
    bodyText: ({ team, slug, workspaceUrl, baseUrl }) =>
      `Wniosek o workspace „${team}” (slug: ${slug}) został zatwierdzony.

Otwórz workspace: ${workspaceUrl}

Logowanie: Google, Microsoft lub link e-mailowy: ${baseUrl}/`,
    bodyHtml: ({ team, slug, workspaceUrl, baseUrl }) =>
      `<p>Wniosek o workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) został zatwierdzony.</p><p><a href="${escapeHtml(workspaceUrl!)}">Otwórz workspace</a></p><p>Logowanie: Google, Microsoft lub e-mail: <a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`,
  },
  uk: {
    subject: (team) => `Ваш workspace «${team}» схвалено`,
    bodyText: ({ team, slug, workspaceUrl, baseUrl }) =>
      `Запит на workspace «${team}» (slug: ${slug}) схвалено.

Відкрийте workspace: ${workspaceUrl}

Вхід: Google, Microsoft або magic link на e-mail: ${baseUrl}/`,
    bodyHtml: ({ team, slug, workspaceUrl, baseUrl }) =>
      `<p>Запит на workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) схвалено.</p><p><a href="${escapeHtml(workspaceUrl!)}">Відкрити workspace</a></p><p>Вхід: Google, Microsoft або e-mail: <a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`,
  },
};

const E3_COPY: Record<TransactionalLocale, E23> = {
  en: {
    subject: (team) => `Update on your workspace request: ${team}`,
    bodyText: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `Note from the reviewer:\n${note}\n`
          : "We could not approve this request at this time.\n";
      return `Your workspace request for “${team}” (slug: ${slug}) was not approved.

${reason}
If you have questions, reply through your usual support channel or visit ${baseUrl}/`;
    },
    bodyHtml: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `<p><strong>Note from the reviewer:</strong></p><p>${escapeHtml(note).replace(/\n/g, "<br/>")}</p>`
          : "<p>We could not approve this request at this time.</p>";
      return `<p>Your workspace request for <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) was not approved.</p>${reason}<p>If you have questions, visit <a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`;
    },
  },
  cs: {
    subject: (team) => `Stav žádosti o workspace: ${team}`,
    bodyText: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `Poznámka od revidenta:\n${note}\n`
          : "Tuto žádost jsme v tuto chvíli nemohli schválit.\n";
      return `Vaše žádost o workspace „${team}“ (slug: ${slug}) nebyla schválena.

${reason}
Více informací: ${baseUrl}/`;
    },
    bodyHtml: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `<p><strong>Poznámka od revidenta:</strong></p><p>${escapeHtml(note).replace(/\n/g, "<br/>")}</p>`
          : "<p>Tuto žádost jsme v tuto chvíli nemohli schválit.</p>";
      return `<p>Vaše žádost o workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) nebyla schválena.</p>${reason}<p><a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`;
    },
  },
  sk: {
    subject: (team) => `Stav žiadosti o workspace: ${team}`,
    bodyText: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `Poznámka od kontrolóra:\n${note}\n`
          : "Túto žiadosť sme v tejto chvíli nemohli schváliť.\n";
      return `Vaša žiadosť o workspace „${team}“ (slug: ${slug}) nebola schválená.

${reason}
Ďalšie informácie: ${baseUrl}/`;
    },
    bodyHtml: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `<p><strong>Poznámka od kontrolóra:</strong></p><p>${escapeHtml(note).replace(/\n/g, "<br/>")}</p>`
          : "<p>Túto žiadosť sme v tejto chvíli nemohli schváliť.</p>";
      return `<p>Vaša žiadosť o workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) nebola schválená.</p>${reason}<p><a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`;
    },
  },
  pl: {
    subject: (team) => `Aktualizacja wniosku o workspace: ${team}`,
    bodyText: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `Uwagi od osoby weryfikującej:\n${note}\n`
          : "Nie mogliśmy teraz zatwierdzić tego wniosku.\n";
      return `Wniosek o workspace „${team}” (slug: ${slug}) nie został zatwierdzony.

${reason}
Więcej informacji: ${baseUrl}/`;
    },
    bodyHtml: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `<p><strong>Uwagi od osoby weryfikującej:</strong></p><p>${escapeHtml(note).replace(/\n/g, "<br/>")}</p>`
          : "<p>Nie mogliśmy teraz zatwierdzić tego wniosku.</p>";
      return `<p>Wniosek o workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) nie został zatwierdzony.</p>${reason}<p><a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`;
    },
  },
  uk: {
    subject: (team) => `Оновлення щодо запиту на workspace: ${team}`,
    bodyText: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `Примітка від перевіряючого:\n${note}\n`
          : "Наразі ми не можемо схвалити цей запит.\n";
      return `Запит на workspace «${team}» (slug: ${slug}) не схвалено.

${reason}
Детальніше: ${baseUrl}/`;
    },
    bodyHtml: ({ team, slug, note, baseUrl }) => {
      const reason =
        note && note.length > 0
          ? `<p><strong>Примітка від перевіряючого:</strong></p><p>${escapeHtml(note).replace(/\n/g, "<br/>")}</p>`
          : "<p>Наразі ми не можемо схвалити цей запит.</p>";
      return `<p>Запит на workspace <strong>${escapeHtml(team)}</strong> (slug: <code>${escapeHtml(slug)}</code>) не схвалено.</p>${reason}<p><a href="${escapeHtml(baseUrl)}/">${escapeHtml(baseUrl)}/</a></p>`;
    },
  },
};
