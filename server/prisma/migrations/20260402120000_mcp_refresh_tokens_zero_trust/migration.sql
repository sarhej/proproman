-- CreateTable
CREATE TABLE "McpRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "familyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpRefreshToken_token_key" ON "McpRefreshToken"("token");

-- CreateIndex
CREATE INDEX "McpRefreshToken_token_idx" ON "McpRefreshToken"("token");

-- CreateIndex
CREATE INDEX "McpRefreshToken_familyId_idx" ON "McpRefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "McpRefreshToken_userId_clientId_idx" ON "McpRefreshToken"("userId", "clientId");

-- AddForeignKey
ALTER TABLE "McpRefreshToken" ADD CONSTRAINT "McpRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
