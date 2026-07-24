CREATE TABLE "petyr_auth_session" (
    "id_hash" VARCHAR(64) NOT NULL,
    "access_token_ciphertext" TEXT NOT NULL,
    "refresh_token_ciphertext" TEXT NOT NULL,
    "access_token_expires_at" TIMESTAMP(3) NOT NULL,
    "access_layer_session_id" TEXT NOT NULL,
    "access_layer_session_issued_at" TIMESTAMP(3) NOT NULL,
    "access_layer_session_expires_at" TIMESTAMP(3) NOT NULL,
    "google_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "role" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petyr_auth_session_pkey" PRIMARY KEY ("id_hash")
);

CREATE INDEX "petyr_auth_session_expires_idx"
ON "petyr_auth_session"("access_layer_session_expires_at");

CREATE INDEX "petyr_auth_session_access_session_idx"
ON "petyr_auth_session"("access_layer_session_id");
