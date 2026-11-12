ALTER TABLE "catalog"."jobs"
  ADD COLUMN "reviewed_metadata" JSONB,
  ADD CONSTRAINT "jobs_reviewed_metadata_check"
    CHECK ("reviewed_metadata" IS NULL OR jsonb_typeof("reviewed_metadata") = 'object');
