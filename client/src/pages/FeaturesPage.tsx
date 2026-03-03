import { useState } from "react";
import { api } from "../lib/api";
import type { Initiative } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Field";

type Props = {
  initiatives: Initiative[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
};

export function FeaturesPage({ initiatives, isAdmin, onRefresh }: Props) {
  const [initiativeId, setInitiativeId] = useState(initiatives[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const features = initiatives.flatMap((initiative) =>
    initiative.features.map((feature) => ({
      ...feature,
      initiativeTitle: initiative.title
    }))
  );

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-lg font-semibold">Features</h2>
      {isAdmin ? (
        <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
          <Select value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
            {initiatives.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New feature title" />
          <Button
            onClick={async () => {
              if (!initiativeId || !title.trim()) return;
              await api.createFeature(initiativeId, { title, status: "IDEA" });
              setTitle("");
              await onRefresh();
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2">
        {features.map((feature) => (
          <div key={feature.id} className="rounded border border-slate-200 px-3 py-2 text-sm">
            <div className="font-medium">{feature.title}</div>
            <div className="text-slate-500">
              {feature.initiativeTitle} • {feature.status}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
