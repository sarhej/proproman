import { prisma } from "../db.js";
import { TaskStatus } from "@prisma/client";

/** Next board order index within a column (or unassigned) for a product. */
export async function nextExecutionSortOrder(
  productId: string,
  executionColumnId: string | null
): Promise<number> {
  const agg = await prisma.requirement.aggregate({
    where: {
      feature: { initiative: { productId } },
      executionColumnId: executionColumnId === null ? { equals: null } : executionColumnId
    },
    _max: { executionSortOrder: true }
  });
  return (agg._max.executionSortOrder ?? -1) + 1;
}

export async function productIdForFeature(featureId: string): Promise<string | null> {
  const feature = await prisma.feature.findUnique({
    where: { id: featureId },
    select: { initiative: { select: { productId: true } } }
  });
  return feature?.initiative?.productId ?? null;
}

export type ColumnApplyResult = {
  executionColumnId: string | null;
  status?: TaskStatus;
  isDone?: boolean;
};

/** When assigning a column, sync PM status + isDone from column mapping. */
export async function applyExecutionColumn(
  featureId: string,
  columnId: string | null
): Promise<ColumnApplyResult> {
  if (columnId === null) {
    return { executionColumnId: null };
  }
  const column = await prisma.executionColumn.findUnique({
    where: { id: columnId },
    include: { board: { select: { productId: true } } }
  });
  if (!column) {
    throw new Error("UNKNOWN_COLUMN");
  }
  const productId = await productIdForFeature(featureId);
  if (!productId || column.board.productId !== productId) {
    throw new Error("COLUMN_PRODUCT_MISMATCH");
  }
  return {
    executionColumnId: columnId,
    status: column.mappedStatus,
    isDone: column.mappedStatus === TaskStatus.DONE
  };
}
