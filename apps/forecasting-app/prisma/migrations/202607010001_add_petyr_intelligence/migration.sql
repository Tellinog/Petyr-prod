CREATE TYPE "IntelligenceRunStatus" AS ENUM ('pending', 'running', 'succeeded', 'partial', 'failed', 'skipped_budget');
CREATE TYPE "IntelligenceInsightType" AS ENUM ('opportunity', 'reactivation', 'caution', 'risk', 'monitor', 'no_action');
CREATE TYPE "IntelligenceUrgency" AS ENUM ('high', 'medium', 'low');
CREATE TYPE "IntelligenceFeedbackUsefulness" AS ENUM ('useful', 'not_useful', 'unclear');
CREATE TYPE "IntelligenceFeedbackAccuracy" AS ENUM ('accurate', 'inaccurate', 'unclear');

CREATE TABLE "company_intelligence_run" (
  "id" TEXT NOT NULL,
  "run_scope" TEXT NOT NULL DEFAULT 'batch',
  "company_name" TEXT,
  "csm_name" TEXT,
  "status" "IntelligenceRunStatus" NOT NULL DEFAULT 'pending',
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "selected_reason" TEXT,
  "selected_companies_count" INTEGER NOT NULL DEFAULT 0,
  "exa_requests_used" INTEGER NOT NULL DEFAULT 0,
  "exa_results_received" INTEGER NOT NULL DEFAULT 0,
  "openrouter_requests_used" INTEGER NOT NULL DEFAULT 0,
  "budget_policy_json" JSONB NOT NULL DEFAULT '{}',
  "error_message" TEXT,
  "created_by" TEXT NOT NULL DEFAULT 'system',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_intelligence_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_signal_item" (
  "id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "canonical_url" TEXT NOT NULL,
  "normalized_title" TEXT,
  "source_domain" TEXT,
  "published_at" TIMESTAMP(3),
  "event_signature" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "duplicate_count" INTEGER NOT NULL DEFAULT 1,
  "relevance_status" TEXT NOT NULL DEFAULT 'pending',
  "company_relevance_score" DECIMAL(5,4),
  "status" TEXT NOT NULL DEFAULT 'active',
  CONSTRAINT "company_signal_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_signal_raw_result" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "signal_item_id" TEXT,
  "company_name" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'exa',
  "provider_result_id" TEXT,
  "query_text" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "published_at" TIMESTAMP(3),
  "author_or_source" TEXT,
  "snippet" TEXT,
  "raw_result_json" JSONB NOT NULL DEFAULT '{}',
  "content_hash" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_signal_raw_result_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_signal_business_unit_classification" (
  "id" TEXT NOT NULL,
  "signal_item_id" TEXT NOT NULL,
  "business_unit" TEXT NOT NULL,
  "relevance_score" DECIMAL(5,4),
  "rationale" TEXT,
  "classified_by_provider" TEXT NOT NULL DEFAULT 'local',
  "model" TEXT,
  "prompt_version" TEXT,
  "classified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_signal_business_unit_classification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_intelligence_insight" (
  "id" TEXT NOT NULL,
  "company_name" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "csm_name" TEXT,
  "run_id" TEXT,
  "business_unit" TEXT NOT NULL,
  "insight_type" "IntelligenceInsightType" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "suggested_action" TEXT NOT NULL,
  "urgency" "IntelligenceUrgency" NOT NULL,
  "confidence" DECIMAL(5,4),
  "assumptions_or_limits" JSONB NOT NULL DEFAULT '[]',
  "provider" TEXT NOT NULL DEFAULT 'openrouter',
  "model" TEXT,
  "prompt_version" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_intelligence_insight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_intelligence_insight_source" (
  "id" TEXT NOT NULL,
  "insight_id" TEXT NOT NULL,
  "signal_item_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_intelligence_insight_source_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_insight_feedback" (
  "id" TEXT NOT NULL,
  "insight_id" TEXT NOT NULL,
  "rating_usefulness" "IntelligenceFeedbackUsefulness" NOT NULL,
  "rating_accuracy" "IntelligenceFeedbackAccuracy" NOT NULL,
  "feedback_text" TEXT,
  "submitted_by" TEXT NOT NULL,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_insight_feedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_intelligence_provider_request_log" (
  "id" TEXT NOT NULL,
  "run_id" TEXT,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "request_count" INTEGER NOT NULL DEFAULT 1,
  "result_count" INTEGER,
  "duration_ms" INTEGER,
  "model" TEXT,
  "cost_metadata" JSONB NOT NULL DEFAULT '{}',
  "request_metadata" JSONB NOT NULL DEFAULT '{}',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "company_intelligence_provider_request_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "intelligence_calibration_report" (
  "id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "generated_by" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendations_json" JSONB NOT NULL DEFAULT '[]',
  "metrics_json" JSONB NOT NULL DEFAULT '{}',
  "status" TEXT NOT NULL DEFAULT 'draft',
  CONSTRAINT "intelligence_calibration_report_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_intelligence_run_status_started_idx" ON "company_intelligence_run" ("status", "started_at");
CREATE INDEX "company_intelligence_run_company_started_idx" ON "company_intelligence_run" ("company_name", "started_at");
CREATE UNIQUE INDEX "company_signal_item_company_hash_key" ON "company_signal_item" ("company_name", "content_hash");
CREATE INDEX "company_signal_item_company_last_seen_idx" ON "company_signal_item" ("company_name", "last_seen_at");
CREATE INDEX "company_signal_item_event_signature_idx" ON "company_signal_item" ("event_signature");
CREATE INDEX "company_signal_raw_result_run_idx" ON "company_signal_raw_result" ("run_id");
CREATE INDEX "company_signal_raw_result_company_fetched_idx" ON "company_signal_raw_result" ("company_name", "fetched_at");
CREATE INDEX "company_signal_raw_result_content_hash_idx" ON "company_signal_raw_result" ("content_hash");
CREATE UNIQUE INDEX "company_signal_bu_classification_item_bu_key" ON "company_signal_business_unit_classification" ("signal_item_id", "business_unit");
CREATE INDEX "company_signal_bu_classification_bu_idx" ON "company_signal_business_unit_classification" ("business_unit");
CREATE INDEX "company_intelligence_insight_company_generated_idx" ON "company_intelligence_insight" ("company_name", "generated_at");
CREATE INDEX "company_intelligence_insight_csm_generated_idx" ON "company_intelligence_insight" ("csm_name", "generated_at");
CREATE INDEX "company_intelligence_insight_bu_type_urgency_idx" ON "company_intelligence_insight" ("business_unit", "insight_type", "urgency");
CREATE UNIQUE INDEX "company_intelligence_insight_source_key" ON "company_intelligence_insight_source" ("insight_id", "signal_item_id");
CREATE INDEX "company_intelligence_insight_source_signal_idx" ON "company_intelligence_insight_source" ("signal_item_id");
CREATE INDEX "company_insight_feedback_insight_submitted_idx" ON "company_insight_feedback" ("insight_id", "submitted_at");
CREATE INDEX "company_insight_feedback_user_submitted_idx" ON "company_insight_feedback" ("submitted_by", "submitted_at");
CREATE INDEX "company_intelligence_provider_log_provider_op_idx" ON "company_intelligence_provider_request_log" ("provider", "operation", "created_at");
CREATE INDEX "company_intelligence_provider_log_run_idx" ON "company_intelligence_provider_request_log" ("run_id");
CREATE INDEX "intelligence_calibration_report_generated_idx" ON "intelligence_calibration_report" ("generated_at");

ALTER TABLE "company_signal_raw_result" ADD CONSTRAINT "company_signal_raw_result_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "company_intelligence_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_signal_raw_result" ADD CONSTRAINT "company_signal_raw_result_signal_item_id_fkey" FOREIGN KEY ("signal_item_id") REFERENCES "company_signal_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_signal_business_unit_classification" ADD CONSTRAINT "company_signal_business_unit_classification_signal_item_id_fkey" FOREIGN KEY ("signal_item_id") REFERENCES "company_signal_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_intelligence_insight" ADD CONSTRAINT "company_intelligence_insight_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "company_intelligence_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "company_intelligence_insight_source" ADD CONSTRAINT "company_intelligence_insight_source_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "company_intelligence_insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_intelligence_insight_source" ADD CONSTRAINT "company_intelligence_insight_source_signal_item_id_fkey" FOREIGN KEY ("signal_item_id") REFERENCES "company_signal_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_insight_feedback" ADD CONSTRAINT "company_insight_feedback_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "company_intelligence_insight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_intelligence_provider_request_log" ADD CONSTRAINT "company_intelligence_provider_request_log_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "company_intelligence_run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
