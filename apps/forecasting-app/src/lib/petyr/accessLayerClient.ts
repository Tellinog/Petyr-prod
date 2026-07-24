import {
  joinAccessLayerUrl,
  parseAccessLayerAuthResponse,
  type AccessLayerAuthResponse,
  type PetyrAuthConfig
} from "./authCore";

export type PetyrAccessLayerRequestErrorKind =
  | "invalid_refresh"
  | "network"
  | "rejected"
  | "malformed";

export class PetyrAccessLayerRequestError extends Error {
  readonly kind: PetyrAccessLayerRequestErrorKind;

  constructor(kind: PetyrAccessLayerRequestErrorKind) {
    super("Access Layer authentication request failed.");
    this.name = "PetyrAccessLayerRequestError";
    this.kind = kind;
  }
}

export type PetyrAccessLayerClientDependencies = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function getBasicAuthorization(config: Pick<PetyrAuthConfig, "clientId" | "clientSecret">) {
  return `Basic ${Buffer.from(`${config.clientId ?? ""}:${config.clientSecret ?? ""}`).toString("base64")}`;
}

async function fetchForAuthenticatedUserActivity(
  input: string,
  init: RequestInit,
  dependencies: PetyrAccessLayerClientDependencies
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 10_000);

  try {
    return await (dependencies.fetchImpl ?? fetch)(input, {
      ...init,
      signal: controller.signal,
      cache: "no-store"
    });
  } catch {
    throw new PetyrAccessLayerRequestError("network");
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorCode(response: Response) {
  try {
    const value = (await response.json()) as unknown;
    if (
      value &&
      typeof value === "object" &&
      "error" in value &&
      value.error &&
      typeof value.error === "object" &&
      "code" in value.error &&
      typeof value.error.code === "string"
    ) {
      return value.error.code;
    }
  } catch {
    // Error payloads are deliberately not propagated to callers or browser responses.
  }
  return null;
}

async function readAuthResponse(response: Response, expectedToolSlug: string) {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new PetyrAccessLayerRequestError("malformed");
  }

  try {
    return parseAccessLayerAuthResponse(value, expectedToolSlug);
  } catch {
    throw new PetyrAccessLayerRequestError("malformed");
  }
}

export async function exchangeAccessLayerCode(
  config: PetyrAuthConfig,
  code: string,
  dependencies: PetyrAccessLayerClientDependencies = {}
): Promise<AccessLayerAuthResponse> {
  const response = await fetchForAuthenticatedUserActivity(
    joinAccessLayerUrl(config.internalBaseUrl ?? "", "/v1/auth/exchange"),
    {
      method: "POST",
      headers: {
        authorization: getBasicAuthorization(config),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        code,
        redirect_uri: config.callbackUrl
      })
    },
    dependencies
  );

  if (!response.ok) {
    throw new PetyrAccessLayerRequestError("rejected");
  }

  return readAuthResponse(response, config.toolSlug);
}

export async function refreshAccessLayerSession(
  config: PetyrAuthConfig,
  refreshToken: string,
  dependencies: PetyrAccessLayerClientDependencies = {}
): Promise<AccessLayerAuthResponse> {
  const response = await fetchForAuthenticatedUserActivity(
    joinAccessLayerUrl(config.internalBaseUrl ?? "", "/v1/auth/refresh"),
    {
      method: "POST",
      headers: {
        authorization: getBasicAuthorization(config),
        "content-type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    },
    dependencies
  );

  if (!response.ok) {
    const code = await readErrorCode(response);
    if (response.status === 401 && code === "AUTH_REFRESH_TOKEN_INVALID") {
      throw new PetyrAccessLayerRequestError("invalid_refresh");
    }
    throw new PetyrAccessLayerRequestError("rejected");
  }

  return readAuthResponse(response, config.toolSlug);
}

export async function logoutAccessLayerSession(
  config: PetyrAuthConfig,
  sessionId: string | null,
  refreshToken: string | null,
  dependencies: PetyrAccessLayerClientDependencies = {}
) {
  const body: { session_id?: string; refresh_token?: string } = {};
  if (sessionId) body.session_id = sessionId;
  if (refreshToken) body.refresh_token = refreshToken;

  const response = await fetchForAuthenticatedUserActivity(
    joinAccessLayerUrl(config.internalBaseUrl ?? "", "/v1/auth/logout"),
    {
      method: "POST",
      headers: {
        authorization: getBasicAuthorization(config),
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    },
    dependencies
  );

  if (!response.ok) {
    throw new PetyrAccessLayerRequestError("rejected");
  }
}
