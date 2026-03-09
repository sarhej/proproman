-- CreateTable
CREATE TABLE "InitiativeComment" (
    "id" TEXT NOT NULL,
    "initiativeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InitiativeComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InitiativeComment_initiativeId_idx" ON "InitiativeComment"("initiativeId");

-- CreateIndex
CREATE INDEX "InitiativeComment_userId_idx" ON "InitiativeComment"("userId");

-- AddForeignKey
ALTER TABLE "InitiativeComment" ADD CONSTRAINT "InitiativeComment_initiativeId_fkey" FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InitiativeComment" ADD CONSTRAINT "InitiativeComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
