import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createExternalStore } from "../internal/externalStore";
import type { InferUrlCodec, UrlCodec } from "./codec";
import type { InferUrlState, UrlStateSchema } from "./search";
import { parseSearch, serializeSearch } from "./search";

const URL_STATE_EVENT = "effect-react:url-state";

type HistoryMode = "push" | "replace";

interface BrowserLike {
  readonly location: {
    readonly pathname: string;
    readonly search: string;
    readonly hash: string;
  };
  readonly history: {
    readonly pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
    readonly replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  };
  readonly dispatchEvent: (event: Event) => boolean;
  readonly addEventListener: (type: string, listener: EventListener) => void;
  readonly removeEventListener: (type: string, listener: EventListener) => void;
}

export interface UseUrlStateOptions {
  readonly historyMode?: HistoryMode;
  readonly debounceMs?: number;
  readonly browser?: BrowserLike;
}

export interface UseUrlStatesOptions extends UseUrlStateOptions {}

type Updater<T> = T | ((previous: T) => T);

const resolveBrowser = (override?: BrowserLike): BrowserLike | undefined => {
  if (override !== undefined) {
    return override;
  }
  if (typeof window === "undefined") {
    return undefined;
  }
  return window as unknown as BrowserLike;
};

const normalizeSearch = (search: string): string => {
  if (search.length === 0 || search === "?") {
    return "";
  }
  return search.startsWith("?") ? search : `?${search}`;
};

const createSearchStore = (browser: BrowserLike | undefined) => {
  if (browser === undefined) {
    return createExternalStore("");
  }

  const store = createExternalStore(normalizeSearch(browser.location.search));
  const onLocationChange = () => {
    store.setSnapshot(normalizeSearch(browser.location.search));
  };

  const subscribe = (listener: () => void) => {
    const stop = store.subscribe(listener);
    browser.addEventListener("popstate", onLocationChange as EventListener);
    browser.addEventListener(URL_STATE_EVENT, onLocationChange as EventListener);

    return () => {
      stop();
      browser.removeEventListener("popstate", onLocationChange as EventListener);
      browser.removeEventListener(URL_STATE_EVENT, onLocationChange as EventListener);
    };
  };

  return {
    ...store,
    subscribe,
  };
};

const applySearch = (browser: BrowserLike, nextSearch: string, mode: HistoryMode): void => {
  const normalized = normalizeSearch(nextSearch);
  const href = `${browser.location.pathname}${normalized}${browser.location.hash}`;
  if (mode === "replace") {
    browser.history.replaceState(null, "", href);
  } else {
    browser.history.pushState(null, "", href);
  }
  browser.dispatchEvent(new Event(URL_STATE_EVENT));
};

const resolveNextValue = <T>(current: T, update: Updater<T>): T =>
  typeof update === "function" ? (update as (previous: T) => T)(current) : update;

const parseCodec = <TCodec extends UrlCodec<unknown>>(
  codec: TCodec,
  values: readonly string[],
): InferUrlCodec<TCodec> | undefined => codec.parse(values) as InferUrlCodec<TCodec> | undefined;

export const useUrlState = <TCodec extends UrlCodec<unknown>>(
  key: string,
  codec: TCodec,
  options: UseUrlStateOptions = {},
): readonly [
  InferUrlCodec<TCodec> | undefined,
  (update: Updater<InferUrlCodec<TCodec> | undefined>) => void,
] => {
  const browser = resolveBrowser(options.browser);
  const storeRef = useRef(createSearchStore(browser));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const searchText = useSyncExternalStore(
    storeRef.current.subscribe,
    storeRef.current.getSnapshot,
    storeRef.current.getSnapshot,
  );

  const value = useMemo(() => {
    const search = new URLSearchParams(
      searchText.startsWith("?") ? searchText.slice(1) : searchText,
    );
    return parseCodec(codec, search.getAll(key));
  }, [codec, key, searchText]);

  const setValue = useCallback(
    (update: Updater<InferUrlCodec<TCodec> | undefined>) => {
      if (browser === undefined) {
        return;
      }

      const currentSearch = normalizeSearch(browser.location.search);
      const search = new URLSearchParams(
        currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch,
      );
      const currentValue = parseCodec(codec, search.getAll(key));
      const nextValue = resolveNextValue(currentValue, update);
      search.delete(key);
      if (nextValue !== undefined) {
        const encoded = codec.serialize(nextValue);
        for (const item of encoded) {
          search.append(key, item);
        }
      }
      const nextSearch = search.toString();

      const mode = options.historyMode ?? "push";
      const delay = options.debounceMs ?? 0;
      if (delay > 0) {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          applySearch(browser, nextSearch, mode);
        }, delay);
        return;
      }

      applySearch(browser, nextSearch, mode);
    },
    [browser, codec, key, options.debounceMs, options.historyMode],
  );

  return [value, setValue] as const;
};

export const useUrlStates = <TSchema extends UrlStateSchema>(
  schema: TSchema,
  options: UseUrlStatesOptions = {},
): readonly [InferUrlState<TSchema>, (update: Updater<InferUrlState<TSchema>>) => void] => {
  const browser = resolveBrowser(options.browser);
  const storeRef = useRef(createSearchStore(browser));
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const searchText = useSyncExternalStore(
    storeRef.current.subscribe,
    storeRef.current.getSnapshot,
    storeRef.current.getSnapshot,
  );

  const value = useMemo(() => parseSearch(searchText, schema), [schema, searchText]);

  const setValue = useCallback(
    (update: Updater<InferUrlState<TSchema>>) => {
      if (browser === undefined) {
        return;
      }

      const currentSearch = normalizeSearch(browser.location.search);
      const parsed = parseSearch(currentSearch, schema);
      const next = resolveNextValue(parsed, update);
      const encoded = serializeSearch(next, schema);

      const mode = options.historyMode ?? "push";
      const delay = options.debounceMs ?? 0;
      if (delay > 0) {
        if (timeoutRef.current !== null) {
          clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
          applySearch(browser, encoded, mode);
        }, delay);
        return;
      }

      applySearch(browser, encoded, mode);
    },
    [browser, options.debounceMs, options.historyMode, schema],
  );

  return [value, setValue] as const;
};
