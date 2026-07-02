import assert from "node:assert/strict";
import test from "node:test";

import {
  PETYR_NUMERIC_AI_FORECAST_CACHE_EXCLUDED_COLUMNS,
  PETYR_NUMERIC_AI_FORECAST_CACHE_SELECTED_COLUMNS,
  selectLatestNumericAiForecastCacheRows
} from "../src/lib/petyr/numericAiForecastCacheReadModel";

test("numeric AI cache read model ignores large JSON and text payload fields", () => {
  const largeText = "x".repeat(250_000);
  const largeJson = {
    summary: largeText,
    nested: Array.from({ length: 100 }, (_, index) => ({ index, value: largeText.slice(0, 1000) }))
  };
  const seededRows = [
    {
      id: "older",
      companyName: "Large Payload Co",
      businessUnit: "QA",
      year: 2026,
      month: 7,
      forecastValue: 100,
      confidenceScore: 0.6,
      modelVersion: "old-model",
      generatedAt: new Date("2026-06-20T00:00:00.000Z"),
      explanation: largeText,
      requestPayloadSummary: largeJson,
      validatedOutput: largeJson,
      errorMessage: largeText
    },
    {
      id: "latest",
      companyName: "Large Payload Co",
      businessUnit: "QA",
      year: 2026,
      month: 7,
      forecastValue: 200,
      confidenceScore: 0.8,
      modelVersion: "latest-model",
      generatedAt: new Date("2026-06-21T00:00:00.000Z"),
      explanation: largeText,
      requestPayloadSummary: largeJson,
      validatedOutput: largeJson,
      errorMessage: largeText
    }
  ];

  const rows = selectLatestNumericAiForecastCacheRows(seededRows);

  assert.deepEqual(PETYR_NUMERIC_AI_FORECAST_CACHE_SELECTED_COLUMNS, [
    "id",
    "companyName",
    "businessUnit",
    "year",
    "month",
    "forecastValue",
    "confidenceScore",
    "modelVersion",
    "generatedAt"
  ]);
  assert.deepEqual(PETYR_NUMERIC_AI_FORECAST_CACHE_EXCLUDED_COLUMNS, [
    "explanation",
    "requestPayloadSummary",
    "validatedOutput",
    "errorMessage"
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "latest");
  assert.equal(rows[0].forecastValue, 200);

  for (const column of PETYR_NUMERIC_AI_FORECAST_CACHE_EXCLUDED_COLUMNS) {
    assert.equal(Object.hasOwn(rows[0], column), false);
  }
});

test("numeric AI cache read model caps latest rows", () => {
  const rows = selectLatestNumericAiForecastCacheRows(
    Array.from({ length: 3 }, (_, index) => ({
      id: `row-${index}`,
      companyName: `Company ${index}`,
      businessUnit: "QA",
      year: 2026,
      month: 7,
      forecastValue: index,
      confidenceScore: null,
      modelVersion: "model",
      generatedAt: new Date(`2026-06-2${index}T00:00:00.000Z`)
    })),
    2
  );

  assert.deepEqual(rows.map((row) => row.id), ["row-2", "row-1"]);
});
