import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireRedashIngestorApiPermission } from "../../../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS } from "../../../lib/authCore";
import { config } from "../../../lib/config";
import { prisma } from "../../../lib/db";

const sourceSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  redashQueryId: z.number().int().positive(),
  apiKey: z.string().optional(),
  parameters: z.record(z.unknown()).default({}),
  maxAgeSeconds: z.number().int().min(0).default(0),
  enabled: z.boolean().default(true)
});

function isAuthorized(request: NextRequest) {
  return request.headers.get("x-app-secret") === config.APP_INTERNAL_SECRET;
}

export async function GET() {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.read);
  if (auth instanceof NextResponse) return auth;

  const sources = await prisma.redashSource.findMany({
    orderBy: { key: "asc" },
    select: {
      id: true,
      key: true,
      name: true,
      redashQueryId: true,
      parameters: true,
      maxAgeSeconds: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      snapshots: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
        select: {
          id: true,
          fetchedAt: true,
          rowsCount: true,
          queryResultId: true,
          payloadHash: true
        }
      },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1
      }
    }
  });

  return NextResponse.json({ ok: true, sources });
}

export async function POST(request: NextRequest) {
  const auth = await requireRedashIngestorApiPermission(REDASH_INGESTOR_PERMISSIONS.sourcesWrite);
  if (auth instanceof NextResponse) return auth;

  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsedBody = sourceSchema.safeParse(rawBody);

  if (!parsedBody.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid source request body" },
      { status: 400 }
    );
  }

  const body = parsedBody.data;

  const source = await prisma.redashSource.upsert({
    where: { key: body.key },
    update: {
      name: body.name,
      redashQueryId: body.redashQueryId,
      apiKey: body.apiKey,
      parameters: body.parameters as Prisma.InputJsonValue,
      maxAgeSeconds: body.maxAgeSeconds,
      enabled: body.enabled
    },
    create: {
      key: body.key,
      name: body.name,
      redashQueryId: body.redashQueryId,
      apiKey: body.apiKey,
      parameters: body.parameters as Prisma.InputJsonValue,
      maxAgeSeconds: body.maxAgeSeconds,
      enabled: body.enabled
    }
  });

  const { apiKey: _apiKey, ...safeSource } = source;

  return NextResponse.json({ ok: true, source: safeSource });
}
