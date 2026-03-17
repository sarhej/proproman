import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { Initiative, Requirement } from "../types/models";
import { formatPriority } from "../lib/format";
import { Button } from "../components/ui/Button";

type Props = {
  initiatives: Initiative[];
  onOpenInitiative: (initiative: Initiative) => void;
  onSaved?: () => Promise<void>;
  readOnly?: boolean;
};

function findRequirement(
  initiatives: Initiative[],
  requirementId: string
): { requirement: Requirement; initiative: Initiative; feature: { id: string; title: string } } | null {
  for (const init of initiatives) {
    for (const feat of init.features ?? []) {
      const req = feat.requirements?.find((r) => r.id === requirementId);
      if (req) return { requirement: req, initiative: init, feature: { id: feat.id, title: feat.title } };
    }
  }
  return null;
}

export function RequirementDetailPage({ initiatives, onOpenInitiative, onSaved, readOnly }: Props) {
  const { requirementId } = useParams<{ requirementId: string }>();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const found = requirementId ? findRequirement(initiatives, requirementId) : null;

  if (!requirementId) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Missing requirement ID.</p>
        <Link to="/product-explorer" className="text-sky-600 hover:underline">
          Back to Product Explorer
        </Link>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="p-4">
        <p className="text-slate-600">Requirement not found.</p>
        <Link to="/product-explorer" className="text-sky-600 hover:underline">
          Back to Product Explorer
        </Link>
      </div>
    );
  }

  const { requirement, initiative, feature } = found;
  const product = initiative.product;
  const isDone = requirement.isDone || requirement.status === "DONE";
  const siblings = (initiative.features ?? [])
    .flatMap((f) => (f.id === feature.id ? (f.requirements ?? []) : []))
    .filter((r) => r.id !== requirement.id);

  return (
    <div className="space-y-4 p-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link to="/product-explorer" className="hover:text-slate-700">
          Product Explorer
        </Link>
        <span aria-hidden>/</span>
        <button
          type="button"
          onClick={() => onOpenInitiative(initiative)}
          className="hover:text-sky-600 hover:underline"
        >
          {initiative.title}
        </button>
        <span aria-hidden>/</span>
        <Link to={`/features/${feature.id}`} className="hover:text-sky-600 hover:underline">
          {feature.title}
        </Link>
        <span aria-hidden>/</span>
        <span className="font-medium text-slate-800">{requirement.title}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{requirement.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {product?.name ?? "—"} · {initiative.title} · {feature.title}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {formatPriority(requirement.priority)}
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isDone ? "bg-green-100 text-green-800" : "bg-sky-100 text-sky-800"
            }`}
          >
            {isDone ? "Done" : requirement.status ?? "Open"}
          </span>
          {!readOnly && (
            <>
              <Button
                variant="secondary"
                disabled={toggling}
                onClick={async () => {
                  setToggling(true);
                  try {
                    await api.updateRequirement(requirement.id, {
                      isDone: !isDone,
                      status: isDone ? "NOT_STARTED" : "DONE"
                    });
                    await onSaved?.();
                  } finally {
                    setToggling(false);
                  }
                }}
              >
                {isDone ? "Reopen" : "Mark done"}
              </Button>
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={async () => {
                  if (!window.confirm("Delete this requirement?")) return;
                  setDeleting(true);
                  try {
                    await api.deleteRequirement(requirement.id);
                    window.history.back();
                    await onSaved?.();
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {requirement.description ? (
        <section>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Description</h2>
          <p className="text-sm text-slate-600">{requirement.description}</p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Feature</h2>
        <Link to={`/features/${feature.id}`} className="text-sm text-sky-600 hover:underline">
          {feature.title}
        </Link>
      </section>

      {siblings.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Other tasks in this feature</h2>
          <ul className="space-y-1">
            {siblings.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/requirements/${r.id}`} className="text-sm text-sky-600 hover:underline">
                  {r.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
