import { Cause, Effect, Exit } from "effect";
import { toMillis, type DurationInput } from "../internal/duration";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import {
  createExternalStore,
  type ExternalStore,
  type StoreListener,
} from "../internal/externalStore";
import { hashQueryKey, type KeyHasher } from "../internal/keyHash";
import type { EffectRuntime } from "../internal/runtimeContext";
import {
  DEHYDRATED_STATE_VERSION,
  type DehydratedQuery,
  type DehydratedState,
  type QueryFilters,
  type QueryKey,
  type QueryResult,
  type QueryStatus,
} from "./types";

export interface QueryCacheOptions {
  readonly defaultStaleTime?: DurationInput;
  readonly defaultGcTime?: DurationInput;
  readonly keyHasher?: KeyHasher;
  readonly now?: () => number;
}

export interface EnsureEntryOptions<A> {
  readonly key: QueryKey;
  readonly staleTime?: DurationInput;
  readonly gcTime?: DurationInput;
  readonly initialData?: A;
  readonly keyHasher?: KeyHasher;
}

export interface FetchQueryOptions<A, E, R, ER> extends EnsureEntryOptions<A> {
  readonly runtime: EffectRuntime;
  readonly query: Effect.Effect<A, E, R>;
  readonly entry?: QueryEntry<A, E | ER>;
  readonly force?: boolean;
  readonly structuralSharing?: boolean;
}

export interface ShouldFetchOptions {
  readonly includeStale?: boolean;
}

interface LastFetchSnapshot {
  readonly key: QueryKey;
  readonly query: Effect.Effect<unknown, unknown, unknown>;
  readonly runtime: EffectRuntime;
  readonly staleTime: DurationInput | undefined;
  readonly gcTime: DurationInput | undefined;
  readonly keyHasher: KeyHasher | undefined;
  readonly structuralSharing: boolean | undefined;
}

export interface QueryEntry<A, E> {
  readonly key: QueryKey;
  readonly hash: string;
  staleTimeMs: number;
  gcTimeMs: number;
  subscribers: number;
  runId: number;
  inFlight: EffectRunHandle<A, E> | undefined;
  staleTimer: ReturnType<typeof setTimeout> | undefined;
  gcTimer: ReturnType<typeof setTimeout> | undefined;
  lastFetch: LastFetchSnapshot | undefined;
  latestRuntime: EffectRuntime | undefined;
  store: ExternalStore<QueryResult<A, E>>;
}

export interface QueryCacheEntryDiagnostics {
  readonly key: QueryKey;
  readonly hash: string;
  readonly status: QueryStatus;
  readonly subscribers: number;
  readonly inFlight: boolean;
  readonly hasData: boolean;
  readonly isStale: boolean;
  readonly updatedAt: number | null;
}

export interface QueryCacheDiagnosticsSnapshot {
  readonly size: number;
  readonly entries: readonly QueryCacheEntryDiagnostics[];
}

const structuralEqual = (a: unknown, b: unknown, depth = 0): boolean => {
  if (depth > 20) return false;
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (a instanceof Date) return b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof Map || a instanceof Set || a instanceof RegExp) return false;
  if (b instanceof Map || b instanceof Set || b instanceof RegExp) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  if (Array.isArray(aObj)) {
    if (!Array.isArray(bObj)) return false;
    if (aObj.length !== bObj.length) return false;
    for (let i = 0; i < aObj.length; i++) {
      if (!structuralEqual(aObj[i], bObj[i], depth + 1)) return false;
    }
    return true;
  }

  if (Array.isArray(bObj)) return false;

  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!structuralEqual(aObj[key], bObj[key], depth + 1)) return false;
  }
  return true;
};

const initialResult = <A, E>(): QueryResult<A, E> => ({
  status: "initial",
  data: undefined,
  cause: undefined,
  updatedAt: null,
  isStale: true,
  isFetching: false,
});

const loadingResult = <A, E>(previous: QueryResult<A, E>): QueryResult<A, E> => ({
  status: previous.data === undefined ? "loading" : "refreshing",
  data: previous.data,
  cause: undefined,
  updatedAt: previous.updatedAt,
  isStale: true,
  isFetching: true,
});

const successResult = <A, E>(data: A, updatedAt: number, isStale: boolean): QueryResult<A, E> => ({
  status: "success",
  data,
  cause: undefined,
  updatedAt,
  isStale,
  isFetching: false,
});

const failureResult = <A, E>(
  previous: QueryResult<A, E>,
  cause: Cause.Cause<E>,
): QueryResult<A, E> => ({
  status: "failure",
  data: previous.data,
  cause,
  updatedAt: previous.updatedAt,
  isStale: true,
  isFetching: false,
});

