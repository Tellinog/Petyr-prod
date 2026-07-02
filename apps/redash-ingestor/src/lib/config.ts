import { z } from "zod";

const booleanEnv = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => ["1", "true", "yes", "y"].includes(value));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDASH_BASE_URL: z.string().url(),
  REDASH_API_KEY: z.string().min(1),
  REDASH_AUTH_MODE: z.enum(["header", "query"]).default("header"),
  SYNC_MAX_AGE_SECONDS: z.coerce.number().int().min(0).default(0),
  SYNC_POLL_INTERVAL_MS: z.coerce.number().int().min(250).default(2000),
  SYNC_JOB_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),
  SYNC_DAILY_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default("01:30"),
  SYNC_LOCK_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  TZ: z.string().min(1).default("Europe/Rome"),
  APP_INTERNAL_SECRET: z.string().trim().optional().default(""),
  FORECASTING_APP_INTERNAL_URL: z.string().url().default("http://forecasting-app:3000"),
  AI_FORECAST_AFTER_SYNC_ENABLED: booleanEnv.default("false"),
  AI_FORECAST_AFTER_SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(10).default(3),
  AI_FORECAST_AFTER_SYNC_DELAY_MS: z.coerce.number().int().min(0).max(10000).default(1200),
  AI_FORECAST_AFTER_SYNC_DRY_RUN: booleanEnv.default("false")
});

export const config = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  REDASH_BASE_URL: process.env.REDASH_BASE_URL,
  REDASH_API_KEY: process.env.REDASH_API_KEY,
  REDASH_AUTH_MODE: process.env.REDASH_AUTH_MODE ?? "header",
  SYNC_MAX_AGE_SECONDS: process.env.SYNC_MAX_AGE_SECONDS ?? "0",
  SYNC_POLL_INTERVAL_MS: process.env.SYNC_POLL_INTERVAL_MS ?? "2000",
  SYNC_JOB_TIMEOUT_MS: process.env.SYNC_JOB_TIMEOUT_MS ?? "120000",
  SYNC_DAILY_TIME: process.env.SYNC_DAILY_TIME ?? "01:30",
  SYNC_LOCK_TTL_SECONDS: process.env.SYNC_LOCK_TTL_SECONDS ?? "3600",
  TZ: process.env.TZ ?? "Europe/Rome",
  APP_INTERNAL_SECRET: process.env.APP_INTERNAL_SECRET,
  FORECASTING_APP_INTERNAL_URL: process.env.FORECASTING_APP_INTERNAL_URL ?? "http://forecasting-app:3000",
  AI_FORECAST_AFTER_SYNC_ENABLED: process.env.AI_FORECAST_AFTER_SYNC_ENABLED ?? "false",
  AI_FORECAST_AFTER_SYNC_BATCH_SIZE: process.env.AI_FORECAST_AFTER_SYNC_BATCH_SIZE ?? "3",
  AI_FORECAST_AFTER_SYNC_DELAY_MS: process.env.AI_FORECAST_AFTER_SYNC_DELAY_MS ?? "1200",
  AI_FORECAST_AFTER_SYNC_DRY_RUN: process.env.AI_FORECAST_AFTER_SYNC_DRY_RUN ?? "false"
});
