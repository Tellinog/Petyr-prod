import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";

export const PETYR_AUTH_SESSION_COOKIE = "petyr_auth_session";
export const PETYR_AUTH_STATE_COOKIE = "petyr_auth_state";
export const PETYR_AUTH_REFRESH_THRESHOLD_MS = 60_000;

export const PETYR_PERMISSIONS = {
  read: "petyr:read",
  forecastWrite: "petyr:forecast:write",
  managementWrite: "petyr:management:write",
  feedbackManage: "petyr:feedback:manage",
  admin: "petyr:admin",
  redashOperator: "petyr:redash:operator"
} as const;

export const ALL_PETYR_PERMISSIONS = Object.values(PETYR_PERMISSIONS);

export type PetyrPermission = (typeof PETYR_PERMISSIONS)[keyof typeof PETYR_PERMISSIONS];

export type PetyrAuthMode = "disabled" | "access-layer";

export type PetyrAuthConfig = {
  mode: PetyrAuthMode;
  publicBaseUrl: string | null;
  internalBaseUrl: string | null;
  callbackUrl: string | null;
  toolSlug: string;
  clientId: string | null;
  clientSecret: string | null;
  sessionSecret: string | null;
};

export type PetyrAuthIdentity = {
  user: {
    email: string;
    displayName: string | null;
  };
  googleSub: string;
  email: string;
  permissions: string[];
  role: string;
  accessSessionId: string;
  correlationId: string;
};

export type AccessLayerAuthResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  session: {
    id: string;
    issued_at: string;
    expires_at: string;
  };
  user: {
    id?: string;
    google_sub: string;
    email: string;
    email_verified?: boolean;
    hd?: string;
    display_name?: string | null;
  };
  tool: {
    slug: string;
    display_name?: string;
  };
  grant: {
    role: string;
    permissions: string[];
  };
  correlation_id: string;
};

export type PetyrServerAuthSession = {
  identity: PetyrAuthIdentity;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  accessLayerSessionIssuedAt: Date;
  accessLayerSessionExpiresAt: Date;
};

