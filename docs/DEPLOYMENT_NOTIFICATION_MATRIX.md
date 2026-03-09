# Deployment: Notification Matrix & Event Logging

This document covers production deployment for the notification matrix and in-app messages feature. **All schema changes are additive; no existing production data is modified or removed.**

## Migration: `20260309_add_notification_matrix_and_delivery`

- **Safe for production:** Yes. Only adds:
  - New enums: `NotificationScope`, `DeliveryChannel`, `NotificationRecipientKind`, `NotificationDeliveryStatus`
  - `User.preferredLocale` (nullable)
  - New nullable columns on `UserMessage` (i18n keys, `entityType`, `entityId`, `auditEntryId`); `title` becomes optional
  - New tables: `NotificationRule`, `UserNotificationSubscription`, `UserNotificationPreference`, `NotificationDelivery`
  - New unique index on `UserMessage(userId, auditEntryId)` (existing rows have `auditEntryId` NULL; PostgreSQL allows multiple NULLs in a unique index)
- **No destructive operations:** No `DROP`, `DELETE`, or data overwrites.
- **Deploy flow:** Railway (or your platform) runs `repair-migrations.cjs` then `prisma migrate deploy`. The migration will apply automatically on first deploy after this release.

## Optional: Default notification rules (RACI for initiatives)

After the migration has been applied, you can optionally populate default notification rules so that initiative owners, assignees, and RACI roles receive in-app notifications on create/update/status change/delete:

```bash
# From repo root, with DATABASE_URL set (e.g. production env or .env)
npm run db:seed-notification-rules
```

- **Safe for production:** Yes. This script only:
  - Deletes existing `NotificationRule` rows where `entityType = 'INITIATIVE'`
  - Inserts 24 new rules (CREATED, UPDATED, STATUS_CHANGED, DELETED × OBJECT_OWNER, OBJECT_ASSIGNEE, OBJECT_ROLE with ACCOUNTABLE, IMPLEMENTER, CONSULTED, INFORMED)
- **Idempotent:** Can be run multiple times; each run replaces initiative rules with the same set.
- **Not required:** The app works without these rules. The **actor** (e.g. creator) always receives an in-app notification regardless of rules.

## Checklist before deploy

1. Ensure `DATABASE_URL` is set in production.
2. Deploy: migrations run via `preDeployCommand` (see `railway.json`).
3. (Optional) Run `npm run db:seed-notification-rules` once if you want default initiative notification rules.
4. Do **not** run full `npm run db:seed` in production (it wipes and re-seeds all data).
