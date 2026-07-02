import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  getLocalDevelopmentIdentity,
  hasRedashIngestorPermission,
  readRedashIngestorAuthConfig,
  REDASH_INGESTOR_AUTH_SESSION_COOKIE,
  type RedashIngestorAuthIdentity,
  type RedashIngestorPermission,
  signRedashIngestorSession,
  verifyRedashIngestorSession
} from "./authCore";
import { withRedashIngestorBasePath } from "./basePath";

export type RedashIngestorAuthResult =
  | { ok: true; identity: RedashIngestorAuthIdentity }
  | { ok: false; status: 401 | 403 | 503; error: string };

export async function getRedashIngestorAuthIdentity(): Promise<RedashIngestorAuthResult> {
  let config;
  try {
    config = readRedashIngestorAuthConfig();
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: error instanceof Error ? error.message : "Redash Ingestor auth configuration is invalid."
    };
  }

  if (config.mode === "disabled") {
    return { ok: true, identity: getLocalDevelopmentIdentity() };
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(REDASH_INGESTOR_AUTH_SESSION_COOKIE)?.value;
  const identity = verifyRedashIngestorSession(sessionCookie, config.sessionSecret ?? "");

  if (!identity) {
    return { ok: false, status: 401, error: "Redash Ingestor authentication is required." };
  }

  return { ok: true, identity };
}

export async function requireRedashIngestorPagePermission(permission: RedashIngestorPermission) {
  const result = await getRedashIngestorAuthIdentity();

  if (!result.ok) {
    if (result.status === 401) {
      redirect("/auth/login");
    }
    throw new Error(result.error);
  }

  if (!hasRedashIngestorPermission(result.identity, permission)) {
    throw new Error(`Redash Ingestor permission denied: ${permission}.`);
  }

  return result.identity;
}

export async function requireRedashIngestorApiPermission(permission: RedashIngestorPermission) {
  const result = await getRedashIngestorAuthIdentity();

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  if (!hasRedashIngestorPermission(result.identity, permission)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return result.identity;
}

export function createRedashIngestorSessionCookie(identity: RedashIngestorAuthIdentity, secret: string) {
  return signRedashIngestorSession(identity, secret);
}
