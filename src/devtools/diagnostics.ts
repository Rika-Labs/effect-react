import type { QueryCache, QueryCacheDiagnosticsSnapshot } from "../query/QueryCache";

export interface QueryDiagnosticsSummary {
  readonly total: number;
  readonly stale: number;
  readonly loading: number;
  readonly failure: number;
  readonly subscribers: number;
  readonly inFlight: number;
}

export const snapshotQueryCache = (cache: QueryCache): QueryCacheDiagnosticsSnapshot =>
  cache.diagnostics();

export const summarizeQueryDiagnostics = (
  snapshot: QueryCacheDiagnosticsSnapshot,
): QueryDiagnosticsSummary => {
  let stale = 0;
  let loading = 0;
  let failure = 0;
  let subscribers = 0;
  let inFlight = 0;
  for (const entry of snapshot.entries) {
    if (entry.isStale) {
      stale += 1;
    }
    if (entry.status === "loading" || entry.status === "refreshing") {
      loading += 1;
    }
    if (entry.status === "failure") {
      failure += 1;
    }
    subscribers += entry.subscribers;
    if (entry.inFlight) {
      inFlight += 1;
    }
  }
  return {
    total: snapshot.size,
    stale,
    loading,
    failure,
    subscribers,
    inFlight,
  };
};
