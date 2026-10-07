-- When the "book a venue" reminder was emailed to the admins (once per practice).
ALTER TABLE "practice" ADD COLUMN "venueReminderSentAt" TIMESTAMP(3);
