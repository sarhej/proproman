import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

messagesRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  const unreadOnly = req.query.unreadOnly === "true";
  const messages = await prisma.userMessage.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {})
    },
    orderBy: { createdAt: "desc" }
  });
  const unreadCount = await prisma.userMessage.count({
    where: { userId, readAt: null }
  });
  res.json({ messages, unreadCount });
});

messagesRouter.patch("/:id/read", async (req, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id);
  const msg = await prisma.userMessage.findFirst({
    where: { id, userId }
  });
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }
  const updated = await prisma.userMessage.update({
    where: { id },
    data: { readAt: new Date() }
  });
  res.json({ message: updated });
});
