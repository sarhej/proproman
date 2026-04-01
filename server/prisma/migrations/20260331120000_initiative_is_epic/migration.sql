-- Distinguish Product Explorer epics from board-first initiatives.
ALTER TABLE "Initiative" ADD COLUMN "isEpic" BOOLEAN NOT NULL DEFAULT false;
