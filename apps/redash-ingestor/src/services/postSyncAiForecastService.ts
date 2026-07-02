type PostSyncAiForecastResult = {
  ok: false;
  skipped: true;
  reason: string;
};

export async function runPostSyncAiForecastBatch(): Promise<PostSyncAiForecastResult> {
  return {
    ok: false,
    skipped: true,
    reason: "Petyr AI Forecasting is manual company-by-company for the MVP; post-sync global batch processing is disabled."
  };
}
