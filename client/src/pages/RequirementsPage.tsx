import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { Initiative, Requirement } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";

type Props = {
  initiatives: Initiative[];
  isAdmin: boolean;
};

export function RequirementsPage({ initiatives, isAdmin }: Props) {
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [featureId, setFeatureId] = useState(initiatives.flatMap((i) => i.features)[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const features = initiatives.flatMap((i) => i.features.map((f) => ({ ...f, initiativeTitle: i.title })));

  async function load() {
    const result = await api.getRequirements();
    setRequirements(result.requirements);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Requirements</h2>
      {isAdmin ? (
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
          <Select value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
            {features.map((f) => (
              <option key={f.id} value={f.id}>
                {f.initiativeTitle} / {f.title}
              </option>
            ))}
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Requirement title" />
          <Button
            onClick={async () => {
              if (!featureId || !title.trim()) return;
              await api.createRequirement({ featureId, title, isDone: false, priority: "P2" });
              setTitle("");
              await load();
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2">
        {requirements.map((r) => (
          <div key={r.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
            <div className="font-medium">{r.title}</div>
            <div className="text-slate-500">
              {r.priority} • {r.isDone ? "Done" : "Open"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
