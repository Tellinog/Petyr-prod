import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PETYR_AUTH_SESSION_COOKIE,
  readPetyrAuthConfig,
  verifyPetyrSession,
  joinAccessLayerUrl,
  getPetyrPublicRedirectUrl
} from "@/lib/petyr/authCore";

async function logout(request: Request) {
  const config = readPetyrAuthConfig();
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(PETYR_AUTH_SESSION_COOKIE)?.value;
  const identity =
    config.mode === "access-layer" && config.sessionSecret
      ? verifyPetyrSession(sessionCookie, config.sessionSecret)
      : null;

  cookieStore.delete(PETYR_AUTH_SESSION_COOKIE);

  if (config.mode === "access-layer" && identity) {
    try {
      await fetch(joinAccessLayerUrl(config.internalBaseUrl ?? "", "/v1/auth/logout"), {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ session_id: identity.accessSessionId }),
        cache: "no-store"
      });
    } catch {
      // Local Petyr logout still succeeds if central logout is temporarily unavailable.
    }
  }

  return NextResponse.redirect(getPetyrPublicRedirectUrl("/forecasting", request.url, config));
}

export async function GET(request: Request) {
  return logout(request);
}

export async function POST(request: Request) {
  return logout(request);
}
