import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PETYR_AUTH_SESSION_COOKIE,
  PETYR_AUTH_STATE_COOKIE,
  readPetyrAuthConfig,
  getPetyrPublicRedirectUrl
} from "@/lib/petyr/authCore";
import { logoutPetyrAuthSession } from "@/lib/petyr/authSessionService";
import { prismaPetyrAuthSessionStore } from "@/lib/petyr/authSessionStore";

async function logout(request: Request) {
  const cookieStore = await cookies();
  const localSessionId = cookieStore.get(PETYR_AUTH_SESSION_COOKIE)?.value;

  cookieStore.delete(PETYR_AUTH_SESSION_COOKIE);
  cookieStore.delete(PETYR_AUTH_STATE_COOKIE);

  let config;
  try {
    config = readPetyrAuthConfig();
  } catch {
    if (localSessionId) {
      try {
        await prismaPetyrAuthSessionStore.delete(localSessionId);
      } catch {
        // The browser cookie is still removed even if the backing store is unavailable.
      }
    }
    return NextResponse.redirect(new URL("/forecasting", request.url));
  }

  await logoutPetyrAuthSession(localSessionId, config, {
    store: prismaPetyrAuthSessionStore
  });

  return NextResponse.redirect(getPetyrPublicRedirectUrl("/forecasting", request.url, config));
}

export async function GET(request: Request) {
  return logout(request);
}

export async function POST(request: Request) {
  return logout(request);
}
