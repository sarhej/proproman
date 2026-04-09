import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { AgentMcpCliHiddenGuidance } from "../components/agent/AgentMcpCliHiddenGuidance";
import { Card } from "../components/ui/Card";
import { Bot, Copy, Check } from "lucide-react";
import { useState } from "react";

const NPM_PACKAGE_URL = "https://www.npmjs.com/package/@tymio/mcp-server";

const CURSOR_STYLE_STDIO_JSON = `{
  "mcpServers": {
    "tymio": {
      "command": "tymio-mcp",
      "args": []
    }
  }
}`;

const OPENCLAW_MCP_SET = `openclaw mcp set tymio '{"command":"tymio-mcp","args":[],"description":"Tymio product hub (OAuth via tymio-mcp login)"}'`;

export function AgentSetupPage() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const mcpUrl = `${window.location.origin}/mcp`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
          <Bot size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{t("agentSetup.title")}</h1>
          <p className="text-sm text-slate-500">{t("agentSetup.subtitle")}</p>
        </div>
      </div>

      <Card className="border-indigo-100 bg-indigo-50/90 p-4">
        <p className="text-sm leading-relaxed text-indigo-950">
          <Link to="/wiki" className="font-semibold text-indigo-800 underline decoration-indigo-300 underline-offset-2">
            {t("agentSetup.wikiLinkLabel")}
          </Link>
          {" — "}
          {t("agentSetup.wikiLinkDesc")}
        </p>
      </Card>

      <Card className="border-amber-200 bg-amber-50/90 p-4">
        <h2 className="mb-2 text-sm font-semibold text-amber-950">{t("agentSetup.oauthNotApiKeyTitle")}</h2>
        <p className="text-sm leading-relaxed text-amber-950/90">{t("agentSetup.oauthNotApiKeyBody")}</p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{t("agentSetup.howToConnect")}</h2>
        <p className="mb-6 text-sm leading-relaxed text-slate-600">{t("agentSetup.sectionIntro")}</p>

        <div className="space-y-6 text-sm text-slate-600">
          <section>
            <h3 className="mb-2 text-base font-semibold text-slate-800">{t("agentSetup.stdioTitle")}</h3>
            <p className="mb-4 text-slate-600">{t("agentSetup.stdioLead")}</p>
            <ol className="ml-4 list-decimal space-y-4">
              <li>
                <p className="text-slate-700">{t("agentSetup.stdioStep1")}</p>
                <code className="mt-1 block w-fit rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">
                  npm install -g @tymio/mcp-server
                </code>
              </li>
              <li>
                <p className="text-slate-700">{t("agentSetup.stdioStep2")}</p>
                <code className="mt-1 block w-fit rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-800">tymio-mcp login</code>
              </li>
              <li>
                <p>{t("agentSetup.stdioStep3")}</p>
              </li>
              <li>
                <p className="mb-2 font-medium text-slate-700">{t("agentSetup.stdioStep4Label")}</p>
                <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
                  {CURSOR_STYLE_STDIO_JSON}
                </pre>
                <p className="mt-2 text-slate-500">{t("agentSetup.stdioPathHint")}</p>
              </li>
            </ol>
            <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
              <h4 className="mb-2 text-sm font-semibold text-slate-800">{t("agentSetup.openclawHeading")}</h4>
              <p className="mb-2 text-slate-600">{t("agentSetup.openclawHint")}</p>
              <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
                {OPENCLAW_MCP_SET}
              </pre>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {t("agentSetup.stdioFooterLead")}{" "}
              <a
                href={NPM_PACKAGE_URL}
                className="font-medium text-indigo-600 underline decoration-indigo-600/30 underline-offset-2 hover:text-indigo-800"
                target="_blank"
                rel="noopener noreferrer"
              >
                @tymio/mcp-server
              </a>
              {" · "}
              <span className="text-slate-500">{t("agentSetup.stdioFooterCli")}</span>{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">tymio-mcp instructions</code>
            </p>
          </section>

          <hr className="border-slate-200" />

          <section>
            <h3 className="mb-2 text-base font-semibold text-slate-800">{t("agentSetup.remoteTitle")}</h3>
            <p className="mb-4 text-slate-600">{t("agentSetup.remoteLead")}</p>
            <ol className="ml-4 list-decimal space-y-3">
              <li>
                <strong>{t("agentSetup.step1")}</strong>
                <p className="mt-1 text-slate-500">{t("agentSetup.step1Hint")}</p>
              </li>
              <li>
                <strong>{t("agentSetup.step2")}</strong>
                <p className="mt-1 text-slate-500">{t("agentSetup.step2Hint")}</p>
              </li>
              <li>
                <strong>{t("agentSetup.step3")}</strong>
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-slate-700">{t("agentSetup.typeLabel")}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-xs text-slate-800">
                        {t("agentSetup.remoteTypeBadge")}
                      </span>
                      <span className="text-xs text-slate-500">{t("agentSetup.remoteTransportNote")}</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">{t("agentSetup.urlLabel")}</span>
                    <div className="flex items-center gap-2">
                      <code className="max-w-[min(100%,18rem)] truncate rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-800 sm:max-w-none">
                        {mcpUrl}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                        title={t("agentSetup.copyUrlTitle")}
                        aria-label={t("agentSetup.copyUrlTitle")}
                      >
                        {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
              <li>
                <strong>{t("agentSetup.step4")}</strong>
                <p className="mt-1 text-slate-500">{t("agentSetup.step4Desc")}</p>
              </li>
            </ol>
          </section>
        </div>
      </Card>

      <Card className="border-slate-200 bg-slate-50 p-6">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">{t("agentSetup.securityTitle")}</h3>
        <p className="text-sm text-slate-600">{t("agentSetup.securityDesc")}</p>
      </Card>

      <AgentMcpCliHiddenGuidance />
    </div>
  );
}
