import { BuyerUserMatrix } from "../components/charts/BuyerUserMatrix";
import type { Initiative } from "../types/models";

type Props = {
  initiatives: Initiative[];
  onOpen: (initiative: Initiative) => void;
};

const QUADRANTS = [
  { color: "bg-green-200", label: "Sweet Spot", desc: "High value for both buyers and users. Prioritize these initiatives." },
  { color: "bg-blue-200", label: "User-Driven", desc: "Great user experience but limited buyer appeal. May be hard to sell internally." },
  { color: "bg-amber-200", label: "Buyer-Driven", desc: "Strong buyer value but limited user benefit. Revenue play — watch for adoption/churn risk." },
  { color: "bg-red-200", label: "Low Impact", desc: "Neither buyers nor users benefit much. Deprioritize or reconsider." }
] as const;

export function BuyerUserPage({ initiatives, onOpen }: Props) {
  return (
    <div className="space-y-4">
      <BuyerUserMatrix initiatives={initiatives} onOpen={onOpen} />

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">How to read this chart</h3>

        <p className="mb-3 text-xs leading-relaxed text-slate-600">
          Each dot is one initiative positioned by how much value it delivers to <strong>buyers</strong> (x-axis) versus{" "}
          <strong>users</strong> (y-axis). Overlapping dots are slightly spread apart. Hover for details, click to open.
        </p>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">Buyer axis (X)</p>
            <p className="mt-1 text-xs text-slate-500">
              Average impact on purchasing personas: <em>Employer, Insurer, B2B Admin, Regulator</em>. They care about ROI,
              compliance, and cost efficiency.
            </p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-700">User axis (Y)</p>
            <p className="mt-1 text-xs text-slate-500">
              Average impact on end-user personas: <em>Patient, Doctor</em>. They care about usability, health outcomes, and
              workflow fit.
            </p>
          </div>
        </div>

        <h4 className="mb-2 text-xs font-semibold text-slate-700">Quadrant legend</h4>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {QUADRANTS.map((q) => (
            <div key={q.label} className="flex items-start gap-2">
              <span className={`mt-0.5 inline-block h-3 w-3 shrink-0 rounded ${q.color}`} />
              <p className="text-xs text-slate-600">
                <strong>{q.label}:</strong> {q.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
