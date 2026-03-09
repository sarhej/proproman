-- CreateEnum
CREATE TYPE "NotificationScope" AS ENUM ('GLOBAL', 'DOMAIN', 'INITIATIVE', 'CAMPAIGN', 'FEATURE', 'USER');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'EMAIL', 'SLACK', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotificationRecipientKind" AS ENUM ('OBJECT_OWNER', 'OBJECT_ROLE', 'GLOBAL_ROLE', 'OBJECT_ASSIGNEE');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable: User add preferredLocale
ALTER TABLE "User" ADD COLUMN "preferredLocale" TEXT;

-- AlterTable: UserMessage add i18n and context columns, make title optional
ALTER TABLE "UserMessage" ADD COLUMN "titleKey" TEXT;
ALTER TABLE "UserMessage" ADD COLUMN "titleParams" JSONB;
ALTER TABLE "UserMessage" ADD COLUMN "bodyKey" TEXT;
ALTER TABLE "UserMessage" ADD COLUMN "bodyParams" JSONB;
ALTER TABLE "UserMessage" ADD COLUMN "linkLabelKey" TEXT;
ALTER TABLE "UserMessage" ADD COLUMN "linkLabelParams" JSONB;
ALTER TABLE "UserMessage" ADD COLUMN "entityType" TEXT;
ALTER TABLE "UserMessage" ADD COLUMN "entityId" TEXT;
ALTER TABLE "UserMessage" ADD COLUMN "auditEntryId" TEXT;
ALTER TABLE "UserMessage" ALTER COLUMN "title" DROP NOT NULL;

-- CreateTable: NotificationRule
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "eventKind" TEXT,
    "recipientKind" "NotificationRecipientKind" NOT NULL,
    "recipientRole" TEXT,
    "deliveryChannels" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserNotificationSubscription
CREATE TABLE "UserNotificationSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "scopeType" "NotificationScope" NOT NULL,
    "scopeId" TEXT,
    "deliveryChannels" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotificationSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable: UserNotificationPreference
CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channelIdentifier" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NotificationDelivery (userMessageId optional for placeholder deliveries)
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "userMessageId" TEXT,
    "userId" TEXT NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: NotificationRule
CREATE INDEX "NotificationRule_action_entityType_enabled_idx" ON "NotificationRule"("action", "entityType", "enabled");

-- CreateIndex: UserNotificationSubscription
CREATE UNIQUE INDEX "UserNotificationSubscription_userId_action_entityType_scopeType_scopeId_key" ON "UserNotificationSubscription"("userId", "action", "entityType", "scopeType", "scopeId");
CREATE INDEX "UserNotificationSubscription_userId_idx" ON "UserNotificationSubscription"("userId");

-- CreateIndex: UserNotificationPreference
CREATE UNIQUE INDEX "UserNotificationPreference_userId_channel_key" ON "UserNotificationPreference"("userId", "channel");
CREATE INDEX "UserNotificationPreference_userId_idx" ON "UserNotificationPreference"("userId");

-- CreateIndex: NotificationDelivery
CREATE INDEX "NotificationDelivery_userMessageId_idx" ON "NotificationDelivery"("userMessageId");
CREATE INDEX "NotificationDelivery_userId_idx" ON "NotificationDelivery"("userId");

-- CreateIndex: UserMessage unique (userId, auditEntryId) for idempotence
CREATE UNIQUE INDEX "UserMessage_userId_auditEntryId_key" ON "UserMessage"("userId", "auditEntryId");

-- AddForeignKey: UserNotificationSubscription
ALTER TABLE "UserNotificationSubscription" ADD CONSTRAINT "UserNotificationSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: UserNotificationPreference
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: NotificationDelivery (optional FK for placeholder channels)
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "UserMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
