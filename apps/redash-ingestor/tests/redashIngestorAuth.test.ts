import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_REDASH_INGESTOR_PERMISSIONS,
  REDASH_INGESTOR_PERMISSIONS,
  createAuthState,
  getLocalDevelopmentIdentity,
  getRedashIngestorPublicRedirectUrl,
  hasRedashIngestorPermission,
  isValidAuthCallbackState,
  readRedashIngestorAuthConfig,
  signRedashIngestorSession,
  toAccessLayerIdentity,
  verifyRedashIngestorSession
} from "../src/lib/authCore.js";

test("auth disabled returns deterministic local operator identity", () => {
  const config = readRedashIngestorAuthConfig({ NODE_ENV: "development" });
  const identity = getLocalDevelopmentIdentity();

  assert.equal(config.mode, "disabled");
  assert.equal(identity.email, "dev.redash-ingestor@local");
  assert.equal(identity.role, "local_operator");
  assert.deepEqual(identity.permissions, ALL_REDASH_INGESTOR_PERMISSIONS);
});

test("production defaults to Access Layer and fails closed when config is missing", () => {
  assert.throws(
    () => readRedashIngestorAuthConfig({ NODE_ENV: "production" }),
    /missing configuration: ACCESS_LAYER_PUBLIC_BASE_URL/
  );

  assert.throws(
    () => readRedashIngestorAuthConfig({ NODE_ENV: "production", REDASH_INGESTOR_AUTH_MODE: "disabled" }),
    /disabled is not allowed/
  );
});

test("access-layer mode reads required Redash Ingestor tool settings", () => {
  const config = readRedashIngestorAuthConfig({
    NODE_ENV: "production",
    REDASH_INGESTOR_AUTH_MODE: "access-layer",
    ACCESS_LAYER_PUBLIC_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_INTERNAL_BASE_URL: "https://access-layer.draftapps.it",
      ACCESS_LAYER_CALLBACK_URL: "https://petyr.draftapps.it/redash-ingestor/auth/callback",
    ACCESS_LAYER_TOOL_SLUG: "redash-ingestor",
    ACCESS_LAYER_CLIENT_ID: "tlc_redash_ingestor",
    ACCESS_LAYER_CLIENT_SECRET: "tls_redash_ingestor",
    REDASH_INGESTOR_SESSION_SECRET: "local-test-secret"
  });

  assert.equal(config.mode, "access-layer");
    assert.equal(config.callbackUrl, "https://petyr.draftapps.it/redash-ingestor/auth/callback");
  assert.equal(config.toolSlug, "redash-ingestor");
});

test("public Redash Ingestor redirects use callback origin and preserve one base path", () => {
  const config = readRedashIngestorAuthConfig({
    NODE_ENV: "production",
    REDASH_INGESTOR_AUTH_MODE: "access-layer",
    ACCESS_LAYER_PUBLIC_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_INTERNAL_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_CALLBACK_URL: "https://petyr.draftapps.it/redash-ingestor/auth/callback",
    ACCESS_LAYER_TOOL_SLUG: "redash-ingestor",
    ACCESS_LAYER_CLIENT_ID: "tlc_redash_ingestor",
    ACCESS_LAYER_CLIENT_SECRET: "tls_redash_ingestor",
    REDASH_INGESTOR_SESSION_SECRET: "local-test-secret"
  });

  const redirectUrl = getRedashIngestorPublicRedirectUrl(
    "/redash-ingestor/",
    "http://0.0.0.0:3000/redash-ingestor/auth/callback?code=abc",
    config
  );

  assert.equal(redirectUrl.toString(), "https://petyr.draftapps.it/redash-ingestor/");
});

test("callback state validation rejects missing or mismatched values", () => {
  const state = createAuthState();

  assert.equal(isValidAuthCallbackState(state, state), true);
  assert.equal(isValidAuthCallbackState(null, state), false);
  assert.equal(isValidAuthCallbackState(state, undefined), false);
  assert.equal(isValidAuthCallbackState(state, "other-state"), false);
});

test("signed Redash Ingestor session verifies and rejects tampering", () => {
  const identity = getLocalDevelopmentIdentity();
  const secret = "test-session-secret";
  const cookie = signRedashIngestorSession(identity, secret);

  assert.deepEqual(verifyRedashIngestorSession(cookie, secret), identity);
  assert.equal(verifyRedashIngestorSession(`${cookie}tampered`, secret), null);
  assert.equal(verifyRedashIngestorSession(cookie, "wrong-secret"), null);
});

test("permission helper allows admin as operator superset", () => {
  const readOnly = {
    ...getLocalDevelopmentIdentity(),
    permissions: [REDASH_INGESTOR_PERMISSIONS.read]
  };
  const admin = {
    ...getLocalDevelopmentIdentity(),
    permissions: [REDASH_INGESTOR_PERMISSIONS.admin]
  };

  assert.equal(hasRedashIngestorPermission(readOnly, REDASH_INGESTOR_PERMISSIONS.read), true);
  assert.equal(hasRedashIngestorPermission(readOnly, REDASH_INGESTOR_PERMISSIONS.sync), false);
  assert.equal(hasRedashIngestorPermission(admin, REDASH_INGESTOR_PERMISSIONS.sync), true);
  assert.equal(hasRedashIngestorPermission(admin, REDASH_INGESTOR_PERMISSIONS.sourcesWrite), true);
});

test("Access Layer exchange payload maps to Redash Ingestor identity", () => {
  const identity = toAccessLayerIdentity({
    session: {
      id: "ses_123"
    },
    user: {
      google_sub: "google-sub-123",
      email: "operator@unguess.io",
      display_name: "Operator"
    },
    grant: {
      role: "redash_operator",
      permissions: [REDASH_INGESTOR_PERMISSIONS.read, REDASH_INGESTOR_PERMISSIONS.sync]
    },
    correlation_id: "corr_123"
  });

  assert.equal(identity.googleSub, "google-sub-123");
  assert.equal(identity.email, "operator@unguess.io");
  assert.equal(identity.accessSessionId, "ses_123");
  assert.equal(hasRedashIngestorPermission(identity, REDASH_INGESTOR_PERMISSIONS.sync), true);
  assert.equal(hasRedashIngestorPermission(identity, REDASH_INGESTOR_PERMISSIONS.sourcesWrite), false);
});
