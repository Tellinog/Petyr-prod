import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createAuthState,
  getAccessLayerStartUrl,
  getPetyrPublicRedirectUrl,
  PETYR_AUTH_SESSION_COOKIE,
  PETYR_AUTH_STATE_COOKIE,
  readPetyrAuthConfig
} from "@/lib/petyr/authCore";
import { logoutPetyrAuthSession } from "@/lib/petyr/authSessionService";
import { prismaPetyrAuthSessionStore } from "@/lib/petyr/authSessionStore";

export async function GET(request: Request) {
  const config = readPetyrAuthConfig();

  if (config.mode === "disabled") {
    return NextResponse.redirect(getPetyrPublicRedirectUrl("/forecasting", request.url, config));
  }

  const cookieStore = await cookies();
  const existingLocalSessionId = cookieStore.get(PETYR_AUTH_SESSION_COOKIE)?.value;
  if (existingLocalSessionId) {
    await logoutPetyrAuthSession(existingLocalSessionId, config, {
      store: prismaPetyrAuthSessionStore
    });
  }
  cookieStore.delete(PETYR_AUTH_SESSION_COOKIE);

  const state = createAuthState();
  cookieStore.set(PETYR_AUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 5 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return NextResponse.redirect(getAccessLayerStartUrl(config, state));
}
