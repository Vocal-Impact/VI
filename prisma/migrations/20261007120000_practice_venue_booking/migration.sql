-- Venue booking progress for each practice (request sent, venue confirmed).
ALTER TABLE "practice" ADD COLUMN "venueRequestedAt" TIMESTAMP(3);
ALTER TABLE "practice" ADD COLUMN "venueConfirmedAt" TIMESTAMP(3);