const runEffectWithSquashedCause = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromiseExit(effect).then((exit) => {
    if (Exit.isSuccess(exit)) {
      return exit.value;
    }
    throw Cause.squash(exit.cause);
  });

export class QueryCache {
  private readonly entries = new Map<string, QueryEntry<unknown, unknown>>();
  private readonly defaultStaleTimeMs: number;
  private readonly defaultGcTimeMs: number;
  readonly keyHasher: KeyHasher;
  private readonly now: () => number;

  constructor(options: QueryCacheOptions = {}) {
    this.defaultStaleTimeMs = toMillis(options.defaultStaleTime ?? 0);
    this.defaultGcTimeMs = toMillis(options.defaultGcTime ?? 5 * 60_000);
    this.keyHasher = options.keyHasher ?? hashQueryKey;
    this.now = options.now ?? Date.now;
  }

  ensureEntry<A, E>(options: EnsureEntryOptions<A>): QueryEntry<A, E> {
    const hash = (options.keyHasher ?? this.keyHasher)(options.key);
    const existing = this.entries.get(hash);
    if (existing) {
      this.applyDurations(existing, options.staleTime, options.gcTime);
      if (options.initialData !== undefined && existing.store.getSnapshot().data === undefined) {
        this.writeSuccess(existing as QueryEntry<A, E>, options.initialData);
      }
      return existing as QueryEntry<A, E>;
    }

    const staleTimeMs =
      options.staleTime !== undefined ? toMillis(options.staleTime) : this.defaultStaleTimeMs;
    const gcTimeMs = options.gcTime !== undefined ? toMillis(options.gcTime) : this.defaultGcTimeMs;
    const initial =
      options.initialData === undefined
        ? initialResult<A, E>()
        : successResult<A, E>(options.initialData, this.now(), staleTimeMs <= 0);
    const entry: QueryEntry<A, E> = {
      key: options.key,
      hash,
      staleTimeMs,
      gcTimeMs,
      subscribers: 0,
      runId: 0,
      inFlight: undefined,
      staleTimer: undefined,
      gcTimer: undefined,
      lastFetch: undefined,
      latestRuntime: undefined,
      store: createExternalStore<QueryResult<A, E>>(initial),
    };

    this.entries.set(hash, entry as QueryEntry<unknown, unknown>);

    if (options.initialData !== undefined) {
      this.scheduleStale(entry);
    }

    return entry;
  }

  getSnapshot<A, E>(entry: QueryEntry<A, E>): QueryResult<A, E> {
    return entry.store.getSnapshot();
  }

