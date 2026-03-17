-- CreateTable
CREATE TABLE IF NOT EXISTS "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");
CREATE INDEX IF NOT EXISTS "McpOAuthClient_clientId_idx" ON "McpOAuthClient"("clientId");
