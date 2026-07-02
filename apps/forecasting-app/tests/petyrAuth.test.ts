import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_PETYR_PERMISSIONS,
  PETYR_PERMISSIONS,
  createAuthState,
  getLocalDevelopmentIdentity,
  getPetyrPublicRedirectUrl,
  hasPetyrPermission,
  hasUsablePetyrGrant,
  isValidAuthCallbackState,
  readPetyrAuthConfig,
  signPetyrSession,
  toAccessLayerIdentity,
  verifyPetyrSession
} from "../src/lib/petyr/authCore";
import { normalizePetyrCsmIdentityName, resolvePreferredCsmName } from "../src/lib/petyr/csmIdentity";

test("auth disabled returns deterministic local development identity", () => {
  const config = readPetyrAuthConfig({ NODE_ENV: "development" });
  const identity = getLocalDevelopmentIdentity();

  assert.equal(config.mode, "disabled");
  assert.equal(identity.email, "dev.petyr@local");
  assert.equal(identity.role, "local_developer");
  assert.deepEqual(identity.permissions, ALL_PETYR_PERMISSIONS);
});

test("production defaults to Access Layer and fails closed when config is missing", () => {
  assert.throws(
    () => readPetyrAuthConfig({ NODE_ENV: "production" }),
    /missing configuration: ACCESS_LAYER_PUBLIC_BASE_URL/
  );

  assert.throws(
    () => readPetyrAuthConfig({ NODE_ENV: "production", PETYR_AUTH_MODE: "disabled" }),
    /disabled is not allowed/
  );
});

test("access-layer mode reads required URLs and tool credentials", () => {
  const config = readPetyrAuthConfig({
    NODE_ENV: "production",
    PETYR_AUTH_MODE: "access-layer",
    ACCESS_LAYER_PUBLIC_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_INTERNAL_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_CALLBACK_URL: "https://petyr.draftapps.it/auth/callback",
    ACCESS_LAYER_TOOL_SLUG: "petyr",
    ACCESS_LAYER_CLIENT_ID: "tlc_petyr",
    ACCESS_LAYER_CLIENT_SECRET: "tls_petyr",
    PETYR_SESSION_SECRET: "local-test-secret"
  });

  assert.equal(config.mode, "access-layer");
  assert.equal(config.publicBaseUrl, "https://access-layer.draftapps.it");
  assert.equal(config.internalBaseUrl, "https://access-layer.draftapps.it");
  assert.equal(config.callbackUrl, "https://petyr.draftapps.it/auth/callback");
  assert.equal(config.toolSlug, "petyr");
});

test("public Petyr redirects use callback origin instead of internal request origin", () => {
  const config = readPetyrAuthConfig({
    NODE_ENV: "production",
    PETYR_AUTH_MODE: "access-layer",
    ACCESS_LAYER_PUBLIC_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_INTERNAL_BASE_URL: "https://access-layer.draftapps.it",
    ACCESS_LAYER_CALLBACK_URL: "https://petyr.draftapps.it/auth/callback",
    ACCESS_LAYER_TOOL_SLUG: "petyr",
    ACCESS_LAYER_CLIENT_ID: "tlc_petyr",
    ACCESS_LAYER_CLIENT_SECRET: "tls_petyr",
    PETYR_SESSION_SECRET: "local-test-secret"
  });

  const redirectUrl = getPetyrPublicRedirectUrl(
    "/forecasting",
    "http://0.0.0.0:3000/auth/callback?code=abc",
    config
  );

  assert.equal(redirectUrl.toString(), "https://petyr.draftapps.it/forecasting");
});

test("callback state is random enough for local validation", () => {
  const first = createAuthState();
  const second = createAuthState();

  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]+$/);
  assert.ok(first.length >= 24);
});

test("callback state validation rejects missing or mismatched values", () => {
  assert.equal(isValidAuthCallbackState("state_a", "state_a"), true);
  assert.equal(isValidAuthCallbackState(null, "state_a"), false);
  assert.equal(isValidAuthCallbackState("state_a", undefined), false);
  assert.equal(isValidAuthCallbackState("state_a", "state_b"), false);
});

test("signed Petyr session verifies and rejects tampering", () => {
  const identity = getLocalDevelopmentIdentity();
  const secret = "test-session-secret";
  const cookie = signPetyrSession(identity, secret);

  assert.deepEqual(verifyPetyrSession(cookie, secret), identity);
  assert.equal(verifyPetyrSession(`${cookie}tampered`, secret), null);
  assert.equal(verifyPetyrSession(cookie, "wrong-secret"), null);
});

test("Access Layer exchange payload maps to Petyr identity and permissions", () => {
  const identity = toAccessLayerIdentity({
    access_token: "redacted",
    session: {
      id: "ses_123"
    },
    user: {
      google_sub: "google-sub-123",
      email: "mario.rossi@unguess.io",
      display_name: "Mario Rossi"
    },
    grant: {
      role: "petyr_csm",
      permissions: [PETYR_PERMISSIONS.read, PETYR_PERMISSIONS.forecastWrite]
    },
    correlation_id: "corr_123"
  });

  assert.equal(identity.googleSub, "google-sub-123");
  assert.equal(identity.email, "mario.rossi@unguess.io");
  assert.equal(identity.accessSessionId, "ses_123");
  assert.equal(identity.correlationId, "corr_123");
  assert.equal(hasPetyrPermission(identity, PETYR_PERMISSIONS.read), true);
  assert.equal(hasPetyrPermission(identity, PETYR_PERMISSIONS.admin), false);
  assert.equal(hasUsablePetyrGrant(identity), true);
});

test("Access Layer exchange payload without Petyr read permission is not a usable grant", () => {
  const identity = toAccessLayerIdentity({
    access_token: "redacted",
    session: {
      id: "ses_pending"
    },
    user: {
      google_sub: "google-sub-pending",
      email: "pending.user@unguess.io",
      display_name: "Pending User"
    },
    grant: {
      role: "pending",
      permissions: []
    },
    correlation_id: "corr_pending"
  });

  assert.equal(hasUsablePetyrGrant(identity), false);
});

test("CSM identity matching resolves exact names case-insensitively", () => {
  assert.equal(resolvePreferredCsmName("Mario Rossi", ["mario rossi", "Giulia Bianchi"]), "mario rossi");
});

test("CSM identity matching ignores accents and repeated spaces", () => {
  assert.equal(normalizePetyrCsmIdentityName("  M\u00e0rio   R\u00f3ssi  "), "mario rossi");
  assert.equal(resolvePreferredCsmName("  M\u00e0rio   R\u00f3ssi  ", ["Mario Rossi"]), "Mario Rossi");
});

test("CSM identity matching returns null when no candidate matches", () => {
  assert.equal(resolvePreferredCsmName("Mario Rossi", ["Giulia Bianchi"]), null);
});

test("CSM identity matching returns null when normalized candidates are ambiguous", () => {
  assert.equal(resolvePreferredCsmName("Mario Rossi", ["Mario Rossi", "M\u00e0rio Rossi"]), null);
});
