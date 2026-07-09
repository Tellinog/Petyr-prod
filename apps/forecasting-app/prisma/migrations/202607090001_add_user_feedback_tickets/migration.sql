CREATE TYPE "UserFeedbackCategory" AS ENUM ('bug', 'experience', 'data_issue', 'other');
CREATE TYPE "UserFeedbackStatus" AS ENUM ('open', 'in_progress', 'resolved');

CREATE TABLE "user_feedback_ticket" (
  "id" TEXT NOT NULL,
  "category" "UserFeedbackCategory" NOT NULL,
  "status" "UserFeedbackStatus" NOT NULL DEFAULT 'open',
  "message" TEXT NOT NULL,
  "page_path" TEXT NOT NULL,
  "page_url" TEXT NOT NULL,
  "recent_activity" JSONB NOT NULL DEFAULT '[]',
  "client_context" JSONB NOT NULL DEFAULT '{}',
  "submitted_by_email" TEXT NOT NULL,
  "submitted_by_display_name" TEXT,
  "submitted_by_role" TEXT NOT NULL,
  "access_session_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status_updated_at" TIMESTAMP(3),
  "status_updated_by" TEXT,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "user_feedback_ticket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_feedback_ticket_status_created_idx" ON "user_feedback_ticket"("status", "created_at");
CREATE INDEX "user_feedback_ticket_category_created_idx" ON "user_feedback_ticket"("category", "created_at");
CREATE INDEX "user_feedback_ticket_submitter_created_idx" ON "user_feedback_ticket"("submitted_by_email", "created_at");
