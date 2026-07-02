import { prisma } from "../lib/db";
import { withRedashIngestorBasePath } from "../lib/basePath";
import { requireRedashIngestorPagePermission } from "../lib/auth";
import { REDASH_INGESTOR_PERMISSIONS, hasRedashIngestorPermission } from "../lib/authCore";
import { getRedashDbTablePreview } from "../services/redashDbTablePreview";
import { ManualSyncPanel } from "./components/ManualSyncPanel";

export const dynamic = "force-dynamic";

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDbCell(value: unknown, maxLength = 90) {
  if (value === null || value === undefined) return "-";
  if (value instanceof Date) return formatDate(value);
  if (typeof value === "string") return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);

  const serialized = JSON.stringify(value);
  if (!serialized) return "-";
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span>-</span>;

  const className =
    status === "SUCCESS" ? "success" : status === "FAILED" ? "failed" : "running";

  return <span className={`badge ${className}`}>{status}</span>;
}

export default async function HomePage() {
  const identity = await requireRedashIngestorPagePermission(REDASH_INGESTOR_PERMISSIONS.read);
  const canSync = hasRedashIngestorPermission(identity, REDASH_INGESTOR_PERMISSIONS.sync);
  const [sources, recentRuns, snapshotsCount, configuredSourcesCount] = await Promise.all([
    prisma.redashSource.findMany({
      where: { enabled: true },
      orderBy: { key: "asc" },
      include: {
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
          take: 1,
          select: {
            status: true,
            startedAt: true,
            finishedAt: true,
            errorMessage: true
          }
        }
      }
    }),
    prisma.redashSyncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 12,
      include: { source: true }
    }),
    prisma.redashSnapshot.count(),
    prisma.redashSource.count()
  ]);

  const dbTablePreviews = await Promise.all(
    sources.map((source) => getRedashDbTablePreview(source.key, 25))
  );
  const dbTablePreviewBySourceKey = new Map(
    dbTablePreviews.map((preview) => [preview.sourceKey, preview])
  );
  const successRuns = recentRuns.filter((run) => run.status === "SUCCESS").length;
  const failedRuns = recentRuns.filter((run) => run.status === "FAILED").length;

  return (
    <main>
      <header>
        <p className="eyebrow">UNGUESS Data Platform</p>
        <h1>Redash Ingestor</h1>
        <p>
          Servizio Dockerizzato che legge Redash, salva i JSON grezzi in PostgreSQL e
          rende disponibili snapshot e preview dati per i futuri servizi, incluso Forecasting.
        </p>
      </header>

      <section className="grid">
        <div className="card">
          <div className="metric">{configuredSourcesCount}</div>
          <div className="label">Sorgenti configurate</div>
        </div>
        <div className="card">
          <div className="metric">{sources.length}</div>
          <div className="label">Sorgenti attive</div>
        </div>
        <div className="card">
          <div className="metric">{snapshotsCount}</div>
          <div className="label">Snapshot salvati</div>
        </div>
        <div className="card">
          <div className="metric">{successRuns}/{failedRuns}</div>
          <div className="label">Run recenti ok/fail</div>
        </div>
      </section>

      <ManualSyncPanel
        canSync={canSync}
        sources={sources.map((source) => ({ key: source.key, name: source.name }))}
      />

      <section className="card info-card">
        <h2>Data flow</h2>
        <p>
          Redash - Redash Ingestor / Worker - PostgreSQL - API preview - servizi futuri.
          La Forecasting App non dovra chiamare Redash direttamente: leggera da PostgreSQL
          o da API interne stabili.
        </p>
      </section>

      <section className="card table-card">
        <h2>Sorgenti Redash attive</h2>
        <table>
          <thead>
            <tr>
              <th>Key</th>
              <th>Nome</th>
              <th>Query ID</th>
              <th>Ultimo stato</th>
              <th>Ultimo snapshot</th>
              <th>Righe</th>
              <th>DB table API</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => {
              const latestSnapshot = source.snapshots[0];
              const latestRun = source.runs[0];

              return (
                <tr key={source.id}>
                  <td><code>{source.key}</code></td>
                  <td>{source.name}</td>
                  <td>{source.redashQueryId}</td>
                  <td><StatusBadge status={latestRun?.status} /></td>
                  <td>{formatDate(latestSnapshot?.fetchedAt)}</td>
                  <td>{latestSnapshot?.rowsCount ?? "-"}</td>
                  <td>
                    <a href={withRedashIngestorBasePath(`/api/redash/db-table-preview?source=${source.key}&limit=25`)}>
                      Apri DB preview
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card table-card" style={{ marginTop: 18 }}>
        <h2>Database table preview</h2>
        <p className="section-description">
          Le tabelle sotto leggono le tabelle PostgreSQL materializzate, non il JSONB degli snapshot.
          Mostrano le prime 25 righe con i nomi colonna reali del database.
        </p>

        <div className="preview-stack">
          {sources.map((source) => {
            const preview = dbTablePreviewBySourceKey.get(source.key);
            const visibleColumns = preview?.columns ?? [];

            return (
              <div className="preview-block" key={`${source.id}-db-preview`}>
                <div className="preview-heading">
                  <div>
                    <h3>Database table preview</h3>
                    <p>
                      <code>{source.key}</code> - {source.name}
                    </p>
                  </div>
                  <a href={withRedashIngestorBasePath(`/api/redash/db-table-preview?source=${source.key}&limit=25`)}>API completa</a>
                </div>

                {!preview?.tableName ? (
                  <p className="empty-state">Nessuna tabella materializzata configurata per questa sorgente.</p>
                ) : !preview.tableExists ? (
                  <p className="empty-state">
                    La tabella <code>{preview.tableName}</code> non esiste ancora. Lancia un sync per materializzare i dati.
                  </p>
                ) : (
                  <>
                    <div className="db-preview-meta">
                      <div>
                        <span>Table name</span>
                        <code>{preview.tableName}</code>
                      </div>
                      <div>
                        <span>Row count</span>
                        <strong>{preview.rowCount}</strong>
                      </div>
                      <div>
                        <span>synced_at</span>
                        <strong>{formatDate(preview.syncedAt)}</strong>
                      </div>
                      <div>
                        <span>PostgreSQL columns</span>
                        <strong>{preview.columns.length}</strong>
                      </div>
                    </div>

                    {preview.rows.length === 0 ? (
                      <p className="empty-state">La tabella materializzata esiste ma non contiene righe.</p>
                    ) : (
                      <table className="mini-table db-preview-table">
                        <thead>
                          <tr>
                            {visibleColumns.map((column) => (
                              <th key={column.name}>
                                <code>{column.name}</code>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((row, index) => (
                            <tr key={`${source.key}-db-row-${String(row.row_index ?? index)}`}>
                              {visibleColumns.map((column) => (
                                <td key={column.name}>{formatDbCell(row[column.name])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    <div className="mapping-section">
                      <h4>Column mapping</h4>
                      {preview.mappings.length === 0 ? (
                        <p className="empty-state">Nessuna mappatura colonna disponibile.</p>
                      ) : (
                        <table className="mini-table mapping-table">
                          <thead>
                            <tr>
                              <th>Redash column name</th>
                              <th>PostgreSQL column name</th>
                              <th>Detected type</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.mappings.map((mapping) => (
                              <tr key={`${source.key}-${mapping.position}-${mapping.dbColumnName}`}>
                                <td>{mapping.redashColumnName}</td>
                                <td><code>{mapping.dbColumnName}</code></td>
                                <td>{mapping.detectedType}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card table-card" style={{ marginTop: 18 }}>
        <h2>Ultimi sync run</h2>
        <table>
          <thead>
            <tr>
              <th>Ora</th>
              <th>Sorgente</th>
              <th>Stato</th>
              <th>Righe</th>
              <th>Errore</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((run) => (
              <tr key={run.id}>
                <td>{formatDate(run.startedAt)}</td>
                <td><code>{run.source.key}</code></td>
                <td><StatusBadge status={run.status} /></td>
                <td>{run.rowsCount ?? "-"}</td>
                <td>{run.errorMessage ? run.errorMessage.slice(0, 160) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
