import { NextResponse } from "next/server";
import { requirePetyrApiPermission } from "@/lib/petyr/auth";
import { PETYR_PERMISSIONS } from "@/lib/petyr/authCore";
import { getOpenRouterModels } from "@/services/openRouterModelsService";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePetyrApiPermission(PETYR_PERMISSIONS.admin);
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json(await getOpenRouterModels(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
