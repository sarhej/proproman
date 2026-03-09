/**
 * Populate notification rules for initiative by RACI.
 * Run without wiping other data: npm run db:seed-notification-rules
 * Requires DATABASE_URL (e.g. from .env).
 */
import { AuditAction, AssignmentRole, NotificationRecipientKind, PrismaClient } from "@prisma/client";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  await prisma.notificationRule.deleteMany({ where: { entityType: "INITIATIVE" } });

  const actions: AuditAction[] = [
    AuditAction.CREATED,
    AuditAction.UPDATED,
    AuditAction.STATUS_CHANGED,
    AuditAction.DELETED
  ];
  const channels = ["IN_APP"] as object;

  const rules: Array<{
    action: AuditAction;
    entityType: string;
    eventKind: string | null;
    recipientKind: NotificationRecipientKind;
    recipientRole: string | null;
    deliveryChannels: object;
    enabled: boolean;
  }> = [];

  for (const action of actions) {
    rules.push({
      action,
      entityType: "INITIATIVE",
      eventKind: null,
      recipientKind: NotificationRecipientKind.OBJECT_OWNER,
      recipientRole: null,
      deliveryChannels: channels,
      enabled: true
    });
    rules.push({
      action,
      entityType: "INITIATIVE",
      eventKind: null,
      recipientKind: NotificationRecipientKind.OBJECT_ASSIGNEE,
      recipientRole: null,
      deliveryChannels: channels,
      enabled: true
    });
    for (const role of [
      AssignmentRole.ACCOUNTABLE,
      AssignmentRole.IMPLEMENTER,
      AssignmentRole.CONSULTED,
      AssignmentRole.INFORMED
    ]) {
      rules.push({
        action,
        entityType: "INITIATIVE",
        eventKind: null,
        recipientKind: NotificationRecipientKind.OBJECT_ROLE,
        recipientRole: role,
        deliveryChannels: channels,
        enabled: true
      });
    }
  }

  await prisma.notificationRule.createMany({ data: rules });
  console.log(`Created ${rules.length} notification rules for INITIATIVE (RACI + owner).`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
