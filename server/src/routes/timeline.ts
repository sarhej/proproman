import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const timelineRouter = Router();
timelineRouter.use(requireAuth);

timelineRouter.get("/calendar", async (_req, res) => {
  const initiatives = await prisma.initiative.findMany({
    where: { archivedAt: null },
    include: {
      domain: true,
      owner: true
    },
    orderBy: { targetDate: "asc" }
  });
  const items = initiatives.map((i) => ({
    id: i.id,
    title: i.title,
    startDate: i.startDate,
    targetDate: i.targetDate,
    milestoneDate: i.milestoneDate,
    domain: i.domain.name,
    domainId: i.domainId,
    domainColor: i.domain.color,
    owner: i.owner?.name ?? null,
    dateConfidence: i.dateConfidence
  }));
  res.json({ items });
});

timelineRouter.get("/gantt", async (_req, res) => {
  const initiatives = await prisma.initiative.findMany({
    where: { archivedAt: null },
    include: {
      domain: true,
      owner: true,
      outgoingDeps: true,
      successCriteriaItems: true
    },
    orderBy: { startDate: "asc" }
  });
  const statusColors: Record<string, string> = {
    IDEA: "#94a3b8",
    PLANNED: "#3b82f6",
    IN_PROGRESS: "#f59e0b",
    DONE: "#22c55e",
    BLOCKED: "#ef4444"
  };
  const tasks = initiatives.map((i) => {
    const criteria = i.successCriteriaItems;
    const progressFromCriteria =
      criteria.length > 0
        ? Math.round((criteria.filter((c) => c.isDone).length / criteria.length) * 100)
        : null;
    const statusProgress =
      i.status === "DONE"
        ? 100
        : i.status === "IN_PROGRESS"
          ? 60
          : i.status === "PLANNED"
            ? 30
            : i.status === "BLOCKED"
              ? 10
              : 0;
    return {
      id: i.id,
      title: i.title,
      startDate: i.startDate,
      targetDate: i.targetDate,
      domain: i.domain.name,
      domainColor: i.domain.color,
      status: i.status,
      statusColor: statusColors[i.status] ?? i.domain.color,
      owner: i.owner?.name ?? null,
      progress: progressFromCriteria ?? statusProgress,
      dependencies: i.outgoingDeps.map((d) => d.toInitiativeId)
    };
  });
  res.json({ tasks });
});
