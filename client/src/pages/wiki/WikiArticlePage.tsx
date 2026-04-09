import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { WikiIndex } from "./wikiTypes";
import { WikiHeader } from "./WikiHeader";

const SLUG_RE = /^[a-z0-9-]+$/;

export function WikiArticlePage() {
  const { slug } = useParams();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const safeSlug = useMemo(() => (slug && SLUG_RE.test(slug) ? slug : null), [slug]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setMarkdown(null);
    if (!safeSlug) {
      setError("Invalid page.");
      return;
    }
    void fetch("/wiki/index.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<WikiIndex>;
      })
      .then((data) => {
        if (cancelled) return;
        const page = data.pages.find((p) => p.slug === safeSlug);
        if (!page) {
          setError("Page not found.");
          return;
        }
        const path = `/wiki/${page.file}`;
        return fetch(path).then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.text();
        });
      })
      .then((text) => {
        if (cancelled || text === undefined) return;
        setMarkdown(text);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load article.");
      });
    return () => {
      cancelled = true;
    };
  }, [safeSlug]);

  return (
    <div className="min-h-screen bg-slate-50">
      <WikiHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <nav className="mb-6 text-sm">
          <Link to="/wiki" className="text-indigo-700 hover:text-indigo-900">
            ← Wiki index
          </Link>
        </nav>
        {error ? (
          <p className="mt-6 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        ) : null}
        {!markdown && !error ? <p className="mt-8 text-sm text-slate-500">Loading…</p> : null}
        {markdown ? (
          <article className="prose-wiki mt-8 max-w-none text-slate-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith("/wiki")) {
                    return (
                      <Link to={href} className="text-indigo-700 underline decoration-indigo-300 underline-offset-2">
                        {children}
                      </Link>
                    );
                  }
                  if (href?.startsWith("http://") || href?.startsWith("https://")) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">
                        {children}
                      </a>
                    );
                  }
                  return (
                    <a href={href} className="text-indigo-700 underline">
                      {children}
                    </a>
                  );
                },
                code: ({ className, children, ...props }) => {
                  const inline = !className;
                  return inline ? (
                    <code className="rounded bg-slate-200 px-1 py-0.5 text-sm text-slate-900" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-900 p-4 text-sm text-slate-100">
                    {children}
                  </pre>
                ),
              }}
            >
              {markdown}
            </ReactMarkdown>
          </article>
        ) : null}
      </main>
    </div>
  );
}
