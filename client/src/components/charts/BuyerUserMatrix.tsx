import { useMemo } from "react";
import { CartesianGrid, Label, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
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

const JITTER_SPREAD = 0.08;

function seededRandom(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function applyJitter(points: BuyerUserPoint[]): BuyerUserPoint[] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < points.length; i++) {
    const key = `${points[i].buyer},${points[i].user}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  }

  const result = points.map((p) => ({ ...p }));
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    for (const idx of indices) {
      const rng = seededRandom(hashCode(result[idx].id));
      const dx = (rng() - 0.5) * 2 * JITTER_SPREAD;
      const dy = (rng() - 0.5) * 2 * JITTER_SPREAD;
      result[idx].x = Number(Math.max(0, Math.min(5, result[idx].buyer + dx)).toFixed(3));
      result[idx].y = Number(Math.max(0, Math.min(5, result[idx].user + dy)).toFixed(3));
    }
  }
  return result;
}

export function BuyerUserMatrix({ initiatives, onOpen }: Props) {
  const data = useMemo(() => {
    const raw = initiatives.map((initiative) => {
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
    return applyJitter(raw);
  }, [initiatives]);

  function openByPoint(point: unknown) {
    if (!onOpen) return;
    if (!point || typeof point !== "object" || !("payload" in point)) return;
    const payload = (point as { payload?: BuyerUserPoint }).payload;
    if (!payload?.id) return;
    const initiative = initiatives.find((i) => i.id === payload.id);
    if (initiative) onOpen(initiative);
  }

  return (
    <div className="h-[480px] rounded-lg border border-slate-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 20, left: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

          <ReferenceArea x1={0} x2={2.5} y1={0} y2={2.5} fill="#fecaca" fillOpacity={0.35} />
          <ReferenceArea x1={2.5} x2={5} y1={0} y2={2.5} fill="#fde68a" fillOpacity={0.35} />
          <ReferenceArea x1={0} x2={2.5} y1={2.5} y2={5} fill="#bfdbfe" fillOpacity={0.35} />
          <ReferenceArea x1={2.5} x2={5} y1={2.5} y2={5} fill="#bbf7d0" fillOpacity={0.35} />

          <XAxis dataKey="x" name="Buyer impact" type="number" domain={[0, 5]} tick={{ fontSize: 12 }}>
            <Label value="Buyer Impact →" position="bottom" offset={10} style={{ fontSize: 13, fill: "#475569" }} />
          </XAxis>
          <YAxis dataKey="y" name="User impact" type="number" domain={[0, 5]} tick={{ fontSize: 12 }}>
            <Label value="User Impact →" angle={-90} position="left" offset={-2} style={{ fontSize: 13, fill: "#475569" }} />
          </YAxis>

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
