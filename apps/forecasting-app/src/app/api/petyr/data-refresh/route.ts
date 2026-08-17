import { NextResponse } from "next/server";
import { requirePetyrApiToolAccess } from "@/lib/petyr/auth";
import { refreshPetyrSourceData } from "@/services/petyrSourceDataRefreshService";

export const maxDuration = 420;

export async function POST() {
  const auth = await requirePetyrApiToolAccess();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await refreshPetyrSourceData(auth.email);
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
