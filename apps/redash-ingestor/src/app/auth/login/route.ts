import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withRedashIngestorBasePath } from "@/lib/basePath";
import {
  createAuthState,
  joinAccessLayerUrl,
  readRedashIngestorAuthConfig,
  getRedashIngestorPublicRedirectUrl,
  REDASH_INGESTOR_AUTH_STATE_COOKIE
} from "@/lib/authCore";

export async function GET(request: Request) {
  const config = readRedashIngestorAuthConfig();

  if (config.mode === "disabled") {
    return NextResponse.redirect(getRedashIngestorPublicRedirectUrl(withRedashIngestorBasePath("/"), request.url, config));
  }

  const state = createAuthState();
  const cookieStore = await cookies();
  cookieStore.set(REDASH_INGESTOR_AUTH_STATE_COOKIE, state, {
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
