"use client";

import { useMemo, useState } from "react";
import { formatPetyrInteger, formatPetyrNumber } from "@/lib/petyr/formatters";

type RestoreResult = {
  ok: true;
  durationMs: number;
  fileName: string;
  fileSize: number;
  stderrTail: string | null;
};

const exportEndpoint = "/api/petyr/admin/database-backup/export";
const importEndpoint = "/api/petyr/admin/database-backup/import";

function formatDuration(durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return "n/a";
  if (durationMs < 1000) return `${formatPetyrInteger(durationMs)} ms`;

  return `${formatPetyrNumber(durationMs / 1000)} s`;
}

function parseDownloadFileName(contentDisposition: string | null) {
  const match = contentDisposition?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? "petyr-postgres-backup.sql";
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "n/a";
  if (bytes < 1024) return `${formatPetyrInteger(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatPetyrNumber(bytes / 1024)} KB`;

  return `${formatPetyrNumber(bytes / (1024 * 1024))} MB`;
}

export default function PetyrDatabaseBackupControl() {
  const [secret, setSecret] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [restorePhrase, setRestorePhrase] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const canImport = useMemo(
    () => Boolean(secret.trim() && file && restorePhrase.trim().toUpperCase() === "RESTORE"),
    [file, restorePhrase, secret]
  );

  async function exportBackup() {
    setMessage(null);
    setResult(null);

    if (!secret.trim()) {
      setMessage("Enter APP_INTERNAL_SECRET before exporting the database backup.");
      return;
    }

    setIsExporting(true);
    setMessage("Exporting PostgreSQL backup.");

    try {
      const response = await fetch(exportEndpoint, {
        headers: {
          "x-app-secret": secret.trim()
        }
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
        setMessage(payload.detail || payload.error || "Unable to export PostgreSQL backup.");
        return;
      }

      const blob = await response.blob();
      const fileName = parseDownloadFileName(response.headers.get("content-disposition"));
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage(`Backup exported: ${fileName} (${formatFileSize(blob.size)}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to export PostgreSQL backup.");
    } finally {
      setIsExporting(false);
    }
  }

  async function importBackup() {
    setMessage(null);
    setResult(null);

    if (!canImport || !file) {
      setMessage("Select a .sql backup file, enter APP_INTERNAL_SECRET and type RESTORE.");
      return;
    }

    const confirmed = window.confirm(
      "Import this PostgreSQL backup now? The SQL dump can drop and recreate existing database objects. Use this only on the new target server or after taking a backup."
    );

    if (!confirmed) return;

    setIsImporting(true);
    setMessage("Importing PostgreSQL backup.");

    try {
      const body = new FormData();
      body.append("file", file);
      body.append("confirmed", "true");

      const response = await fetch(importEndpoint, {
        method: "POST",
        headers: {
          "x-app-secret": secret.trim()
        },
        body
      });
      const payload = (await response.json()) as RestoreResult | { error?: string; detail?: string };

      if (!response.ok || !("ok" in payload)) {
        setMessage("detail" in payload ? payload.detail || payload.error || "Unable to import PostgreSQL backup." : "Unable to import PostgreSQL backup.");
        return;
      }

      setResult(payload);
      setMessage("Database backup imported. Restart application containers if they keep stale database connections.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import PostgreSQL backup.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
        Exports and imports the shared PostgreSQL database with native SQL dumps. Restore is destructive when the dump contains clean/drop statements; use it only for migration to a new server or controlled recovery.
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="database-backup-secret">
          APP_INTERNAL_SECRET
        </label>
        <input
          className="mt-2 flex h-10 w-full max-w-xl rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          id="database-backup-secret"
          onChange={(event) => setSecret(event.target.value)}
          placeholder="Protected admin secret"
          type="password"
          value={secret}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Export backup</div>
          <p className="mt-2 text-sm text-slate-600">
            Download a PostgreSQL SQL dump containing Redash snapshots, materialized tables and Petyr-owned forecast data.
          </p>
          <button
            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50"
            disabled={isExporting || isImporting}
            onClick={() => void exportBackup()}
            type="button"
          >
            {isExporting ? "Exporting backup" : "Export database backup"}
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-slate-900">Import backup</div>
          <p className="mt-2 text-sm text-slate-600">
            Restore a `.sql` dump generated by this tool. Type RESTORE to unlock the import button.
          </p>
          <div className="mt-4 space-y-3">
            <input
              accept=".sql,application/sql,text/plain"
              className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-900 hover:file:bg-slate-200"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              type="file"
            />
            <input
              className="flex h-10 w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
              onChange={(event) => setRestorePhrase(event.target.value)}
              placeholder="Type RESTORE"
              value={restorePhrase}
            />
            <button
              className="inline-flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-medium text-rose-900 transition-colors hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-50"
              disabled={isExporting || isImporting || !canImport}
              onClick={() => void importBackup()}
              type="button"
            >
              {isImporting ? "Importing backup" : "Import database backup"}
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">{message}</div>
      ) : null}

      {result ? (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">File</div>
            <div className="mt-1 font-semibold text-slate-900">{result.fileName}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Size</div>
            <div className="mt-1 font-semibold text-slate-900">{formatFileSize(result.fileSize)}</div>
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Duration</div>
            <div className="mt-1 font-semibold text-slate-900">{formatDuration(result.durationMs)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
