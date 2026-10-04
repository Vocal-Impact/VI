-- CreateEnum
CREATE TYPE "PracticeStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RsvpResponse" AS ENUM ('GOING', 'NOT_GOING');

-- AlterTable
ALTER TABLE "practice" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "endTime" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "startTime" TEXT,
ADD COLUMN     "status" "PracticeStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "practice_rsvp" (
    "practiceId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "response" "RsvpResponse" NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_rsvp_pkey" PRIMARY KEY ("practiceId","memberId")
);

-- CreateIndex
CREATE INDEX "practice_rsvp_memberId_idx" ON "practice_rsvp"("memberId");

-- AddForeignKey
ALTER TABLE "practice_rsvp" ADD CONSTRAINT "practice_rsvp_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_rsvp" ADD CONSTRAINT "practice_rsvp_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
