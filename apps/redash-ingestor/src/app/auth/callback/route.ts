import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { withRedashIngestorBasePath } from "@/lib/basePath";
import { createRedashIngestorSessionCookie } from "@/lib/auth";
import {
  isValidAuthCallbackState,
  joinAccessLayerUrl,
  readRedashIngestorAuthConfig,
  getRedashIngestorPublicRedirectUrl,
  REDASH_INGESTOR_AUTH_SESSION_COOKIE,
  REDASH_INGESTOR_AUTH_STATE_COOKIE,
  toAccessLayerIdentity,
  type AccessLayerExchangeResponse
} from "@/lib/authCore";

export async function GET(request: Request) {
  const config = readRedashIngestorAuthConfig();

  if (config.mode === "disabled") {
    return NextResponse.redirect(getRedashIngestorPublicRedirectUrl(withRedashIngestorBasePath("/"), request.url, config));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(REDASH_INGESTOR_AUTH_STATE_COOKIE)?.value;

  if (!code || !isValidAuthCallbackState(state, expectedState)) {
    cookieStore.delete(REDASH_INGESTOR_AUTH_STATE_COOKIE);
    return NextResponse.json({ ok: false, error: "Invalid Redash Ingestor auth callback state." }, { status: 400 });
  }

  cookieStore.delete(REDASH_INGESTOR_AUTH_STATE_COOKIE);

  const response = await fetch(joinAccessLayerUrl(config.internalBaseUrl ?? "", "/v1/auth/exchange"), {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      code,
      redirect_uri: config.callbackUrl
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    return NextResponse.json({ ok: false, error: "Access Layer exchange failed." }, { status: 401 });
  }

  const exchanged = (await response.json()) as AccessLayerExchangeResponse;
  const identity = toAccessLayerIdentity(exchanged);
  cookieStore.set(
    REDASH_INGESTOR_AUTH_SESSION_COOKIE,
    createRedashIngestorSessionCookie(identity, config.sessionSecret ?? ""),
    {
      httpOnly: true,
      maxAge: 8 * 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    }
  );

  return NextResponse.redirect(getRedashIngestorPublicRedirectUrl(withRedashIngestorBasePath("/"), request.url, config));
}
