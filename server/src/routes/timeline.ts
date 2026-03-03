import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const timelineRouter = Router();
timelineRouter.use(requireAuth);

timelineRouter.get("/calendar", async (_req, res) => {
  const initiatives = await prisma.initiative.findMany({
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
    owner: i.owner?.name ?? null,
    dateConfidence: i.dateConfidence
  }));
  res.json({ items });
});

timelineRouter.get("/gantt", async (_req, res) => {
  const initiatives = await prisma.initiative.findMany({
    include: {
      outgoingDeps: true
    },
    orderBy: { startDate: "asc" }
  });
  const tasks = initiatives.map((i) => ({
    id: i.id,
    title: i.title,
    startDate: i.startDate,
    targetDate: i.targetDate,
    progress:
      i.status === "DONE"
        ? 100
        : i.status === "IN_PROGRESS"
          ? 60
          : i.status === "PLANNED"
            ? 30
            : i.status === "BLOCKED"
              ? 10
              : 0,
    dependencies: i.outgoingDeps.map((d) => d.toInitiativeId)
  }));
  res.json({ tasks });
});
