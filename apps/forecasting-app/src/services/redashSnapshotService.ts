import { prisma } from "@/lib/db";

type RedashPayload = {
  query_result?: {
    data?: {
      columns?: unknown[];
      rows?: unknown[];
    };
  };
};

export async function getLatestRedashPreview(sourceKey: string, limit = 25) {
  const source = await prisma.redashSource.findUnique({
    where: { key: sourceKey },
    include: {
      snapshots: {
        orderBy: { fetchedAt: "desc" },
        take: 1
      }
    }
  });

  if (!source) return null;

  const latestSnapshot = source.snapshots[0];
  if (!latestSnapshot) {
    return {
      source: { key: source.key, name: source.name },
      fetchedAt: null,
      rowsCount: 0,
      columns: [],
      rows: []
    };
  }

  const payload = latestSnapshot.payload as RedashPayload;
  const columns = payload.query_result?.data?.columns ?? [];
  const rows = payload.query_result?.data?.rows ?? [];

  return {
    source: { key: source.key, name: source.name },
    fetchedAt: latestSnapshot.fetchedAt,
    rowsCount: latestSnapshot.rowsCount,
    columns,
    rows: rows.slice(0, limit)
  };
}
