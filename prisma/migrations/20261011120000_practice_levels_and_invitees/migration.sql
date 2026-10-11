-- Batch leads schedule practices for their own level.
ALTER TYPE "Role" ADD VALUE 'BATCH_LEAD';

-- Practices for some levels, or for chosen members only.
ALTER TYPE "PracticeAudience" ADD VALUE 'LEVELS';
ALTER TYPE "PracticeAudience" ADD VALUE 'SELECTED';
ALTER TABLE "practice" ADD COLUMN "levels" "StudyLevel"[] NOT NULL DEFAULT ARRAY[]::"StudyLevel"[];

CREATE TABLE "practice_invitee" (
    "practiceId" UUID NOT NULL,
    "memberId" UUID NOT NULL,

    CONSTRAINT "practice_invitee_pkey" PRIMARY KEY ("practiceId","memberId")
);

CREATE INDEX "practice_invitee_memberId_idx" ON "practice_invitee"("memberId");

ALTER TABLE "practice_invitee" ADD CONSTRAINT "practice_invitee_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_invitee" ADD CONSTRAINT "practice_invitee_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
