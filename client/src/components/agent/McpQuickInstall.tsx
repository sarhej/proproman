import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, ExternalLink, Terminal } from "lucide-react";
import { Card } from "../ui/Card";
import {
  buildBootstrapCommand,
  buildClaudeMcpAddCommand,
  buildClaudeProjectMcpJson,
  buildCursorMcpInstallLink,
  buildCursorProjectMcpJson,
  mcpServerName
} from "../../lib/mcpInstallLinks";

type CopyField = "claudeCommand" | "claudeJson" | "cursorJson" | "bootstrap" | null;

interface McpQuickInstallProps {
  mcpUrl: string;
  workspaceSlug: string;
  hubOrigin: string;
}

export function McpQuickInstall({ mcpUrl, workspaceSlug, hubOrigin }: McpQuickInstallProps) {
  const { t } = useTranslation();
  const [copiedField, setCopiedField] = useState<CopyField>(null);

  const serverName = useMemo(() => mcpServerName(workspaceSlug), [workspaceSlug]);
  const cursorInstallLink = useMemo(
    () => buildCursorMcpInstallLink(mcpUrl, serverName),
    [mcpUrl, serverName]
  );
  const claudeCommand = useMemo(
    () => buildClaudeMcpAddCommand(mcpUrl, serverName),
    [mcpUrl, serverName]
  );
  const claudeProjectJson = useMemo(
    () => buildClaudeProjectMcpJson(mcpUrl, serverName),
    [mcpUrl, serverName]
  );
  const cursorProjectJson = useMemo(
    () => buildCursorProjectMcpJson(mcpUrl, serverName),
    [mcpUrl, serverName]
  );
  const bootstrapCommand = useMemo(
    () => buildBootstrapCommand(workspaceSlug, hubOrigin),
    [workspaceSlug, hubOrigin]
  );

  const copyText = useCallback(async (text: string, field: CopyField) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // ignore
    }
  }, []);

  return (
    <Card className="border-emerald-200 bg-emerald-50/80 p-6">
      <h2 className="mb-1 text-lg font-semibold text-emerald-950">{t("agentSetup.quickInstallTitle")}</h2>
      <p className="mb-5 text-sm leading-relaxed text-emerald-900/90">
        {workspaceSlug !== ""
          ? t("agentSetup.quickInstallIntroWorkspace")
          : t("agentSetup.quickInstallIntroDiscovery")}
      </p>

      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-emerald-200/80 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">{t("agentSetup.addToCursorTitle")}</h3>
              <p className="mt-1 text-xs text-slate-600">{t("agentSetup.addToCursorHint")}</p>
            </div>
            <a
              href={cursorInstallLink}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              <ExternalLink size={16} aria-hidden />
              {t("agentSetup.addToCursorButton")}
            </a>
          </div>
          <CopySnippet
            label={t("agentSetup.cursorProjectJsonLabel")}
            hint={t("agentSetup.cursorProjectJsonHint")}
            value={cursorProjectJson}
            copied={copiedField === "cursorJson"}
            onCopy={() => void copyText(cursorProjectJson, "cursorJson")}
            copyTitle={t("agentSetup.copySnippetTitle")}
            copiedLabel={t("agentSetup.copiedLabel")}
          />
        </div>

        <div className="rounded-lg border border-emerald-200/80 bg-white p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-800">{t("agentSetup.claudeCodeTitle")}</h3>
            <p className="mt-1 text-xs text-slate-600">{t("agentSetup.claudeCodeHint")}</p>
          </div>
          <CopySnippet
            label={t("agentSetup.claudeCommandLabel")}
            hint={t("agentSetup.claudeCommandHint")}
            value={claudeCommand}
            copied={copiedField === "claudeCommand"}
            onCopy={() => void copyText(claudeCommand, "claudeCommand")}
            copyTitle={t("agentSetup.copySnippetTitle")}
            copiedLabel={t("agentSetup.copiedLabel")}
            mono
            icon={<Terminal size={14} className="text-slate-500" aria-hidden />}
          />
          <div className="mt-4">
            <CopySnippet
              label={t("agentSetup.claudeProjectJsonLabel")}
              hint={t("agentSetup.claudeProjectJsonHint")}
              value={claudeProjectJson}
              copied={copiedField === "claudeJson"}
              onCopy={() => void copyText(claudeProjectJson, "claudeJson")}
              copyTitle={t("agentSetup.copySnippetTitle")}
              copiedLabel={t("agentSetup.copiedLabel")}
            />
          </div>
        </div>

        <div className="rounded-lg border border-emerald-200/80 bg-white p-4">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-slate-800">{t("agentSetup.bootstrapTitle")}</h3>
            <p className="mt-1 text-xs text-slate-600">{t("agentSetup.bootstrapHint")}</p>
          </div>
          <CopySnippet
            label={t("agentSetup.bootstrapCommandLabel")}
            value={bootstrapCommand}
            copied={copiedField === "bootstrap"}
            onCopy={() => void copyText(bootstrapCommand, "bootstrap")}
            copyTitle={t("agentSetup.copySnippetTitle")}
            copiedLabel={t("agentSetup.copiedLabel")}
            mono
          />
        </div>
      </div>

      <p className="mt-4 text-xs text-emerald-900/80">{t("agentSetup.quickInstallOAuthNote")}</p>
    </Card>
  );
}

function CopySnippet({
  label,
  hint,
  value,
  copied,
  onCopy,
  copyTitle,
  copiedLabel,
  mono = false,
  icon
}: {
  label: string;
  hint?: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  copyTitle: string;
  copiedLabel: string;
  mono?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-slate-700">{label}</span>
      </div>
      {hint ? <p className="mb-2 text-xs text-slate-500">{hint}</p> : null}
      <div className="flex items-start gap-2">
        <pre
          className={`min-w-0 flex-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100 ${
            mono ? "whitespace-pre-wrap break-all" : ""
          }`}
        >
          {value.trimEnd()}
        </pre>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          title={copyTitle}
          aria-label={copyTitle}
        >
          {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
        </button>
      </div>
      {copied ? <p className="mt-1 text-xs text-emerald-700">{copiedLabel}</p> : null}
    </div>
  );
}
