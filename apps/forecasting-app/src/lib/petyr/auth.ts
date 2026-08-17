import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  getLocalDevelopmentIdentity,
  PETYR_AUTH_SESSION_COOKIE,
  type PetyrAuthIdentity,
  type PetyrPermission,
  readPetyrAuthConfig,
  hasPetyrPermission,
  hasAnyPetyrPermission
} from "./authCore";
import { resolvePetyrAuthSession } from "./authSessionService";
import { prismaPetyrAuthSessionStore } from "./authSessionStore";

export type PetyrAuthResult =
  | { ok: true; identity: PetyrAuthIdentity }
  | {
      ok: false;
      status: 401 | 503;
      error: string;
      clearSessionCookie: boolean;
    };

function createPetyrAuthFailureResponse(result: Extract<PetyrAuthResult, { ok: false }>) {
  const response = NextResponse.json({ error: result.error }, { status: result.status });
  if (result.clearSessionCookie) {
    response.cookies.delete(PETYR_AUTH_SESSION_COOKIE);
  }
  return response;
}

export async function getPetyrAuthIdentity(): Promise<PetyrAuthResult> {
  let config;
  try {
    config = readPetyrAuthConfig();
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Petyr authentication is temporarily unavailable.",
      clearSessionCookie: false
    };
  }

  if (config.mode === "disabled") {
    return { ok: true, identity: getLocalDevelopmentIdentity() };
  }

  const cookieStore = await cookies();
  const localSessionId = cookieStore.get(PETYR_AUTH_SESSION_COOKIE)?.value;
  const resolved = await resolvePetyrAuthSession(localSessionId, config, {
    store: prismaPetyrAuthSessionStore
  });

  if (!resolved.ok) {
    const unavailable = resolved.reason === "store_unavailable";
    return {
      ok: false,
      status: unavailable ? 503 : 401,
      error: unavailable
        ? "Petyr authentication is temporarily unavailable."
        : "Petyr authentication is required.",
      clearSessionCookie: resolved.clearSessionCookie
    };
  }

  return { ok: true, identity: resolved.identity };
}

export async function requirePetyrPagePermission(permission: PetyrPermission) {
  const result = await getPetyrAuthIdentity();

  if (!result.ok) {
    if (result.status === 401) {
      redirect("/auth/login");
    }
    throw new Error(result.error);
  }

  if (!hasPetyrPermission(result.identity, permission)) {
    throw new Error(`Petyr permission denied: ${permission}.`);
  }

  return result.identity;
}

export async function requirePetyrApiPermission(permission: PetyrPermission) {
  const result = await getPetyrAuthIdentity();

  if (!result.ok) {
    return createPetyrAuthFailureResponse(result);
  }

  if (!hasPetyrPermission(result.identity, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return result.identity;
}

export async function requirePetyrPageAnyPermission(permissions: PetyrPermission[]) {
  const result = await getPetyrAuthIdentity();

  if (!result.ok) {
    if (result.status === 401) redirect("/auth/login");
    throw new Error(result.error);
  }

  if (!hasAnyPetyrPermission(result.identity, permissions)) {
    throw new Error(`Petyr permission denied: ${permissions.join(" or ")}.`);
  }

  return result.identity;
}

export async function requirePetyrApiAnyPermission(permissions: PetyrPermission[]) {
  const result = await getPetyrAuthIdentity();

  if (!result.ok) {
    return createPetyrAuthFailureResponse(result);
  }

  if (!hasAnyPetyrPermission(result.identity, permissions)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return result.identity;
}

export async function requirePetyrApiToolAccess() {
  const result = await getPetyrAuthIdentity();

  if (!result.ok) {
    return createPetyrAuthFailureResponse(result);
  }

  if (result.identity.permissions.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return result.identity;
}
