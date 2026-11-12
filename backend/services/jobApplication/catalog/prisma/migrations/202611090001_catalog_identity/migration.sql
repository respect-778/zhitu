-- Bootstrap must create catalog with catalog_migrator as its owner before migration.
-- This migration only creates objects inside that existing namespace; database CREATE is not required.
-- No account/order/business tables are touched.

CREATE TABLE "catalog"."sources" (
  "source_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "adapter" TEXT NOT NULL,
  "entry_url" TEXT NOT NULL,
  "allowed_hosts" TEXT[] NOT NULL,
  "scope_key" TEXT NOT NULL,
  "recruitment_channel" TEXT NOT NULL,
  "company" TEXT,
  "enabled" BOOLEAN NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sources_pkey" PRIMARY KEY ("source_id"),
  CONSTRAINT "sources_identity_check" CHECK (
    length(btrim("source_id")) > 0 AND "source_id" = btrim("source_id")
    AND length(btrim("scope_key")) > 0 AND "scope_key" = btrim("scope_key")
  ),
  CONSTRAINT "sources_kind_check" CHECK ("kind" IN ('enterprise', 'announcement')),
  CONSTRAINT "sources_channel_check" CHECK ("recruitment_channel" IN ('campus', 'social', 'unknown')),
  CONSTRAINT "sources_hosts_check" CHECK (cardinality("allowed_hosts") > 0)
);

CREATE TABLE "catalog"."jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_id" TEXT NOT NULL,
  "source_job_id" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "employment_type" TEXT NOT NULL,
  "recruitment_channel" TEXT NOT NULL,
  "responsibilities" TEXT,
  "requirements" TEXT,
  "application_instructions" TEXT,
  "source_url" TEXT NOT NULL,
  "detail_url" TEXT,
  "apply_url" TEXT,
  "application_method" TEXT NOT NULL,
  "location_raw" TEXT,
  "city_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "education_raw" TEXT,
  "minimum_degree" TEXT,
  "salary_raw" TEXT,
  "salary" JSONB,
  "published_at" JSONB,
  "source_updated_at" JSONB,
  "deadline_at" JSONB,
  "first_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
  "last_verified_at" TIMESTAMPTZ(3),
  "closed_at" TIMESTAMPTZ(3),
  "recruitment_status" TEXT NOT NULL,
  "verification_status" TEXT NOT NULL,
  "visibility" TEXT NOT NULL,
  "evidence" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "jobs_source_fk" FOREIGN KEY ("source_id") REFERENCES "catalog"."sources"("source_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "jobs_identity_check" CHECK (length(btrim("source_job_id")) > 0 AND "source_job_id" = btrim("source_job_id")),
  CONSTRAINT "jobs_text_check" CHECK (length(btrim("company")) > 0 AND length(btrim("title")) > 0),
  CONSTRAINT "jobs_employment_check" CHECK ("employment_type" IN ('internship', 'full_time', 'part_time', 'unknown')),
  CONSTRAINT "jobs_channel_check" CHECK ("recruitment_channel" IN ('campus', 'social', 'unknown')),
  CONSTRAINT "jobs_recruitment_status_check" CHECK ("recruitment_status" IN ('open', 'closed', 'expired', 'unknown')),
  CONSTRAINT "jobs_verification_status_check" CHECK ("verification_status" IN ('verified', 'pending', 'unreachable', 'parse_failed')),
  CONSTRAINT "jobs_visibility_check" CHECK ("visibility" IN ('published', 'review', 'hidden')),
  CONSTRAINT "jobs_degree_check" CHECK ("minimum_degree" IS NULL OR "minimum_degree" IN ('none', 'secondary', 'associate', 'bachelor', 'master', 'doctorate')),
  CONSTRAINT "jobs_application_check" CHECK (
    "application_method" IN ('web_form', 'email', 'offline', 'instructions', 'unknown')
    AND (("application_method" = 'web_form') = ("apply_url" IS NOT NULL))
    AND ("application_method" NOT IN ('email', 'offline', 'instructions') OR "application_instructions" IS NOT NULL)
  ),
  CONSTRAINT "jobs_times_check" CHECK ("first_seen_at" <= "last_seen_at"),
  CONSTRAINT "jobs_verified_check" CHECK ("verification_status" <> 'verified' OR "last_verified_at" IS NOT NULL),
  CONSTRAINT "jobs_open_check" CHECK ("recruitment_status" <> 'open' OR "closed_at" IS NULL),
  CONSTRAINT "jobs_publication_check" CHECK (
    "visibility" <> 'published' OR (
      "recruitment_status" NOT IN ('closed', 'expired')
      AND ("detail_url" IS NOT NULL OR "application_instructions" IS NOT NULL)
    )
  ),
  CONSTRAINT "jobs_evidence_check" CHECK (jsonb_typeof("evidence") = 'array' AND jsonb_array_length("evidence") > 0),
  CONSTRAINT "jobs_salary_check" CHECK ("salary" IS NULL OR (jsonb_typeof("salary") = 'object' AND "salary_raw" IS NOT NULL)),
  CONSTRAINT "jobs_degree_raw_check" CHECK ("minimum_degree" IS NULL OR "education_raw" IS NOT NULL),
  CONSTRAINT "jobs_city_raw_check" CHECK (cardinality("city_codes") = 0 OR "location_raw" IS NOT NULL),
  CONSTRAINT "jobs_source_dates_check" CHECK (
    ("published_at" IS NULL OR jsonb_typeof("published_at") = 'object')
    AND ("source_updated_at" IS NULL OR jsonb_typeof("source_updated_at") = 'object')
    AND ("deadline_at" IS NULL OR jsonb_typeof("deadline_at") = 'object')
  )
);

CREATE UNIQUE INDEX "jobs_source_identity_key" ON "catalog"."jobs"("source_id", "source_job_id");
CREATE INDEX "jobs_visibility_status_idx" ON "catalog"."jobs"("visibility", "recruitment_status");
