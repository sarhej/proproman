import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { SeoHead } from "../../components/seo/SeoHead";
import { getPublicSiteOrigin } from "../../lib/publicSiteOrigin";
import type { WikiIndex } from "./wikiTypes";
import { WikiHeader } from "./WikiHeader";

export function WikiIndexPage() {
  const [index, setIndex] = useState<WikiIndex | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/wiki/index.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<WikiIndex>;
      })
      .then((data) => {
        if (!cancelled) setIndex(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load wiki index.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const indexJsonLd = useMemo(() => {
    if (!index) return null;
    const origin = getPublicSiteOrigin();
    return {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: index.title,
      description: index.description,
      url: `${origin}/wiki`,
      isPartOf: { "@type": "WebSite", name: "Tymio", url: origin },
    };
  }, [index]);

  return (
    <div className="min-h-screen bg-slate-50">
      {index ? (
        <SeoHead
          title={`${index.title} | Tymio`}
          description={index.description}
          canonicalPath="/wiki"
          ogType="website"
          jsonLd={indexJsonLd}
        />
      ) : null}
      <WikiHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {index?.title ?? "Tymio documentation wiki"}
        </h1>
        <p className="mt-2 text-slate-600">{index?.description ?? ""}</p>
        {error ? (
          <p className="mt-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        {!index && !error ? (
          <p className="mt-8 text-sm text-slate-500">Loading…</p>
        ) : null}
        {index ? (
          <ul className="mt-8 space-y-3">
            {index.pages.map((p) => (
              <li key={p.slug}>
                <Link
                  to={`/wiki/${encodeURIComponent(p.slug)}`}
                  className="text-lg font-medium text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900"
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-10 text-xs text-slate-500">
          Agents can fetch the same content as Markdown under{" "}
          <code className="rounded bg-slate-200 px-1 py-0.5 text-slate-800">/wiki/articles/*.md</code> on this host.
        </p>
      </main>
    </div>
  );
}
