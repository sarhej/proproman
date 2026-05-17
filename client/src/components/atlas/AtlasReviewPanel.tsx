import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type Proposal = {
  id: string;
  proposalType: string;
  status: string;
  fieldPath: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  sources: Array<{ kind: string; ref: string; excerpt?: string | null }>;
  confidence: number | null;
  createdByAgent: string;
  architectureTopic: { id: string; slug: string; title: string; lockedFields?: unknown } | null;
};

type Props = {
  isAdmin: boolean;
};

function formatValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && value !== null && "value" in value) {
    const inner = (value as { value: unknown }).value;
    return Array.isArray(inner) ? inner.join("\n") : String(inner);
  }
  return JSON.stringify(value, null, 2);
}

export function AtlasReviewPanel({ isAdmin }: Props) {
  const { t } = useTranslation();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAtlasProposals("PENDING");
      setProposals(res.proposals as Proposal[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function accept(proposal: Proposal) {
    setBusyId(proposal.id);
    try {
      const edited = editValues[proposal.id];
      let proposedValue: unknown = proposal.proposedValue;
      if (edited !== undefined && proposal.proposalType === "TOPIC_LAYER_PATCH") {
        const base = proposal.proposedValue as { field: string; value: unknown };
        proposedValue = {
          field: base.field,
          value: base.field === "synonyms" || base.field === "docPaths" ? edited.split("\n").filter(Boolean) : edited
        };
      }
      await api.acceptAtlasProposal(proposal.id, { proposedValue });
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(proposal: Proposal) {
    setBusyId(proposal.id);
    try {
      await api.rejectAtlasProposal(proposal.id, {});
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">{t("atlasHub.loading")}</p>;
  }

  if (proposals.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{t("atlasHub.reviewIntro")}</p>
        <Card className="p-6 text-center">
          <p className="text-sm font-medium text-slate-800">{t("atlasHub.reviewEmptyTitle")}</p>
          <p className="mt-2 text-sm text-slate-600">{t("atlasHub.reviewEmptyBody")}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t("atlasHub.reviewIntro")}</p>
      {proposals.map((p) => {
        const proposedText = formatValue(p.proposedValue);
        const currentText = formatValue(p.currentValue);
        const isPatch = p.proposalType === "TOPIC_LAYER_PATCH";
        return (
          <Card key={p.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-700">
                {p.proposalType}
              </span>
              <span className="text-sm font-medium text-slate-900">
                {p.architectureTopic?.title ?? t("atlasHub.unknownTopic")}
              </span>
              {p.fieldPath ? (
                <span className="font-mono text-xs text-slate-500">{p.fieldPath}</span>
              ) : null}
            </div>

            {isPatch ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500">{t("atlasHub.reviewCurrent")}</h3>
                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-red-50 p-2 text-xs text-slate-800">
                    {currentText || t("atlasHub.reviewEmptyValue")}
                  </pre>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-500">{t("atlasHub.reviewProposed")}</h3>
                  {isAdmin ? (
                    <textarea
                      className="mt-1 w-full rounded border border-slate-200 p-2 font-mono text-xs"
                      rows={5}
                      defaultValue={proposedText}
                      onChange={(e) =>
                        setEditValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                    />
                  ) : (
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-green-50 p-2 text-xs text-slate-800">
                      {proposedText}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <pre className="max-h-40 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-800">
                {proposedText}
              </pre>
            )}

            <ul className="text-xs text-slate-600">
              {p.sources.map((s, i) => (
                <li key={`${s.ref}-${i}`}>
                  <span className="font-medium">{s.kind}</span>: {s.ref}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              {t("atlasHub.reviewMeta", {
                agent: p.createdByAgent,
                confidence: p.confidence != null ? Math.round(p.confidence * 100) : "—"
              })}
            </p>

            {isAdmin ? (
              <div className="flex gap-2">
                <Button
                  className="h-8 text-xs"
                  disabled={busyId === p.id}
                  onClick={() => void accept(p)}
                >
                  {t("atlasHub.reviewAccept")}
                </Button>
                <Button
                  variant="ghost"
                  className="h-8 text-xs"
                  disabled={busyId === p.id}
                  onClick={() => void reject(p)}
                >
                  {t("atlasHub.reviewReject")}
                </Button>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
