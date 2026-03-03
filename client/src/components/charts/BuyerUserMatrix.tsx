import { CartesianGrid, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { Initiative } from "../../types/models";
import { avg } from "../../lib/format";

type Props = {
  initiatives: Initiative[];
};

export function BuyerUserMatrix({ initiatives }: Props) {
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
      x: Number(buyer.toFixed(2)),
      y: Number(user.toFixed(2)),
      name: initiative.title
    };
  });

  return (
    <div className="h-[420px] rounded-lg border border-slate-200 bg-white p-3">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 10, left: 10, bottom: 20 }}>
          <CartesianGrid />
          <ReferenceArea x1={0} x2={2.5} y1={0} y2={2.5} />
          <ReferenceArea x1={2.5} x2={5} y1={2.5} y2={5} />
          <XAxis dataKey="x" name="Buyer impact" type="number" domain={[0, 5]} />
          <YAxis dataKey="y" name="User impact" type="number" domain={[0, 5]} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={data} fill="#0284c7" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
