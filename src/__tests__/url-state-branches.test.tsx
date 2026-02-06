import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { defineSearchSchema, numberCodec, useUrlState, useUrlStates } from "../url-state";

interface MockBrowser {
  readonly location: {
    pathname: string;
    search: string;
    hash: string;
  };
  readonly history: {
    readonly pushState: (data: unknown, unused: string, url?: string | URL | null) => void;
    readonly replaceState: (data: unknown, unused: string, url?: string | URL | null) => void;
  };
  readonly dispatchEvent: (event: Event) => boolean;
  readonly addEventListener: (type: string, listener: EventListener) => void;
  readonly removeEventListener: (type: string, listener: EventListener) => void;
}

const createMockBrowser = (pathname: string, search: string): MockBrowser => {
  const location = {
    pathname,
    search,
    hash: "",
  };
  const listeners = new Map<string, Set<EventListener>>();

  const applyUrl = (url?: string | URL | null): void => {
    if (url === undefined || url === null) {
      return;
    }
    const parsed = new URL(String(url), "https://example.test");
    location.pathname = parsed.pathname;
    location.search = parsed.search;
    location.hash = parsed.hash;
  };

  return {
    location,
    history: {
      pushState: vi.fn((_data: unknown, _unused: string, url?: string | URL | null) => {
        applyUrl(url);
      }),
      replaceState: vi.fn((_data: unknown, _unused: string, url?: string | URL | null) => {
        applyUrl(url);
      }),
    },
    dispatchEvent: (event) => {
      const activeListeners = listeners.get(event.type);
      if (activeListeners !== undefined) {
        for (const listener of activeListeners) {
          listener(event);
        }
      }
      return true;
    },
    addEventListener: (type, listener) => {
      const existing = listeners.get(type) ?? new Set<EventListener>();
      existing.add(listener);
      listeners.set(type, existing);
    },
    removeEventListener: (type, listener) => {
      const existing = listeners.get(type);
      if (existing !== undefined) {
        existing.delete(listener);
      }
    },
  };
};

describe("url-state branches", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses browser override, replace mode, and popstate updates", async () => {
    const browser = createMockBrowser("/items", "?page=1");
    let setPage:
      | ((
          update: number | ((previous: number | undefined) => number | undefined) | undefined,
        ) => void)
      | undefined;

    const Probe = () => {
      const [page, setValue] = useUrlState("page", numberCodec, {
        browser,
        historyMode: "replace",
      });
      setPage = setValue;
      return <div data-testid="page">{Number(page ?? 0)}</div>;
    };

    const view = render(<Probe />);
    expect(screen.getByTestId("page").textContent).toBe("1");

    await act(async () => {
      setPage?.(3);
    });

    expect(browser.location.search).toBe("?page=3");
    expect(browser.history.replaceState).toHaveBeenCalledTimes(1);
    expect(browser.history.pushState).toHaveBeenCalledTimes(0);

    await act(async () => {
      browser.location.search = "?page=9";
      browser.dispatchEvent(new Event("popstate"));
    });

    expect(screen.getByTestId("page").textContent).toBe("9");
    view.unmount();
  });

  it("clears queued writes for debounced single-key state", async () => {
    vi.useFakeTimers();
    const browser = createMockBrowser("/items", "?page=1");

    let setPage:
      | ((
          update: number | ((previous: number | undefined) => number | undefined) | undefined,
        ) => void)
      | undefined;

    const Probe = () => {
      const [page, setValue] = useUrlState("page", numberCodec, {
        browser,
        historyMode: "push",
        debounceMs: 25,
      });
      setPage = setValue;
      return <div data-testid="page">{Number(page ?? 0)}</div>;
    };

    render(<Probe />);
    expect(screen.getByTestId("page").textContent).toBe("1");

    await act(async () => {
      setPage?.(2);
      setPage?.(4);
      vi.advanceTimersByTime(24);
    });

    expect(browser.history.pushState).toHaveBeenCalledTimes(0);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(browser.history.pushState).toHaveBeenCalledTimes(1);
    expect(browser.location.search).toBe("?page=4");
    vi.useRealTimers();
  });

  it("debounces schema writes and removes keys when values are undefined", async () => {
    vi.useFakeTimers();
    const browser = createMockBrowser("/products", "?page=7&tab=1");
    const schema = defineSearchSchema({
      page: numberCodec,
      tab: numberCodec,
    });

    let setValue: ((update: { readonly page?: number; readonly tab?: number }) => void) | undefined;

    const Probe = () => {
      const [value, setValues] = useUrlStates(schema, {
        browser,
        historyMode: "push",
        debounceMs: 20,
      });
      setValue = setValues;
      return (
        <div>
          <div data-testid="page">{Number(value["page"] ?? 0)}</div>
          <div data-testid="tab">{Number(value["tab"] ?? 0)}</div>
        </div>
      );
    };

    render(<Probe />);
    expect(screen.getByTestId("page").textContent).toBe("7");
    expect(screen.getByTestId("tab").textContent).toBe("1");

    await act(async () => {
      setValue?.({ tab: 5 });
      vi.advanceTimersByTime(20);
    });

    expect(browser.location.search).toBe("?tab=5");
    vi.useRealTimers();
  });
});
