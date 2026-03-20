const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    // Check if the RBAC column exists
    const colCheck = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'isActive'"
    );

    if (colCheck.rowCount === 0) {
      console.log("isActive column missing. Applying RBAC migration directly...");

      // Create AuditAction enum if not exists
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuditAction') THEN
            CREATE TYPE "AuditAction" AS ENUM ('CREATED', 'UPDATED', 'DELETED', 'STATUS_CHANGED', 'ROLE_CHANGED', 'LOGIN');
          END IF;
        END $$;
      `);

      // Add enum values safely (outside transaction via DO block workaround)
      const existingValues = await pool.query(
        "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'UserRole'"
      );
      const existing = existingValues.rows.map(r => r.enumlabel);
      
      for (const val of ['SUPER_ADMIN', 'EDITOR', 'MARKETING']) {
        if (!existing.includes(val)) {
          await pool.query(`ALTER TYPE "UserRole" ADD VALUE '${val}'`);
          console.log(`Added enum value: ${val}`);
        }
      }

      // Add columns
      await pool.query(`
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
      `);

      // Create AuditEntry table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "AuditEntry" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "action" "AuditAction" NOT NULL,
          "entityType" TEXT NOT NULL,
          "entityId" TEXT,
          "details" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "AuditEntry_userId_idx" ON "AuditEntry"("userId");
        CREATE INDEX IF NOT EXISTS "AuditEntry_entityType_entityId_idx" ON "AuditEntry"("entityType", "entityId");
        CREATE INDEX IF NOT EXISTS "AuditEntry_createdAt_idx" ON "AuditEntry"("createdAt");
      `);

      // Add FK if not exists
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuditEntry_userId_fkey') THEN
            ALTER TABLE "AuditEntry" ADD CONSTRAINT "AuditEntry_userId_fkey"
              FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);

      console.log("RBAC migration applied successfully via direct SQL.");
    } else {
      console.log("isActive column exists. No repair needed.");
    }

    // Check if Persona.category from 20260303213715_add_persona_category exists
    const personaCategoryCheck = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'Persona' AND column_name = 'category'"
    );

    if (personaCategoryCheck.rowCount === 0) {
      console.log("Persona.category missing. Applying persona category migration directly...");

      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PersonaCategory') THEN
            CREATE TYPE "PersonaCategory" AS ENUM ('BUYER', 'USER', 'NONE');
          END IF;
        END $$;
      `);

      await pool.query(`
        ALTER TABLE "Persona"
        ADD COLUMN IF NOT EXISTS "category" "PersonaCategory" NOT NULL DEFAULT 'NONE';
      `);

      console.log("Persona category migration applied successfully via direct SQL.");
    } else {
      console.log("Persona.category exists. No repair needed.");
    }
    // Drop stale `session` table that causes Prisma drift detection to fail
    const sessionCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'session'"
    );
    if (sessionCheck.rowCount > 0) {
      await pool.query('DROP TABLE IF EXISTS "session" CASCADE');
      console.log("Dropped stale session table to fix Prisma drift.");
    }

    // Ensure PENDING enum value exists in UserRole
    const pendingCheck = await pool.query(
      "SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'UserRole' AND enumlabel = 'PENDING'"
    );
    if (pendingCheck.rowCount === 0) {
      await pool.query("ALTER TYPE \"UserRole\" ADD VALUE 'PENDING'");
      console.log("Added PENDING enum value to UserRole.");
    }

    // Ensure FeatureStatus has BUSINESS_APPROVAL (20260316_add_testing_and_business_approval) so feature status dropdown works
    const featureStatusCheck = await pool.query(
      "SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'FeatureStatus' AND enumlabel = 'BUSINESS_APPROVAL'"
    );
    if (featureStatusCheck.rowCount === 0) {
      await pool.query("ALTER TYPE \"FeatureStatus\" ADD VALUE 'BUSINESS_APPROVAL'");
      console.log("Added BUSINESS_APPROVAL to FeatureStatus.");
    }

    // Ensure TaskStatus has TESTING (20260316_add_testing_and_business_approval)
    const taskStatusCheck = await pool.query(
      "SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'TaskStatus' AND enumlabel = 'TESTING'"
    );
    if (taskStatusCheck.rowCount === 0) {
      await pool.query("ALTER TYPE \"TaskStatus\" ADD VALUE 'TESTING'");
      console.log("Added TESTING to TaskStatus.");
    }

    // Ensure UserEmail table exists (from add_user_email_aliases migration)
    const userEmailCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'UserEmail'"
    );
    if (userEmailCheck.rowCount === 0) {
      console.log("UserEmail table missing. Creating it directly...");

      await pool.query(`
        CREATE TABLE "UserEmail" (
          "id" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "isPrimary" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX "UserEmail_email_key" ON "UserEmail"("email");
        CREATE INDEX "UserEmail_userId_idx" ON "UserEmail"("userId");
      `);

      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserEmail_userId_fkey') THEN
            ALTER TABLE "UserEmail" ADD CONSTRAINT "UserEmail_userId_fkey"
              FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);

      // Populate from existing User records
      await pool.query(`
        INSERT INTO "UserEmail" ("id", "email", "userId", "isPrimary", "createdAt")
        SELECT 'ue_' || "id", "email", "id", true, NOW()
        FROM "User"
        ON CONFLICT ("email") DO NOTHING;
      `);

      // Mark the migration as applied so prisma migrate deploy doesn't re-run it
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260304132311_add_user_email_aliases', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (
          SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260304132311_add_user_email_aliases'
        );
      `);

      console.log("UserEmail table created and populated successfully.");
    } else {
      console.log("UserEmail table exists. No repair needed.");
    }

    // Ensure new schema models from 20260305 migration exist
    const milestoneTableCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'InitiativeMilestone'"
    );

    if (milestoneTableCheck.rowCount === 0) {
      console.log("New schema tables missing. Applying pragmatic schema migration...");

      // Create enums
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MilestoneStatus') THEN
            CREATE TYPE "MilestoneStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'SKIPPED');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StakeholderRole') THEN
            CREATE TYPE "StakeholderRole" AS ENUM ('DECISION_MAKER', 'SPONSOR', 'REVIEWER', 'AMBASSADOR', 'LEGAL', 'MEDICAL');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StakeholderType') THEN
            CREATE TYPE "StakeholderType" AS ENUM ('INTERNAL', 'EXTERNAL');
          END IF;
        END $$;
      `);

      // Add columns to Initiative
      await pool.query(`
        ALTER TABLE "Initiative" ADD COLUMN IF NOT EXISTS "problemStatement" TEXT;
        ALTER TABLE "Initiative" ADD COLUMN IF NOT EXISTS "successCriteria" TEXT;
      `);

      // Create InitiativeMilestone table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "InitiativeMilestone" (
          "id" TEXT NOT NULL,
          "initiativeId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "description" TEXT,
          "targetDate" TIMESTAMP(3),
          "status" "MilestoneStatus" NOT NULL DEFAULT 'TODO',
          "sequence" INTEGER NOT NULL DEFAULT 0,
          "ownerId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "InitiativeMilestone_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "InitiativeMilestone_initiativeId_idx" ON "InitiativeMilestone"("initiativeId");
      `);

      // Create InitiativeKPI table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "InitiativeKPI" (
          "id" TEXT NOT NULL,
          "initiativeId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "targetValue" TEXT,
          "currentValue" TEXT,
          "unit" TEXT,
          "targetDate" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "InitiativeKPI_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "InitiativeKPI_initiativeId_idx" ON "InitiativeKPI"("initiativeId");
      `);

      // Create Stakeholder table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "Stakeholder" (
          "id" TEXT NOT NULL,
          "initiativeId" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "role" "StakeholderRole" NOT NULL,
          "type" "StakeholderType" NOT NULL DEFAULT 'INTERNAL',
          "organization" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "Stakeholder_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "Stakeholder_initiativeId_idx" ON "Stakeholder"("initiativeId");
      `);

      // Add foreign keys
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InitiativeMilestone_initiativeId_fkey') THEN
            ALTER TABLE "InitiativeMilestone" ADD CONSTRAINT "InitiativeMilestone_initiativeId_fkey"
              FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InitiativeMilestone_ownerId_fkey') THEN
            ALTER TABLE "InitiativeMilestone" ADD CONSTRAINT "InitiativeMilestone_ownerId_fkey"
              FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InitiativeKPI_initiativeId_fkey') THEN
            ALTER TABLE "InitiativeKPI" ADD CONSTRAINT "InitiativeKPI_initiativeId_fkey"
              FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Stakeholder_initiativeId_fkey') THEN
            ALTER TABLE "Stakeholder" ADD CONSTRAINT "Stakeholder_initiativeId_fkey"
              FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;
        END $$;
      `);

      // Mark both migrations as applied
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260305_pragmatic_milestones_kpis_stakeholders', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (
          SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260305_pragmatic_milestones_kpis_stakeholders'
        );

        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260306_add_kpi_target_date', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (
          SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260306_add_kpi_target_date'
        );
      `);

      console.log("Pragmatic schema migration applied successfully via direct SQL.");
    } else {
      console.log("InitiativeMilestone table exists. Checking for missing columns...");
      // InitiativeMilestone.description (table may have been created without it)
      const milestoneDescCheck = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'InitiativeMilestone' AND column_name = 'description'"
      );
      if (milestoneDescCheck.rowCount === 0) {
        await pool.query('ALTER TABLE "InitiativeMilestone" ADD COLUMN "description" TEXT');
        console.log("Added description to InitiativeMilestone.");
      }
      // Ensure targetDate column on InitiativeKPI exists (from 20260306 migration)
      const kpiTargetDateCheck = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'InitiativeKPI' AND column_name = 'targetDate'"
      );
      if (kpiTargetDateCheck.rowCount === 0) {
        await pool.query('ALTER TABLE "InitiativeKPI" ADD COLUMN "targetDate" TIMESTAMP(3)');
        console.log("Added targetDate to InitiativeKPI.");
      }
      // Ensure problemStatement/successCriteria on Initiative
      const psCheck = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'Initiative' AND column_name = 'problemStatement'"
      );
      if (psCheck.rowCount === 0) {
        await pool.query('ALTER TABLE "Initiative" ADD COLUMN IF NOT EXISTS "problemStatement" TEXT');
        await pool.query('ALTER TABLE "Initiative" ADD COLUMN IF NOT EXISTS "successCriteria" TEXT');
        console.log("Added problemStatement/successCriteria to Initiative.");
      }
      // Drop stale updatedAt column from Stakeholder (schema doesn't define it)
      const stakeholderUpdatedAtCheck = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'Stakeholder' AND column_name = 'updatedAt'"
      );
      if (stakeholderUpdatedAtCheck.rowCount > 0) {
        await pool.query('ALTER TABLE "Stakeholder" DROP COLUMN "updatedAt"');
        console.log("Dropped stale updatedAt column from Stakeholder.");
      }
    }

    // Ensure StakeholderRole enum has all required values from Prisma schema
    const requiredStakeholderRoles = ['DECISION_MAKER', 'SPONSOR', 'REVIEWER', 'AMBASSADOR', 'LEGAL', 'MEDICAL'];
    const existingStakeholderRoles = await pool.query(
      "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'StakeholderRole'"
    );
    if (existingStakeholderRoles.rowCount > 0) {
      const existing = existingStakeholderRoles.rows.map(r => r.enumlabel);
      for (const val of requiredStakeholderRoles) {
        if (!existing.includes(val)) {
          await pool.query(`ALTER TYPE "StakeholderRole" ADD VALUE '${val}'`);
          console.log(`Added enum value to StakeholderRole: ${val}`);
        }
      }
    }

    // Ensure StakeholderType enum matches Prisma schema (INTERNAL, EXTERNAL only)
    const existingStakeholderTypes = await pool.query(
      "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE typname = 'StakeholderType'"
    );
    if (existingStakeholderTypes.rowCount > 0) {
      const existing = existingStakeholderTypes.rows.map(r => r.enumlabel);
      for (const val of ['INTERNAL', 'EXTERNAL']) {
        if (!existing.includes(val)) {
          await pool.query(`ALTER TYPE "StakeholderType" ADD VALUE '${val}'`);
          console.log(`Added enum value to StakeholderType: ${val}`);
        }
      }
    }

    // Ensure User.preferredLocale exists (20260309) so auth and Prisma do not fail
    const preferredLocaleCheck = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'preferredLocale'"
    );
    if (preferredLocaleCheck.rowCount === 0) {
      await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredLocale" TEXT');
      console.log("Added User.preferredLocale.");
    }

    // Ensure Initiative.archivedAt exists (20260308_add_initiative_archived_at) so app does not crash on Railway when migrate deploy did not run
    const archivedAtCheck = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'Initiative' AND column_name = 'archivedAt'"
    );
    if (archivedAtCheck.rowCount === 0) {
      await pool.query('ALTER TABLE "Initiative" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3)');
      console.log("Added Initiative.archivedAt.");
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260308_add_initiative_archived_at', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (
          SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260308_add_initiative_archived_at'
        );
      `);
    }

    // Ensure SuccessCriterion table exists (20260308_add_success_criteria)
    const successCriterionCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'SuccessCriterion'"
    );
    if (successCriterionCheck.rowCount === 0) {
      await pool.query(`
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
        CREATE INDEX "SuccessCriterion_initiativeId_idx" ON "SuccessCriterion"("initiativeId");
      `);
      await pool.query(`
        ALTER TABLE "SuccessCriterion" ADD CONSTRAINT "SuccessCriterion_initiativeId_fkey"
          FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260308_add_success_criteria', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260308_add_success_criteria');
      `);
      console.log("Created SuccessCriterion table.");
    }

    // Ensure InitiativeComment table exists (20260308_add_initiative_comments)
    const initiativeCommentCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'InitiativeComment'"
    );
    if (initiativeCommentCheck.rowCount === 0) {
      await pool.query(`
        CREATE TABLE "InitiativeComment" (
          "id" TEXT NOT NULL,
          "initiativeId" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "InitiativeComment_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX "InitiativeComment_initiativeId_idx" ON "InitiativeComment"("initiativeId");
        CREATE INDEX "InitiativeComment_userId_idx" ON "InitiativeComment"("userId");
      `);
      await pool.query(`
        ALTER TABLE "InitiativeComment" ADD CONSTRAINT "InitiativeComment_initiativeId_fkey"
          FOREIGN KEY ("initiativeId") REFERENCES "Initiative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        ALTER TABLE "InitiativeComment" ADD CONSTRAINT "InitiativeComment_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260308_add_initiative_comments', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260308_add_initiative_comments');
      `);
      console.log("Created InitiativeComment table.");
    }

    // Ensure UserMessage table exists (20260308_add_user_messages)
    const userMessageCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'UserMessage'"
    );
    if (userMessageCheck.rowCount === 0) {
      await pool.query(`
        CREATE TABLE "UserMessage" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "body" TEXT,
          "linkUrl" TEXT,
          "linkLabel" TEXT,
          "readAt" TIMESTAMP(3),
          "source" TEXT,
          "type" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "UserMessage_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX "UserMessage_userId_idx" ON "UserMessage"("userId");
        CREATE INDEX "UserMessage_userId_readAt_idx" ON "UserMessage"("userId", "readAt");
      `);
      await pool.query(`
        ALTER TABLE "UserMessage" ADD CONSTRAINT "UserMessage_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260308_add_user_messages', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260308_add_user_messages');
      `);
      console.log("Created UserMessage table.");
    }

    // Ensure 20260309 notification matrix: UserMessage columns + enums + notification tables (so /api/messages and notification flow do not crash)
    const userMessageTitleKeyCheck = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'UserMessage' AND column_name = 'titleKey'"
    );
    if (userMessageTitleKeyCheck.rowCount === 0) {
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "titleKey" TEXT');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "titleParams" JSONB');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "bodyKey" TEXT');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "bodyParams" JSONB');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "linkLabelKey" TEXT');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "linkLabelParams" JSONB');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "entityType" TEXT');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "entityId" TEXT');
      await pool.query('ALTER TABLE "UserMessage" ADD COLUMN IF NOT EXISTS "auditEntryId" TEXT');
      await pool.query('ALTER TABLE "UserMessage" ALTER COLUMN "title" DROP NOT NULL');
      const uidAuditIdx = await pool.query(
        "SELECT 1 FROM pg_indexes WHERE tablename = 'UserMessage' AND indexname = 'UserMessage_userId_auditEntryId_key'"
      );
      if (uidAuditIdx.rowCount === 0) {
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "UserMessage_userId_auditEntryId_key" ON "UserMessage"("userId", "auditEntryId")');
      }
      console.log("Added UserMessage i18n columns (20260309).");
    }

    const notificationRuleCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'NotificationRule'"
    );
    if (notificationRuleCheck.rowCount === 0) {
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationScope') THEN
            CREATE TYPE "NotificationScope" AS ENUM ('GLOBAL', 'DOMAIN', 'INITIATIVE', 'CAMPAIGN', 'FEATURE', 'USER');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryChannel') THEN
            CREATE TYPE "DeliveryChannel" AS ENUM ('IN_APP', 'EMAIL', 'SLACK', 'WHATSAPP');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationRecipientKind') THEN
            CREATE TYPE "NotificationRecipientKind" AS ENUM ('OBJECT_OWNER', 'OBJECT_ROLE', 'GLOBAL_ROLE', 'OBJECT_ASSIGNEE');
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationDeliveryStatus') THEN
            CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
          END IF;
        END $$;
      `);
      await pool.query(`
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
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS "NotificationRule_action_entityType_enabled_idx" ON "NotificationRule"("action", "entityType", "enabled")');
      await pool.query(`
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
      `);
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationSubscription_userId_action_entityType_scopeType_scopeId_key" ON "UserNotificationSubscription"("userId", "action", "entityType", "scopeType", "scopeId")');
      await pool.query('CREATE INDEX IF NOT EXISTS "UserNotificationSubscription_userId_idx" ON "UserNotificationSubscription"("userId")');
      await pool.query(`
        ALTER TABLE "UserNotificationSubscription" ADD CONSTRAINT "UserNotificationSubscription_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      await pool.query(`
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
      `);
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "UserNotificationPreference_userId_channel_key" ON "UserNotificationPreference"("userId", "channel")');
      await pool.query('CREATE INDEX IF NOT EXISTS "UserNotificationPreference_userId_idx" ON "UserNotificationPreference"("userId")');
      await pool.query(`
        ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      await pool.query(`
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
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS "NotificationDelivery_userMessageId_idx" ON "NotificationDelivery"("userMessageId")');
      await pool.query('CREATE INDEX IF NOT EXISTS "NotificationDelivery_userId_idx" ON "NotificationDelivery"("userId")');
      await pool.query(`
        ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userMessageId_fkey"
          FOREIGN KEY ("userMessageId") REFERENCES "UserMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `);
      const umAuditIdx = await pool.query(
        "SELECT 1 FROM pg_indexes WHERE tablename = 'UserMessage' AND indexname = 'UserMessage_userId_auditEntryId_key'"
      );
      if (umAuditIdx.rowCount === 0) {
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS "UserMessage_userId_auditEntryId_key" ON "UserMessage"("userId", "auditEntryId")');
      }
      console.log("Created notification matrix tables (20260309).");
    }

    // Ensure 20260316 epic/story/task: Feature and Requirement columns (so /api/initiatives and app do not crash)
    const requirementStatusCheck = await pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Requirement' AND column_name = 'status'"
    );
    if (requirementStatusCheck.rowCount === 0) {
      console.log("Requirement.status missing. Applying 20260316 epic/story/task migration...");
      await pool.query(`
        DO $$ BEGIN CREATE TYPE "StoryType" AS ENUM ('FUNCTIONAL', 'BUG', 'TECH_DEBT', 'RESEARCH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
        DO $$ BEGIN CREATE TYPE "TaskType" AS ENUM ('TASK', 'SPIKE', 'QA', 'DESIGN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
      await pool.query(`
        ALTER TABLE "Feature" ADD COLUMN IF NOT EXISTS "acceptanceCriteria" TEXT;
        ALTER TABLE "Feature" ADD COLUMN IF NOT EXISTS "storyPoints" INTEGER;
        ALTER TABLE "Feature" ADD COLUMN IF NOT EXISTS "storyType" "StoryType";
      `);
      await pool.query(`
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED';
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "assigneeId" TEXT;
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "estimate" TEXT;
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "labels" JSONB;
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "taskType" "TaskType";
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "blockedReason" TEXT;
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "externalRef" TEXT;
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
        ALTER TABLE "Requirement" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
      `);
      await pool.query(`UPDATE "Requirement" SET "status" = 'DONE' WHERE "isDone" = true`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "Requirement_assigneeId_idx" ON "Requirement"("assigneeId")`);
      await pool.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Requirement_assigneeId_fkey') THEN
            ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_assigneeId_fkey"
              FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
        END $$;
      `);
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260316_add_epic_story_task_fields', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260316_add_epic_story_task_fields');
      `);
      console.log("Applied 20260316 epic/story/task migration.");
    }

    // Ensure McpOAuthClient table exists (20260317) so MCP OAuth client_id survives deploy
    const mcpOAuthClientCheck = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'McpOAuthClient'"
    );
    if (mcpOAuthClientCheck.rowCount === 0) {
      await pool.query(`
        CREATE TABLE "McpOAuthClient" (
          "id" TEXT NOT NULL,
          "clientId" TEXT NOT NULL,
          "payload" JSONB NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
        );
        CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");
        CREATE INDEX "McpOAuthClient_clientId_idx" ON "McpOAuthClient"("clientId");
      `);
      await pool.query(`
        INSERT INTO "_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
        SELECT gen_random_uuid()::text, '', NOW(), '20260317_add_mcp_oauth_client', NULL, NULL, NOW(), 1
        WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260317_add_mcp_oauth_client');
      `);
      console.log("Created McpOAuthClient table (20260317).");
    }

  } catch (e) {
    console.error("Repair failed:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
