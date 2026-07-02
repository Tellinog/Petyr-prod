import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  joinAccessLayerUrl,
  PETYR_AUTH_SESSION_COOKIE,
  PETYR_AUTH_STATE_COOKIE,
  readPetyrAuthConfig,
  isValidAuthCallbackState,
  getPetyrPublicRedirectUrl,
  toAccessLayerIdentity,
  type AccessLayerExchangeResponse,
  hasUsablePetyrGrant
} from "@/lib/petyr/authCore";
import { createPetyrSessionCookie } from "@/lib/petyr/auth";

function clearPetyrAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete(PETYR_AUTH_STATE_COOKIE);
  cookieStore.delete(PETYR_AUTH_SESSION_COOKIE);
}

function renderPendingGrantPage() {
  const html = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Accesso in preparazione - Petyr</title>
    <style>
      :root { color-scheme: light; font-family: Arial, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #172033; }
      main { width: min(92vw, 560px); background: #ffffff; border: 1px solid #d9dee8; border-radius: 8px; padding: 32px; box-shadow: 0 18px 50px rgba(23, 32, 51, 0.08); }
      p { font-size: 16px; line-height: 1.55; margin: 14px 0 0; color: #3d4758; }
      h1 { font-size: 26px; line-height: 1.2; margin: 0; color: #111827; }
      a { color: #134fc2; font-weight: 700; }
      .eyebrow { margin: 0 0 12px; color: #657084; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .actions { margin-top: 24px; }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">Petyr Forecasting</p>
      <h1>Accesso in preparazione</h1>
      <p>Il tuo account aziendale è valido, ma il grant per Petyr non è ancora attivo.</p>
      <p>L’amministratore è stato notificato. Per sapere quando gli accessi saranno disponibili, fai riferimento a Lorenzo Brandi.</p>
      <p>Abbiamo pulito la sessione di accesso locale: quando il grant sarà rilasciato, torna alla pagina di login e accedi di nuovo con una sessione pulita.</p>
      <p class="actions"><a href="/auth/login">Torna al login</a></p>
    </main>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function GET(request: Request) {
  const config = readPetyrAuthConfig();

  if (config.mode === "disabled") {
    return NextResponse.redirect(getPetyrPublicRedirectUrl("/forecasting", request.url, config));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(PETYR_AUTH_STATE_COOKIE)?.value;

  if (!code || !isValidAuthCallbackState(state, expectedState)) {
    clearPetyrAuthCookies(cookieStore);
    return NextResponse.redirect(getPetyrPublicRedirectUrl("/forecasting/error?code=400", request.url, config));
  }

  clearPetyrAuthCookies(cookieStore);

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
    return NextResponse.json({ error: "Access Layer exchange failed." }, { status: 401 });
  }

  const exchanged = (await response.json()) as AccessLayerExchangeResponse;
  const identity = toAccessLayerIdentity(exchanged);

  if (!hasUsablePetyrGrant(identity)) {
    clearPetyrAuthCookies(cookieStore);
    return renderPendingGrantPage();
  }

  cookieStore.set(PETYR_AUTH_SESSION_COOKIE, createPetyrSessionCookie(identity, config.sessionSecret ?? ""), {
    httpOnly: true,
    maxAge: 8 * 60 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return NextResponse.redirect(getPetyrPublicRedirectUrl("/forecasting", request.url, config));
}