const DEV_IDENTITY: PetyrAuthIdentity = {
  user: {
    email: "dev.petyr@local",
    displayName: "Local Petyr Developer"
  },
  googleSub: "local-dev-petyr",
  email: "dev.petyr@local",
  permissions: ALL_PETYR_PERMISSIONS,
  role: "local_developer",
  accessSessionId: "local-dev-session",
  correlationId: "local-dev-correlation"
};

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseRequiredDate(value: unknown) {
  if (!isNonEmptyString(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function readPetyrAuthConfig(env: NodeJS.ProcessEnv = process.env): PetyrAuthConfig {
  const explicitMode = clean(env.PETYR_AUTH_MODE);
  const nodeEnv = clean(env.NODE_ENV) ?? "development";

  if (explicitMode && explicitMode !== "disabled" && explicitMode !== "access-layer") {
    throw new Error("PETYR_AUTH_MODE must be either disabled or access-layer.");
  }

  if (nodeEnv === "production" && explicitMode === "disabled") {
    throw new Error("PETYR_AUTH_MODE=disabled is not allowed when NODE_ENV=production.");
  }

  const mode: PetyrAuthMode =
    explicitMode === "disabled" || explicitMode === "access-layer"
      ? explicitMode
      : nodeEnv === "development"
        ? "disabled"
        : "access-layer";

  const config: PetyrAuthConfig = {
    mode,
    publicBaseUrl: clean(env.ACCESS_LAYER_PUBLIC_BASE_URL) ?? clean(env.ACCESS_LAYER_BASE_URL),
    internalBaseUrl: clean(env.ACCESS_LAYER_INTERNAL_BASE_URL) ?? clean(env.ACCESS_LAYER_BASE_URL),
    callbackUrl: clean(env.ACCESS_LAYER_CALLBACK_URL),
    toolSlug: clean(env.ACCESS_LAYER_TOOL_SLUG) ?? "petyr",
    clientId: clean(env.ACCESS_LAYER_CLIENT_ID),
    clientSecret: clean(env.ACCESS_LAYER_CLIENT_SECRET),
    sessionSecret: clean(env.PETYR_SESSION_SECRET)
  };

  if (config.mode === "access-layer") {
    const missing = [
      ["ACCESS_LAYER_PUBLIC_BASE_URL", config.publicBaseUrl],
      ["ACCESS_LAYER_INTERNAL_BASE_URL", config.internalBaseUrl],
      ["ACCESS_LAYER_CALLBACK_URL", config.callbackUrl],
      ["ACCESS_LAYER_CLIENT_ID", config.clientId],
      ["ACCESS_LAYER_CLIENT_SECRET", config.clientSecret],
      ["PETYR_SESSION_SECRET", config.sessionSecret]
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Petyr Access Layer auth is enabled but missing configuration: ${missing.join(", ")}.`);
    }
  }

  return config;
}

export function getLocalDevelopmentIdentity() {
  return DEV_IDENTITY;
}

export function hasPetyrPermission(identity: PetyrAuthIdentity, permission: PetyrPermission) {
  return identity.permissions.includes(permission);
}

export function hasAnyPetyrPermission(identity: PetyrAuthIdentity, permissions: PetyrPermission[]) {
  return permissions.some((permission) => hasPetyrPermission(identity, permission));
}

export function canManagePetyrFeedback(identity: PetyrAuthIdentity) {
  return hasAnyPetyrPermission(identity, [PETYR_PERMISSIONS.feedbackManage, PETYR_PERMISSIONS.admin]);
}

export function canRefreshPetyrSourceData(identity: PetyrAuthIdentity) {
  return identity.permissions.length > 0;
}

export function hasUsablePetyrGrant(identity: PetyrAuthIdentity) {
  return hasPetyrPermission(identity, PETYR_PERMISSIONS.read) || canManagePetyrFeedback(identity);
}

export function getPetyrDefaultLandingPath(identity: PetyrAuthIdentity) {
  return hasPetyrPermission(identity, PETYR_PERMISSIONS.read) ? "/forecasting" : "/petyr-admin/feedback";
}

export function requirePetyrPermissionValue(identity: PetyrAuthIdentity, permission: PetyrPermission) {
  if (!hasPetyrPermission(identity, permission)) {
    throw new Error(`Petyr permission denied: ${permission}.`);
  }
}

export function createAuthState() {
  return randomBytes(24).toString("base64url");
}

export function createPetyrLocalSessionId() {
  return `pts_${randomBytes(32).toString("base64url")}`;
}

export function hashPetyrLocalSessionId(localSessionId: string) {
  return createHash("sha256").update(localSessionId, "utf8").digest("hex");
}

export function isValidAuthCallbackState(actual: string | null, expected: string | undefined) {
  return Boolean(actual && expected && actual === expected);
}

export function parseAccessLayerAuthResponse(
  value: unknown,
  expectedToolSlug: string
): AccessLayerAuthResponse {
  if (!isRecord(value)) {
    throw new Error("Malformed Access Layer authentication response.");
  }

  const session = value.session;
  const user = value.user;
  const tool = value.tool;
  const grant = value.grant;
  const permissions = isRecord(grant) ? grant.permissions : null;
  const issuedAt = isRecord(session) ? parseRequiredDate(session.issued_at) : null;
  const sessionExpiresAt = isRecord(session) ? parseRequiredDate(session.expires_at) : null;

  if (
    !isNonEmptyString(value.access_token) ||
    value.token_type !== "Bearer" ||
    typeof value.expires_in !== "number" ||
    !Number.isFinite(value.expires_in) ||
    !Number.isInteger(value.expires_in) ||
    value.expires_in <= 0 ||
    !isNonEmptyString(value.refresh_token) ||
    !isRecord(session) ||
    !isNonEmptyString(session.id) ||
    !issuedAt ||
    !sessionExpiresAt ||
    sessionExpiresAt.getTime() <= issuedAt.getTime() ||
    !isRecord(user) ||
    !isNonEmptyString(user.google_sub) ||
    !isNonEmptyString(user.email) ||
    (user.display_name !== undefined &&
      user.display_name !== null &&
      typeof user.display_name !== "string") ||
    !isRecord(tool) ||
    tool.slug !== expectedToolSlug ||
    !isRecord(grant) ||
    !isNonEmptyString(grant.role) ||
    !Array.isArray(permissions) ||
    !permissions.every(isNonEmptyString) ||
    !isNonEmptyString(value.correlation_id)
  ) {
    throw new Error("Malformed Access Layer authentication response.");
  }

  return value as AccessLayerAuthResponse;
}

export function toAccessLayerIdentity(payload: AccessLayerAuthResponse): PetyrAuthIdentity {
  return {
    user: {
      email: payload.user.email,
      displayName: payload.user.display_name ?? null
    },
    googleSub: payload.user.google_sub,
    email: payload.user.email,
    permissions: [...payload.grant.permissions],
    role: payload.grant.role,
    accessSessionId: payload.session.id,
    correlationId: payload.correlation_id
  };
}

export function toPetyrServerAuthSession(
  payload: AccessLayerAuthResponse,
  nowMs = Date.now()
): PetyrServerAuthSession {
  return {
    identity: toAccessLayerIdentity(payload),
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    accessTokenExpiresAt: new Date(nowMs + payload.expires_in * 1000),
    accessLayerSessionIssuedAt: new Date(payload.session.issued_at),
    accessLayerSessionExpiresAt: new Date(payload.session.expires_at)
  };
}

export function shouldRefreshPetyrAccessToken(
  accessTokenExpiresAt: Date,
  nowMs = Date.now(),
  thresholdMs = PETYR_AUTH_REFRESH_THRESHOLD_MS
) {
  return accessTokenExpiresAt.getTime() <= nowMs + thresholdMs;
}

export function isPetyrServerSessionExpired(sessionExpiresAt: Date, nowMs = Date.now()) {
  return sessionExpiresAt.getTime() <= nowMs;
}

export function joinAccessLayerUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function getAccessLayerStartUrl(
  config: Pick<PetyrAuthConfig, "publicBaseUrl" | "callbackUrl" | "toolSlug">,
  state: string
) {
  const startUrl = new URL(joinAccessLayerUrl(config.publicBaseUrl ?? "", "/v1/auth/start"));
  startUrl.searchParams.set("tool_slug", config.toolSlug);
  startUrl.searchParams.set("return_url", config.callbackUrl ?? "");
  startUrl.searchParams.set("state", state);
  return startUrl;
}

export function getPetyrPublicRedirectUrl(
  path: string,
  requestUrl: string,
  config: Pick<PetyrAuthConfig, "callbackUrl">
) {
  return new URL(path, config.callbackUrl ?? requestUrl);
}

function derivePetyrTokenEncryptionKey(secret: string) {
  return createHash("sha256")
    .update("petyr-auth-token-encryption-v1", "utf8")
    .update("\0", "utf8")
    .update(secret, "utf8")
    .digest();
}

export function sealPetyrAuthToken(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivePetyrTokenEncryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function openPetyrAuthToken(value: string, secret: string) {
  try {
    const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
    if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) return null;

    const iv = Buffer.from(ivValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    const ciphertext = Buffer.from(ciphertextValue, "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) return null;

    const decipher = createDecipheriv("aes-256-gcm", derivePetyrTokenEncryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
