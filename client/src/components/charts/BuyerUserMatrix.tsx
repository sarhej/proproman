import { CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Initiative } from "../../types/models";
import { avg } from "../../lib/format";

type Props = {
  initiatives: Initiative[];
  onOpen?: (initiative: Initiative) => void;
};

type BuyerUserPoint = {
  id: string;
  x: number;
  y: number;
  name: string;
  buyer: number;
  user: number;
  domain: string;
  owner: string;
};

export function BuyerUserMatrix({ initiatives, onOpen }: Props) {
  const data = initiatives.map((initiative) => {
    const buyer = avg(
      initiative.personaImpacts
        .filter((p) => ["Employer", "Insurer", "B2B Admin", "Regulator"].includes(p.persona.name))
        .map((p) => p.impact)
    );
    const user = avg(
      initiative.personaImpacts.filter((p) => ["Patient", "Doctor"].includes(p.persona.name)).map((p) => p.impact)
    );
    return {
      id: initiative.id,
      x: Number(buyer.toFixed(2)),
      y: Number(user.toFixed(2)),
      buyer: Number(buyer.toFixed(2)),
      user: Number(user.toFixed(2)),
      name: initiative.title,
      domain: initiative.domain.name,
      owner: initiative.owner?.name ?? "Unassigned"
    };
  });

  function openByPoint(point: unknown) {
    if (!onOpen) return;
    if (!point || typeof point !== "object" || !("payload" in point)) return;
    const payload = (point as { payload?: BuyerUserPoint }).payload;
    if (!payload?.id) return;
    const initiative = initiatives.find((i) => i.id === payload.id);
    if (initiative) onOpen(initiative);
  }

  return (
    <div className="h-[420px] rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-2 text-sm text-slate-600">Each point is one initiative. Click a point to open details.</p>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 10, left: 10, bottom: 20 }}>
          <CartesianGrid />
          <ReferenceArea x1={0} x2={2.5} y1={0} y2={2.5} />
          <ReferenceArea x1={2.5} x2={5} y1={2.5} y2={5} />
          <XAxis dataKey="x" name="Buyer impact" type="number" domain={[0, 5]} />
          <YAxis dataKey="y" name="User impact" type="number" domain={[0, 5]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as BuyerUserPoint | undefined;
              if (!point) return null;
              return (
                <div className="rounded-md border border-slate-200 bg-white p-2 text-xs shadow-sm">
                  <p className="font-semibold text-slate-900">{point.name}</p>
                  <p className="text-slate-600">Domain: {point.domain}</p>
                  <p className="text-slate-600">Owner: {point.owner}</p>
                  <p className="mt-1 text-slate-700">
                    Buyer: {point.buyer} | User: {point.user}
                  </p>
                </div>
              );
            }}
          />
          <Scatter data={data} fill="#0284c7" onClick={openByPoint} style={{ cursor: "pointer" }} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
