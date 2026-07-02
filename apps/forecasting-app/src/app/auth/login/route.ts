import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createAuthState,
  getPetyrPublicRedirectUrl,
  joinAccessLayerUrl,
  PETYR_AUTH_STATE_COOKIE,
  readPetyrAuthConfig
} from "@/lib/petyr/authCore";

export async function GET(request: Request) {
  const config = readPetyrAuthConfig();

  if (config.mode === "disabled") {
    return NextResponse.redirect(getPetyrPublicRedirectUrl("/forecasting", request.url, config));
  }

  const state = createAuthState();
  const cookieStore = await cookies();
  cookieStore.set(PETYR_AUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 5 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  const startUrl = new URL(joinAccessLayerUrl(config.publicBaseUrl ?? "", "/v1/auth/start"));
  startUrl.searchParams.set("tool_slug", config.toolSlug);
  startUrl.searchParams.set("return_url", config.callbackUrl ?? "");
  startUrl.searchParams.set("state", state);

  return NextResponse.redirect(startUrl);
}