  subscribeEntry<A, E>(entry: QueryEntry<A, E>, listener: StoreListener): () => void {
    this.clearGc(entry);
    entry.subscribers += 1;
    const unsubscribeStore = entry.store.subscribe(listener);
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      unsubscribeStore();
      entry.subscribers = Math.max(0, entry.subscribers - 1);
      if (entry.subscribers === 0) {
        this.cancelInFlight(entry);
        this.scheduleGc(entry);
      }
    };
  }

  shouldFetch<A, E>(entry: QueryEntry<A, E>, options: ShouldFetchOptions = {}): boolean {
    if (entry.inFlight !== undefined) {
      return false;
    }
    const snapshot = entry.store.getSnapshot();
    if (options.includeStale === true && snapshot.isStale) {
      return true;
    }
    return snapshot.status === "initial" || snapshot.status === "failure";
  }

  isStale<A, E>(entry: QueryEntry<A, E>): boolean {
    return entry.store.getSnapshot().isStale;
  }

  fetchEffect<A, E, R, ER>(
    options: FetchQueryOptions<A, E, R, ER>,
  ): Effect.Effect<QueryResult<A, E | ER>, unknown, never> {
    return Effect.gen(
      function* (this: QueryCache) {
        const entry =
          options.entry ??
          this.ensureEntry<A, E | ER>({
            key: options.key,
            ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
            ...(options.gcTime !== undefined ? { gcTime: options.gcTime } : {}),
            ...(options.initialData !== undefined ? { initialData: options.initialData } : {}),
            ...(options.keyHasher !== undefined ? { keyHasher: options.keyHasher } : {}),
          });
        this.applyDurations(entry, options.staleTime, options.gcTime);
        entry.latestRuntime = options.runtime;
        entry.lastFetch = {
          key: options.key,
          query: options.query as Effect.Effect<unknown, unknown, unknown>,
          runtime: options.runtime,
          staleTime: options.staleTime,
          gcTime: options.gcTime,
          keyHasher: options.keyHasher,
          structuralSharing: options.structuralSharing,
        };

        if (entry.inFlight) {
          if (options.force === true) {
            entry.runId += 1;
            entry.inFlight.cancel();
            entry.inFlight = undefined;
          } else {
            yield* Effect.tryPromise({
              try: () => entry.inFlight!.promise,
              catch: (cause) => cause,
            });
            return entry.store.getSnapshot() as QueryResult<A, E | ER>;
          }
        }

        const snapshot = entry.store.getSnapshot();
        entry.store.setSnapshot(loadingResult(snapshot as QueryResult<A, E | ER>));

        const runId = entry.runId + 1;
        entry.runId = runId;
        const handle = runEffect(options.runtime, options.query) as EffectRunHandle<A, E | ER>;
        entry.inFlight = handle;

        const exit = yield* Effect.tryPromise({
          try: () => handle.promise,
          catch: (cause) => cause,
        });
        if (entry.runId !== runId) {
          return entry.store.getSnapshot() as QueryResult<A, E | ER>;
        }

        entry.inFlight = undefined;

        if (Exit.isSuccess(exit)) {
          this.writeSuccess(entry, exit.value, options.structuralSharing);
          return entry.store.getSnapshot() as QueryResult<A, E | ER>;
        }

        const cause = exit.cause as Cause.Cause<E | ER>;
        if (Cause.isInterruptedOnly(cause)) {
          const current = entry.store.getSnapshot();
          if (current.data === undefined) {
            entry.store.setSnapshot(initialResult());
          } else {
            entry.store.setSnapshot({
              ...current,
              status: "success",
              cause: undefined,
              isStale: true,
              isFetching: false,
            });
          }
          return entry.store.getSnapshot() as QueryResult<A, E | ER>;
        }

        const latest = entry.store.getSnapshot() as QueryResult<A, E | ER>;
        entry.store.setSnapshot(failureResult(latest, cause));
        return entry.store.getSnapshot() as QueryResult<A, E | ER>;
      }.bind(this),
    );
  }

  fetch<A, E, R, ER>(options: FetchQueryOptions<A, E, R, ER>): Promise<QueryResult<A, E | ER>> {
    return runEffectWithSquashedCause(this.fetchEffect(options));
  }

  prefetch<A, E, R, ER>(options: FetchQueryOptions<A, E, R, ER>): Promise<void> {
    return runEffectWithSquashedCause(this.fetchEffect(options).pipe(Effect.asVoid));
  }

  getQueryData<A>(key: QueryKey, keyHasher: KeyHasher = this.keyHasher): A | undefined {
    const hash = keyHasher(key);
    const entry = this.entries.get(hash);
    if (!entry) {
      return undefined;
    }
    return entry.store.getSnapshot().data as A | undefined;
  }

  setQueryData<A, E>(
    key: QueryKey,
    data: A,
    options: Omit<EnsureEntryOptions<A>, "key" | "initialData"> = {},
  ): void {
    const entry = this.ensureEntry<A, E>({
      key,
      ...(options.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
      ...(options.gcTime !== undefined ? { gcTime: options.gcTime } : {}),
      ...(options.keyHasher !== undefined ? { keyHasher: options.keyHasher } : {}),
    });
    this.writeSuccess(entry, data);
  }

  invalidate(
    target?: QueryKey | ((key: QueryKey) => boolean),
    keyHasher: KeyHasher = this.keyHasher,
  ): void {
    for (const entry of this.entries.values()) {
      const matches = (() => {
        if (target === undefined) {
          return true;
        }
        if (typeof target === "function") {
          return target(entry.key);
        }
        if (entry.hash === keyHasher(target)) {
          return true;
        }
        return this.isPrefixMatch(target, entry.key);
      })();
      if (!matches) {
        continue;
      }
      const snapshot = entry.store.getSnapshot();
      entry.store.setSnapshot({ ...snapshot, isStale: true });
      if (entry.subscribers > 0 && entry.lastFetch !== undefined) {
        const freshRuntime = entry.latestRuntime ?? entry.lastFetch.runtime;
        void this.fetch({
          entry: entry as QueryEntry<unknown, unknown>,
          key: entry.lastFetch.key,
          query: entry.lastFetch.query,
          runtime: freshRuntime,
          ...(entry.lastFetch.staleTime !== undefined
            ? { staleTime: entry.lastFetch.staleTime }
            : {}),
          ...(entry.lastFetch.gcTime !== undefined ? { gcTime: entry.lastFetch.gcTime } : {}),
          ...(entry.lastFetch.keyHasher !== undefined
            ? { keyHasher: entry.lastFetch.keyHasher }
            : {}),
          ...(entry.lastFetch.structuralSharing !== undefined
            ? { structuralSharing: entry.lastFetch.structuralSharing }
            : {}),
        });
      }
    }
  }

  cancelQueries(filters?: QueryFilters): void {
    for (const entry of this.entries.values()) {
      if (!this.matchesFilter(entry, filters)) continue;
      this.cancelInFlight(entry);
    }
  }

  resetQueries(filters?: QueryFilters): void {
    for (const entry of this.entries.values()) {
      if (!this.matchesFilter(entry, filters)) continue;
      this.cancelInFlight(entry);
      entry.store.setSnapshot(initialResult());
    }
  }

  removeQueries(filters?: QueryFilters): void {
    for (const entry of this.entries.values()) {
      if (!this.matchesFilter(entry, filters)) continue;
      this.disposeEntry(entry);
    }
  }

  removeQuery(key: QueryKey, keyHasher: KeyHasher = this.keyHasher): boolean {
    const hash = keyHasher(key);
    const entry = this.entries.get(hash);
    if (!entry) {
      return false;
    }
    this.disposeEntry(entry);
    return true;
  }

  hasQuery(key: QueryKey, keyHasher: KeyHasher = this.keyHasher): boolean {
    return this.entries.has(keyHasher(key));
  }

  size(): number {
    return this.entries.size;
  }

  diagnostics(): QueryCacheDiagnosticsSnapshot {
    const entries: QueryCacheEntryDiagnostics[] = [];
    for (const entry of this.entries.values()) {
      const snapshot = entry.store.getSnapshot();
      entries.push({
        key: entry.key,
        hash: entry.hash,
        status: snapshot.status,
        subscribers: entry.subscribers,
        inFlight: entry.inFlight !== undefined,
        hasData: snapshot.data !== undefined,
        isStale: snapshot.isStale,
        updatedAt: snapshot.updatedAt,
      });
    }
    return {
      size: this.entries.size,
      entries,
    };
  }

  clear(): void {
    for (const entry of this.entries.values()) {
      this.disposeEntry(entry);
    }
  }

  dehydrate(): DehydratedState {
    const queries: DehydratedQuery[] = [];
    for (const entry of this.entries.values()) {
      const snapshot = entry.store.getSnapshot();
      if (
        snapshot.status !== "success" ||
        snapshot.data === undefined ||
        snapshot.updatedAt === null
      ) {
        continue;
      }
      queries.push({
        key: entry.key,
        hash: entry.hash,
        data: snapshot.data,
        updatedAt: snapshot.updatedAt,
        staleTimeMs: entry.staleTimeMs,
        gcTimeMs: entry.gcTimeMs,
        isStale: snapshot.isStale,
      });
    }
    return {
      version: DEHYDRATED_STATE_VERSION,
      queries,
    };
  }

  hydrate(state: DehydratedState): void {
    if (state.version !== DEHYDRATED_STATE_VERSION) {
      throw new Error(`Unsupported dehydrated state version: ${String(state.version)}`);
    }
    for (const query of state.queries) {
      const entry = this.ensureEntry({
        key: query.key,
        staleTime: query.staleTimeMs,
        gcTime: query.gcTimeMs,
      });
      entry.staleTimeMs = query.staleTimeMs;
      entry.gcTimeMs = query.gcTimeMs;
      entry.store.setSnapshot({
        status: "success",
        data: query.data,
        cause: undefined,
        updatedAt: query.updatedAt,
        isStale: query.isStale,
        isFetching: false,
      });
      this.scheduleStaleFromHydration(entry);
    }
  }

  private writeSuccess<A, E>(entry: QueryEntry<A, E>, data: A, sharing?: boolean): void {
    const now = this.now();
    const stale = entry.staleTimeMs <= 0;

    if (sharing !== false) {
      const existing = entry.store.getSnapshot();
      if (existing.data !== undefined && structuralEqual(existing.data, data)) {
        entry.store.setSnapshot({
          ...existing,
          status: "success",
          cause: undefined,
          updatedAt: now,
          isStale: stale,
          isFetching: false,
        });
        this.scheduleStale(entry);
        return;
      }
    }

    entry.store.setSnapshot(successResult(data, now, stale));
    this.scheduleStale(entry);
  }

  private isPrefixMatch(prefix: QueryKey, key: QueryKey): boolean {
    if (prefix.length > key.length) return false;
    for (let i = 0; i < prefix.length; i++) {
      if (prefix[i] !== key[i]) return false;
    }
    return true;
  }

  private matchesFilter(entry: QueryEntry<unknown, unknown>, filters?: QueryFilters): boolean {
    if (!filters) return true;
    if (filters.key !== undefined) {
      const hash = this.keyHasher(filters.key);
      if (entry.hash !== hash) return false;
    }
    if (filters.predicate !== undefined) {
      if (!filters.predicate(entry.key)) return false;
    }
    if (filters.status !== undefined) {
      const snapshot = entry.store.getSnapshot();
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      if (!statuses.includes(snapshot.status)) return false;
    }
    if (filters.stale !== undefined) {
      const snapshot = entry.store.getSnapshot();
      if (filters.stale !== snapshot.isStale) return false;
    }
    return true;
  }

  private applyDurations<A, E>(
    entry: QueryEntry<A, E>,
    staleTime: DurationInput | undefined,
    gcTime: DurationInput | undefined,
  ): void {
    if (staleTime !== undefined) {
      entry.staleTimeMs = toMillis(staleTime);
    }
    if (gcTime !== undefined) {
      entry.gcTimeMs = toMillis(gcTime);
    }
  }

  private scheduleStale<A, E>(entry: QueryEntry<A, E>): void {
    this.clearStale(entry);
    if (!Number.isFinite(entry.staleTimeMs) || entry.staleTimeMs <= 0) {
      return;
    }
    entry.staleTimer = setTimeout(() => {
      const snapshot = entry.store.getSnapshot();
      entry.store.setSnapshot({
        ...snapshot,
        status: snapshot.data === undefined ? snapshot.status : "success",
        isStale: true,
      });
    }, entry.staleTimeMs);
  }

  private scheduleStaleFromHydration<A, E>(entry: QueryEntry<A, E>): void {
    this.clearStale(entry);
    const snapshot = entry.store.getSnapshot();
    if (
      !Number.isFinite(entry.staleTimeMs) ||
      entry.staleTimeMs <= 0 ||
      snapshot.updatedAt === null ||
      snapshot.isStale
    ) {
      if (entry.staleTimeMs <= 0 && snapshot.status === "success") {
        entry.store.setSnapshot({ ...snapshot, isStale: true });
      }
      return;
    }
    const age = this.now() - snapshot.updatedAt;
    const remaining = entry.staleTimeMs - age;
    if (remaining <= 0) {
      entry.store.setSnapshot({ ...snapshot, isStale: true });
      return;
    }
    entry.staleTimer = setTimeout(() => {
      const latest = entry.store.getSnapshot();
      entry.store.setSnapshot({ ...latest, isStale: true });
    }, remaining);
  }

  private scheduleGc<A, E>(entry: QueryEntry<A, E>): void {
    this.clearGc(entry);
    if (!Number.isFinite(entry.gcTimeMs) || entry.gcTimeMs <= 0) {
      this.disposeEntry(entry);
      return;
    }
    entry.gcTimer = setTimeout(() => {
      if (entry.subscribers > 0) {
        return;
      }
      this.disposeEntry(entry);
    }, entry.gcTimeMs);
  }

  private cancelInFlight<A, E>(entry: QueryEntry<A, E>): void {
    if (!entry.inFlight) {
      return;
    }
    entry.runId += 1;
    entry.inFlight.cancel();
    entry.inFlight = undefined;
    const snapshot = entry.store.getSnapshot();
    if (snapshot.status === "loading") {
      entry.store.setSnapshot(initialResult());
      return;
    }
    if (snapshot.status === "refreshing") {
      entry.store.setSnapshot({
        ...snapshot,
        status: "success",
        isStale: true,
        isFetching: false,
      });
    }
  }

  private clearStale<A, E>(entry: QueryEntry<A, E>): void {
    if (entry.staleTimer !== undefined) {
      clearTimeout(entry.staleTimer);
      entry.staleTimer = undefined;
    }
  }

  private clearGc<A, E>(entry: QueryEntry<A, E>): void {
    if (entry.gcTimer !== undefined) {
      clearTimeout(entry.gcTimer);
      entry.gcTimer = undefined;
    }
  }

  private disposeEntry<A, E>(entry: QueryEntry<A, E>): void {
    this.clearStale(entry);
    this.clearGc(entry);
    if (entry.inFlight) {
      entry.inFlight.cancel();
      entry.inFlight = undefined;
    }
    entry.lastFetch = undefined;
    this.entries.delete(entry.hash);
  }
}
