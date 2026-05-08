"use client";

import { useCallback, useEffect, useState } from "react";
import { RiShieldKeyholeLine } from "@remixicon/react";

type LogRow = {
  id: string;
  createdAt: string;
  action: string;
  actorUserEmail: string | null;
  actorTokenName: string | null;
  ipAddress: string | null;
  projectId?: string | null;
  environmentId?: string | null;
  secretKey: string | null;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
};

const ACTIONS = [
  "",
  "SECRET_CREATE",
  "SECRET_UPDATE",
  "SECRET_DELETE",
  "SECRET_REVEAL",
  "SECRET_FETCH_BULK",
  "TOKEN_CREATE",
  "TOKEN_REVOKE",
  "TOKEN_USE_FAILED",
  "MEMBER_INVITE",
  "MEMBER_INVITE_ACCEPT",
  "MEMBER_ROLE_CHANGE",
  "MEMBER_REMOVE",
  "PROJECT_CREATE",
  "PROJECT_DELETE",
  "ORG_CREATE",
  "ORG_DELETE",
];

function actionTone(action: string): string {
  if (
    action.startsWith("SECRET_DELETE") ||
    action.endsWith("_REMOVE") ||
    action.endsWith("_DELETE") ||
    action.endsWith("_FAILED") ||
    action === "TOKEN_REVOKE"
  ) {
    return "text-danger";
  }
  if (
    action.endsWith("_CREATE") ||
    action.endsWith("_ACCEPT") ||
    action === "SECRET_REVEAL" ||
    action === "SECRET_FETCH_BULK"
  ) {
    return "text-success";
  }
  return "";
}

export default function AuditLogTable({
  apiBase,
  csvUrl,
}: {
  apiBase: string;
  /** Si null, le bouton d'export CSV n'est pas affiché (utilisé pour les
   *  rôles qui n'ont pas accès à l'export, ex. DEV). */
  csvUrl: string | null;
}) {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ limit: "50" });
      if (filterAction) params.set("action", filterAction);
      if (!reset && cursor) params.set("cursor", cursor);
      const res = await fetch(`${apiBase}?${params.toString()}`);
      if (!res.ok) {
        setError("Erreur de chargement.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        logs: LogRow[];
        nextCursor: string | null;
      };
      setLogs((prev) => (reset ? data.logs : [...prev, ...data.logs]));
      setCursor(data.nextCursor);
      setHasMore(Boolean(data.nextCursor));
      setLoading(false);
    },
    [apiBase, cursor, filterAction],
  );

  useEffect(() => {
    setLogs([]);
    setCursor(null);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAction, apiBase]);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="form-row"
        style={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <div className="flex items-center gap-2">
          <span className="help">Filtrer :</span>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="select"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a || "Toutes les actions"}
              </option>
            ))}
          </select>
        </div>
        {csvUrl && (
          <a href={csvUrl} download className="btn btn-ghost btn-sm">
            Exporter CSV
          </a>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Action</th>
              <th>Acteur</th>
              <th>Cible</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="text-muted" style={{ textAlign: "center" }}>
                  Aucune entrée.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isOpen = expanded === log.id;
                return (
                  <tr
                    key={log.id}
                    onClick={() => setExpanded(isOpen ? null : log.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className="code-mono" style={{ whiteSpace: "nowrap" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className={`code-mono ${actionTone(log.action)}`}>
                      {log.action}
                    </td>
                    <td>
                      {log.actorUserEmail ??
                        (log.actorTokenName ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <RiShieldKeyholeLine size={12} aria-hidden />
                            {log.actorTokenName}
                          </span>
                        ) : (
                          "—"
                        ))}
                    </td>
                    <td>
                      {log.secretKey ? (
                        <code className="code-mono">{log.secretKey}</code>
                      ) : log.targetType ? (
                        <span className="text-muted">{log.targetType}</span>
                      ) : (
                        "—"
                      )}
                      {isOpen && log.metadata !== null && (
                        <pre
                          className="code-mono"
                          style={{
                            marginTop: 8,
                            padding: 8,
                            background: "var(--code-bg)",
                            borderRadius: 6,
                            fontSize: 11,
                            overflow: "auto",
                            maxWidth: 480,
                          }}
                        >
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      )}
                    </td>
                    <td className="code-mono text-muted">
                      {log.ipAddress ?? "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center">
        {hasMore && (
          <button
            type="button"
            onClick={() => load(false)}
            disabled={loading}
            className="btn btn-ghost btn-sm"
          >
            {loading ? "Chargement..." : "Charger plus"}
          </button>
        )}
        {loading && logs.length === 0 && <p className="help">Chargement…</p>}
      </div>
    </div>
  );
}
