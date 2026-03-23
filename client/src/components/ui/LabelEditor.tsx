import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./Button";
import { Input } from "./Field";

type Props = {
  labels: string[];
  onChange?: (labels: string[]) => void | Promise<void>;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  /** Single-line toolbar: chips, input, add, and suggestions in one row (e.g. FiltersBar). */
  compact?: boolean;
};

function normalizeLabel(value: string): string {
  return value.trim().toLowerCase();
}

export function LabelEditor({
  labels,
  onChange,
  suggestions = [],
  placeholder,
  disabled = false,
  readOnly = false,
  className,
  compact = false
}: Props) {
  const { t } = useTranslation();
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const normalizedLabels = useMemo(() => labels.map(normalizeLabel), [labels]);
  const availableSuggestions = useMemo(
    () => suggestions.filter((value) => !normalizedLabels.includes(normalizeLabel(value))),
    [suggestions, normalizedLabels]
  );

  async function commit(rawValue: string) {
    if (!onChange) return;
    const next = normalizeLabel(rawValue);
    if (!next || normalizedLabels.includes(next)) return;
    await onChange([...labels, next]);
    setDraft("");
  }

  async function remove(label: string) {
    if (!onChange) return;
    await onChange(labels.filter((value) => value !== label));
  }

  const chipList =
    labels.length > 0 ? (
      labels.map((label) => (
        <span
          key={label}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {label}
          {!readOnly && onChange ? (
            <button
              type="button"
              className="text-slate-400 hover:text-red-600"
              disabled={disabled}
              onClick={() => void remove(label)}
              aria-label={t("labels.removeOne", { label })}
            >
              ×
            </button>
          ) : null}
        </span>
      ))
    ) : (
      <span className="shrink-0 text-sm italic text-slate-400">{t("labels.none")}</span>
    );

  const editorControls =
    !readOnly && onChange ? (
      <>
        <datalist id={inputId}>
          {availableSuggestions.map((label) => (
            <option key={label} value={label} />
          ))}
        </datalist>
        <Input
          list={inputId}
          value={draft}
          disabled={disabled}
          placeholder={placeholder ?? t("labels.placeholder")}
          className={compact ? "min-w-[10rem] max-w-[20rem] flex-1 sm:max-w-[18rem]" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              void commit(draft);
            }
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          disabled={disabled || !normalizeLabel(draft)}
          onClick={() => void commit(draft)}
        >
          {t("labels.add")}
        </Button>
        {availableSuggestions.length > 0
          ? availableSuggestions.slice(0, 10).map((label) => (
              <button
                key={label}
                type="button"
                className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                disabled={disabled}
                onClick={() => void commit(label)}
              >
                + {label}
              </button>
            ))
          : null}
      </>
    ) : null;

  if (compact) {
    return (
      <div className={className}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          {chipList}
          {editorControls}
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">{chipList}</div>

      {!readOnly && onChange ? (
        <>
          <div className="mt-3 flex gap-2">
            <Input
              list={inputId}
              value={draft}
              disabled={disabled}
              placeholder={placeholder ?? t("labels.placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  void commit(draft);
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={disabled || !normalizeLabel(draft)}
              onClick={() => void commit(draft)}
            >
              {t("labels.add")}
            </Button>
          </div>
          <datalist id={inputId}>
            {availableSuggestions.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          {availableSuggestions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {availableSuggestions.slice(0, 10).map((label) => (
                <button
                  key={label}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                  disabled={disabled}
                  onClick={() => void commit(label)}
                >
                  + {label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
