/** Sign-in / deep-link URL for a workspace (slug path). */
export function workspaceEntryUrl(slug: string): string {
  if (typeof window === "undefined") return "";
  const origin = window.location.origin.replace(/\/$/, "");
  return `${origin}/t/${slug}`;
}

export async function copyWorkspaceEntryLink(slug: string): Promise<boolean> {
  const text = workspaceEntryUrl(slug);
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
