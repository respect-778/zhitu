CREATE TABLE "catalog"."artifacts" (
  "sha256" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifacts_pkey" PRIMARY KEY ("sha256"),
  CONSTRAINT "artifacts_hash_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "artifacts_kind_check" CHECK ("kind" IN ('pdf', 'xlsx')),
  CONSTRAINT "artifacts_size_check" CHECK ("byte_size" > 0 AND "byte_size" <= 20971520),
  CONSTRAINT "artifacts_key_check" CHECK ("storage_key" = 'sha256/' || left("sha256", 2) || '/' || "sha256")
);
CREATE UNIQUE INDEX "artifacts_storage_key_key" ON "catalog"."artifacts"("storage_key");

CREATE TABLE "catalog"."artifact_references" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "artifact_sha256" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "observed_at" TIMESTAMPTZ(3) NOT NULL,
  "last_observed_at" TIMESTAMPTZ(3) NOT NULL,
  "parser_version" TEXT NOT NULL,
  "parse_state" TEXT NOT NULL,
  CONSTRAINT "artifact_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artifact_references_artifact_fk" FOREIGN KEY ("artifact_sha256") REFERENCES "catalog"."artifacts"("sha256") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "artifact_references_source_fk" FOREIGN KEY ("source_id") REFERENCES "catalog"."sources"("source_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "artifact_references_url_check" CHECK ("source_url" ~ '^https://[^/@[:space:]]+([/?#]|$)'),
  CONSTRAINT "artifact_references_times_check" CHECK ("observed_at" <= "last_observed_at"),
  CONSTRAINT "artifact_references_parser_check" CHECK (length(btrim("parser_version")) > 0),
  CONSTRAINT "artifact_references_state_check" CHECK ("parse_state" IN ('present', 'needs_ocr', 'unsupported', 'parse_failed', 'limit_exceeded'))
);
CREATE UNIQUE INDEX "artifact_references_identity_key" ON "catalog"."artifact_references"("artifact_sha256", "source_id", "source_url");
CREATE INDEX "artifact_references_source_idx" ON "catalog"."artifact_references"("source_id");
