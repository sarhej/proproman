import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useWorkspaceLinkBuilder } from "../hooks/useWorkspaceHref";
import { api } from "../lib/api";
import type { ExecutionBoard, ExecutionColumn, ProductWithHierarchy, TaskStatus } from "../types/models";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Label, Select } from "../components/ui/Field";

const TASK_STATUSES: TaskStatus[] = ["NOT_STARTED", "IN_PROGRESS", "TESTING", "DONE"];

type Props = {
  isAdmin: boolean;
  onRefreshBoard?: () => Promise<void>;
};

export function BoardSettingsPage({ isAdmin, onRefreshBoard }: Props) {
  const { t } = useTranslation();
  const { productId } = useParams<{ productId: string }>();
  const w = useWorkspaceLinkBuilder();
  const [searchParams, setSearchParams] = useSearchParams();
  const [product, setProduct] = useState<ProductWithHierarchy | null>(null);
  const [boards, setBoards] = useState<ExecutionBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [newColName, setNewColName] = useState("");
  const [newColStatus, setNewColStatus] = useState<TaskStatus>("NOT_STARTED");

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const [{ products }, { boards: bds }] = await Promise.all([
        api.getProducts(),
        api.getExecutionBoards(productId)
      ]);
      setProduct(products.find((p) => p.id === productId) ?? null);
      setBoards(bds);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const boardIdParam = searchParams.get("boardId");
  const selectedBoard = useMemo(() => {
    if (!boards.length) return null;
    if (boardIdParam) {
      const found = boards.find((b) => b.id === boardIdParam);
      if (found) return found;
    }
    return boards.find((b) => b.isDefault) ?? boards[0] ?? null;
  }, [boards, boardIdParam]);

  const setBoardId = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("boardId", id);
    setSearchParams(next);
  };

  const sortedColumns = useMemo(
    () => selectedBoard?.columns.slice().sort((a, b) => a.sortOrder - b.sortOrder) ?? [],
    [selectedBoard]
  );

  async function refreshAll() {
    await load();
    await onRefreshBoard?.();
  }

  async function createBoard() {
    if (!productId || !isAdmin) return;
    await api.createExecutionBoard(productId, { name: t("executionBoard.defaultBoardName"), isDefault: boards.length === 0 });
    await refreshAll();
  }

  async function addColumn() {
    if (!selectedBoard || !newColName.trim()) return;
    await api.createExecutionColumn(selectedBoard.id, {
      name: newColName.trim(),
      mappedStatus: newColStatus,
      sortOrder: sortedColumns.length,
      isDefault: false
    });
    setNewColName("");
    await refreshAll();
  }

  async function saveColumn(col: ExecutionColumn, patch: Partial<ExecutionColumn>) {
    await api.updateExecutionColumn(col.id, patch);
    await refreshAll();
  }

  async function removeColumn(col: ExecutionColumn) {
    if (!window.confirm(t("executionBoard.deleteColumnConfirm", { name: col.name }))) return;
    await api.deleteExecutionColumn(col.id);
    await refreshAll();
  }

  async function moveColumn(col: ExecutionColumn, delta: -1 | 1) {
    if (!selectedBoard) return;
    const idx = sortedColumns.findIndex((c) => c.id === col.id);
    const ni = idx + delta;
    if (idx < 0 || ni < 0 || ni >= sortedColumns.length) return;
    const reordered = sortedColumns.slice();
    const tmp = reordered[idx]!;
    reordered[idx] = reordered[ni]!;
    reordered[ni] = tmp;
    const rows = reordered.map((c, i) => ({ id: c.id, sortOrder: i }));
    await api.reorderExecutionColumns(selectedBoard.id, rows);
    await refreshAll();
  }

  if (!productId) {
    return <p className="p-4 text-sm text-slate-500">{t("executionBoard.missingProduct")}</p>;
  }

  if (loading) {
    return <p className="p-4 text-sm text-slate-500">{t("common.loading")}</p>;
  }

  if (!product) {
    return (
      <div className="space-y-2 p-4">
        <p className="text-sm text-slate-600">{t("executionBoard.productNotFound")}</p>
        <Link to={w("/product-explorer")} className="text-sm text-sky-600 hover:underline">
          {t("executionBoard.backToExplorer")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("boardSettings.title")}</h1>
          <p className="text-sm text-slate-600">
            {product.name} · {product.itemType === "SYSTEM" ? t("topLevelItem.system") : t("topLevelItem.product")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={w(
              `/products/${productId}/execution-board${selectedBoard ? `?boardId=${selectedBoard.id}` : ""}`
            )}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("executionBoard.openBoard")}
          </Link>
          <Link
            to={w("/product-explorer")}
            className="rounded border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("executionBoard.backToExplorer")}
          </Link>
        </div>
      </div>

      {boards.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-slate-600">{t("executionBoard.noBoard")}</p>
          {isAdmin ? (
            <Button type="button" className="mt-3" onClick={() => void createBoard()}>
              {t("executionBoard.createBoard")}
            </Button>
          ) : null}
        </Card>
      ) : (
        <>
          <div className="max-w-md">
            <Label>{t("executionBoard.selectBoard")}</Label>
            <Select value={selectedBoard?.id ?? ""} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          {selectedBoard ? (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                {t("boardSettings.columnsTitle")}
              </div>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="px-3 py-2">{t("boardSettings.order")}</th>
                    <th className="px-3 py-2">{t("common.name")}</th>
                    <th className="px-3 py-2">{t("boardSettings.pmStatus")}</th>
                    <th className="px-3 py-2">{t("boardSettings.defaultColumn")}</th>
                    <th className="px-3 py-2">{t("common.edit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedColumns.map((col, idx) => (
                    <tr key={col.id} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-1 text-xs disabled:opacity-40"
                            disabled={idx === 0}
                            onClick={() => void moveColumn(col, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-1 text-xs disabled:opacity-40"
                            disabled={idx === sortedColumns.length - 1}
                            onClick={() => void moveColumn(col, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          defaultValue={col.name}
                          className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== col.name) void saveColumn(col, { name: v });
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={col.mappedStatus}
                          onChange={(e) => void saveColumn(col, { mappedStatus: e.target.value as TaskStatus })}
                        >
                          {TASK_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {t(`common.taskStatus.${s}`)}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="radio"
                          name="defaultCol"
                          checked={col.isDefault}
                          onChange={() => void saveColumn(col, { isDefault: true })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => void removeColumn(col)}
                        >
                          {t("common.delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-3">
                <div>
                  <Label>{t("boardSettings.newColumnName")}</Label>
                  <input
                    type="text"
                    value={newColName}
                    onChange={(e) => setNewColName(e.target.value)}
                    className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <Label>{t("boardSettings.pmStatus")}</Label>
                  <Select value={newColStatus} onChange={(e) => setNewColStatus(e.target.value as TaskStatus)}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`common.taskStatus.${s}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button type="button" variant="secondary" onClick={() => void addColumn()}>
                  {t("boardSettings.addColumn")}
                </Button>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
