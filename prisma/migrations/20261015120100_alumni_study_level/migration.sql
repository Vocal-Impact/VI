-- Alumni so far kept their last level (L6); their year of study now says Alumni.
-- (A separate migration: a new enum value can't be used in the migration that adds it.)
UPDATE "member" SET "yearOfStudy" = 'ALUMNI' WHERE "status" = 'ALUMNI';
