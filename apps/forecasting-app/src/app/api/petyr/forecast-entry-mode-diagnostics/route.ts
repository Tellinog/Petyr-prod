import { NextResponse } from "next/server";
import { getForecastEntryModeDiagnostics } from "@/lib/forecastEntryMode";

export function GET() {
  const cases = getForecastEntryModeDiagnostics();
  const ok = cases.every((testCase) => testCase.passed);

  return NextResponse.json({ ok, cases }, { status: ok ? 200 : 500 });
}
