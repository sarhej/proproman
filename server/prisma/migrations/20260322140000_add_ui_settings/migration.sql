-- CreateTable
CREATE TABLE "UiSettings" (
    "id" TEXT NOT NULL,
    "hiddenNavPaths" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiSettings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "UiSettings" ("id", "hiddenNavPaths", "updatedAt") VALUES ('default', '[]', CURRENT_TIMESTAMP);
