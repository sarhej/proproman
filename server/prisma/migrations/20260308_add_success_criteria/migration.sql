-- CreateTable
CREATE TABLE "SuccessCriterion" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuccessCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuccessCriterion_initiativeId_idx" ON "SuccessCriterion"("initiativeId");

-- AddForeignKey
ALTER TABLE "SuccessCriterion" ADD CONSTRAINT "SuccessCriterion_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
