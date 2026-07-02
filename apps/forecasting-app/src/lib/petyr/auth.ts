import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  getLocalDevelopmentIdentity,
  PETYR_AUTH_SESSION_COOKIE,
  type PetyrAuthIdentity,
  type PetyrPermission,
  readPetyrAuthConfig,
  signPetyrSession,
  verifyPetyrSession,
  hasPetyrPermission
} from "./authCore";

export type PetyrAuthResult =
  | { ok: true; identity: PetyrAuthIdentity }
  | { ok: false; status: 401 | 403 | 503; error: string };

export async function getPetyrAuthIdentity(): Promise<PetyrAuthResult> {
  let config;
  try {
    config = readPetyrAuthConfig();
  } catch (error) {
    return {
      ok: false,
      status: 503,
      error: error instanceof Error ? error.message : "Petyr auth configuration is invalid."
    };
  }

  if (config.mode === "disabled") {
    return { ok: true, identity: getLocalDevelopmentIdentity() };
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(PETYR_AUTH_SESSION_COOKIE)?.value;
  const identity = verifyPetyrSession(sessionCookie, config.sessionSecret ?? "");

  if (!identity) {
    return { ok: false, status: 401, error: "Petyr authentication is required." };
  }

  return { ok: true, identity };
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
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (!hasPetyrPermission(result.identity, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return result.identity;
}

export function createPetyrSessionCookie(identity: PetyrAuthIdentity, secret: string) {
  return signPetyrSession(identity, secret);
}
