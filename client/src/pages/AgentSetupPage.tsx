import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Bot, Copy, Check } from "lucide-react";
import { useState } from "react";

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
          <h1 className="text-2xl font-bold text-slate-800">{t("agentSetup.title", "Connecting a Coding Agent")}</h1>
          <p className="text-sm text-slate-500">{t("agentSetup.subtitle", "Give your AI agent secure access to your Tymio workspace.")}</p>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          {t("agentSetup.howToConnect", "How to connect Cursor (or other MCP clients)")}
        </h2>
        
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            {t("agentSetup.intro", "Tymio uses the Model Context Protocol (MCP) to let your AI agent securely read and write data in your workspace. We use a Zero-Trust OAuth flow, which means you never have to copy or paste any API keys.")}
          </p>

          <ol className="ml-4 list-decimal space-y-3">
            <li>
              <strong>{t("agentSetup.step1", "Open Cursor Settings")}</strong>
              <p className="mt-1 text-slate-500">Go to <code>Cursor Settings</code> &rarr; <code>Features</code> &rarr; <code>MCP</code>.</p>
            </li>
            <li>
              <strong>{t("agentSetup.step2", "Add a new MCP Server")}</strong>
              <p className="mt-1 text-slate-500">Click <code>+ Add New MCP Server</code>.</p>
            </li>
            <li>
              <strong>{t("agentSetup.step3", "Configure the connection")}</strong>
              <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-medium text-slate-700">Type:</span>
                  <span className="rounded bg-slate-200 px-2 py-0.5 font-mono text-xs text-slate-800">remote</span>
                  <span className="ml-2 text-xs text-slate-500">(or SSE)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-700">URL:</span>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-800">{mcpUrl}</code>
                    <button
                      onClick={handleCopy}
                      className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      title="Copy URL"
                    >
                      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>
            </li>
            <li>
              <strong>{t("agentSetup.step4", "Click Connect")}</strong>
              <p className="mt-1 text-slate-500">
                {t("agentSetup.step4Desc", "Cursor will open a browser window. Log in to Tymio and authorize the connection. The browser will automatically redirect back to Cursor, establishing a secure, stable connection.")}
              </p>
            </li>
          </ol>
        </div>
      </Card>

      <Card className="p-6 bg-slate-50 border-slate-200">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">
          {t("agentSetup.securityTitle", "Security & Zero-Trust")}
        </h3>
        <p className="text-sm text-slate-600">
          {t("agentSetup.securityDesc", "Your agent uses Refresh Token Rotation (RTR) and PKCE. Every time the agent reconnects, its token is rotated. If a token is ever intercepted and reused, the entire connection is instantly revoked to protect your workspace.")}
        </p>
      </Card>
    </div>
  );
}
