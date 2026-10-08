-- A practice is for the current choir (default) or for alumni.
CREATE TYPE "PracticeAudience" AS ENUM ('MEMBERS', 'ALUMNI');
ALTER TABLE "practice" ADD COLUMN "audience" "PracticeAudience" NOT NULL DEFAULT 'MEMBERS';
