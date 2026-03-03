export function DomainBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span>{name}</span>
    </span>
  );
}

export function RevenueStreamBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${color}22`, color }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}
