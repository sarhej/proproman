import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Initiative, AssignmentRole, InitiativeAssignment, User } from "../../types/models";
import { api } from "../../lib/api";
import { DomainBadge } from "../ui/DomainBadge";

const RACI_ROLES: { key: AssignmentRole; labelKey: string; short: string }[] = [
  { key: "ACCOUNTABLE", labelKey: "assignmentRole.ACCOUNTABLE", short: "A" },
  { key: "IMPLEMENTER", labelKey: "assignmentRole.IMPLEMENTER", short: "R" },
  { key: "CONSULTED", labelKey: "assignmentRole.CONSULTED", short: "C" },
  { key: "INFORMED", labelKey: "assignmentRole.INFORMED", short: "I" },
];

function UserBadge({
  assignment,
  readOnly,
  onRemove,
}: {
  assignment: InitiativeAssignment;
  readOnly: boolean;
  onRemove: () => void;
}) {
  return (
    <span className="group inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
      {assignment.user.avatarUrl ? (
        <img src={assignment.user.avatarUrl} alt="" className="h-4 w-4 rounded-full" />
      ) : null}
      <span className="max-w-[80px] truncate">{assignment.user.name}</span>
      {!readOnly && (
        <button
          type="button"
          className="ml-0.5 hidden rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 group-hover:inline-flex"
          title={assignment.user.name}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          &times;
        </button>
      )}
    </span>
  );
}

function AddUserDropdown({
  users,
  existingUserIds,
  onSelect,
  onClose,
}: {
  users: User[];
  existingUserIds: Set<string>;
  onSelect: (userId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  const available = users.filter(
    (u) => !existingUserIds.has(u.id) && u.name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div
      ref={ref}
      className="absolute z-30 mt-1 w-48 rounded border border-slate-200 bg-white shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        type="text"
        placeholder="Search..."
        className="w-full border-b px-2 py-1.5 text-xs outline-none"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      />
      <div className="max-h-40 overflow-y-auto">
        {available.map((u) => (
          <button
            key={u.id}
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
            onClick={() => {
              onSelect(u.id);
              onClose();
            }}
          >
            {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="h-4 w-4 rounded-full" /> : null}
            {u.name}
          </button>
        ))}
        {available.length === 0 && (
          <div className="px-2 py-2 text-xs text-slate-400">{t("raci.noUsers")}</div>
        )}
      </div>
    </div>
  );
}

function RaciCell({
  initiative,
  role,
  assignments,
  users,
  readOnly,
  onChanged,
}: {
  initiative: Initiative;
  role: AssignmentRole;
  assignments: InitiativeAssignment[];
  users: User[];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  const existingUserIds = new Set(assignments.map((a) => a.userId));

  async function handleRemove(a: InitiativeAssignment) {
    setLoading(true);
    try {
      await api.removeAssignment({
        initiativeId: initiative.id,
        userId: a.userId,
        role: a.role,
      });
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(userId: string) {
    setLoading(true);
    try {
      await api.addAssignment({
        initiativeId: initiative.id,
        userId,
        role,
      });
      onChanged();
    } finally {
      setLoading(false);
    }
  }

  return (
    <td className="relative py-2 px-3" onClick={(e) => e.stopPropagation()}>
      <div className={`flex flex-wrap items-center gap-1 ${loading ? "opacity-50" : ""}`}>
        {assignments.length === 0 && !showDropdown && (
          <span className="text-xs text-slate-300">--</span>
        )}
        {assignments.map((a) => (
          <UserBadge
            key={`${a.userId}-${a.role}`}
            assignment={a}
            readOnly={readOnly || loading}
            onRemove={() => handleRemove(a)}
          />
        ))}
        {!readOnly && !loading && (
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title={role}
            onClick={() => setShowDropdown(!showDropdown)}
          >
            +
          </button>
        )}
      </div>
      {showDropdown && (
        <AddUserDropdown
          users={users}
          existingUserIds={existingUserIds}
          onSelect={handleAdd}
          onClose={() => setShowDropdown(false)}
        />
      )}
    </td>
  );
}

type Props = {
  initiatives: Initiative[];
  users: User[];
  readOnly: boolean;
  onOpen: (initiative: Initiative) => void;
  onChanged: () => void;
};

export function RaciMatrix({ initiatives, users, readOnly, onOpen, onChanged }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

  const filtered = search
    ? initiatives.filter(
        (i) =>
          i.title.toLowerCase().includes(search.toLowerCase()) ||
          i.domain.name.toLowerCase().includes(search.toLowerCase())
      )
    : initiatives;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("raci.title")}</h2>
        <input
          type="text"
          placeholder={t("raci.searchPlaceholder")}
          className="rounded border px-3 py-1.5 text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 px-3 font-medium">{t("raci.initiative")}</th>
              <th className="py-2 px-3 font-medium">{t("raci.domain")}</th>
              {RACI_ROLES.map((r) => (
                <th key={r.key} className="py-2 px-3 font-medium">
                  <span title={t(r.labelKey)}>{r.short}</span>
                  <span className="ml-1 hidden font-normal normal-case sm:inline">({t(r.labelKey)})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((initiative) => {
              const hasAccountable = initiative.assignments.some((a) => a.role === "ACCOUNTABLE");
              return (
                <tr
                  key={initiative.id}
                  role="button"
                  tabIndex={0}
                  className={`border-b cursor-pointer hover:bg-slate-50 ${!hasAccountable ? "bg-amber-50/60" : ""}`}
                  onClick={() => onOpen(initiative)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onOpen(initiative);
                  }}
                >
                  <td className="py-2 px-3 font-medium">
                    <div className="flex items-center gap-2">
                      {!hasAccountable && (
                        <span
                          className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                          title={t("raci.noAccountable")}
                        >
                          !
                        </span>
                      )}
                      {initiative.title}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500">
                    <DomainBadge name={initiative.domain.name} color={initiative.domain.color} />
                  </td>
                  {RACI_ROLES.map((r) => (
                    <RaciCell
                      key={r.key}
                      initiative={initiative}
                      role={r.key}
                      assignments={initiative.assignments.filter((a) => a.role === r.key)}
                      users={users}
                      readOnly={readOnly}
                      onChanged={onChanged}
                    />
                  ))}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                  {t("raci.noInitiatives")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        {t("raci.footer", { count: filtered.length })}
        {!readOnly && ` ${t("raci.footerHelp")}`}
      </p>
    </div>
  );
}
