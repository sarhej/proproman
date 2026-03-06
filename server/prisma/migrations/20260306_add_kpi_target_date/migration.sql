-- Add targetDate to InitiativeKPI for time-aware health tracking
ALTER TABLE "InitiativeKPI" ADD COLUMN "targetDate" TIMESTAMP(3);
