import { NextResponse } from "next/server";
import { getPetyrAuthIdentity } from "@/lib/petyr/auth";
import { canRefreshPetyrSourceData } from "@/lib/petyr/authCore";
import { refreshPetyrSourceData } from "@/services/petyrSourceDataRefreshService";

export const maxDuration = 420;

export async function POST() {
  const auth = await getPetyrAuthIdentity();

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  if (!canRefreshPetyrSourceData(auth.identity)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await refreshPetyrSourceData(auth.identity.email);
    const status = result.ok ? 200 : result.error?.includes("already running") ? 409 : 502;

    return NextResponse.json(result, { status });
  } catch (error) {
    console.error("Unable to start Petyr source refresh", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to start the Petyr data refresh. Please contact support."
      },
      { status: 503 }
    );
  }
}
