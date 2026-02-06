import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { Effect, Layer, ManagedRuntime } from "effect";
import { EffectProvider } from "../provider/EffectProvider";
import { QueryCache } from "../query/QueryCache";
import { useInfiniteQuery } from "../query/useInfiniteQuery";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useInfiniteQuery", () => {
  it("fetches initial page and supports fetchNextPage", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    const pages: Record<number, string[]> = {
      0: ["a", "b"],
      1: ["c", "d"],
      2: ["e"],
    };

    let fetchNextRef: (() => Promise<void>) | null = null;

    const Probe = () => {
      const result = useInfiniteQuery<string[], never, never, number>({
        key: ["infinite"],
        query: ({ pageParam }) => Effect.succeed(pages[pageParam] ?? []),
        getNextPageParam: (_lastPage, allPages) => {
          const next = allPages.length;
          return next < 3 ? next : undefined;
        },
        initialPageParam: 0,
      });
      fetchNextRef = result.fetchNextPage;
      return (
        <div>
          <div data-testid="status">{result.status}</div>
          <div data-testid="pages">{result.data?.pages.length ?? 0}</div>
          <div data-testid="items">{result.data?.pages.flat().join(",") ?? ""}</div>
          <div data-testid="hasNext">{String(result.hasNextPage)}</div>
          <div data-testid="fetching">{String(result.isFetching)}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("success");
    });

    expect(screen.getByTestId("pages").textContent).toBe("1");
    expect(screen.getByTestId("items").textContent).toBe("a,b");
    expect(screen.getByTestId("hasNext").textContent).toBe("true");

    await act(async () => {
      await fetchNextRef!();
    });

    expect(screen.getByTestId("pages").textContent).toBe("2");
    expect(screen.getByTestId("items").textContent).toBe("a,b,c,d");
    expect(screen.getByTestId("hasNext").textContent).toBe("true");

    await act(async () => {
      await fetchNextRef!();
    });

    expect(screen.getByTestId("pages").textContent).toBe("3");
    expect(screen.getByTestId("items").textContent).toBe("a,b,c,d,e");
    expect(screen.getByTestId("hasNext").textContent).toBe("false");

    await runtime.dispose();
  });

  it("reports hasNextPage false when no more pages", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    const Probe = () => {
      const result = useInfiniteQuery<string, never, never, number>({
        key: ["single-page"],
        query: ({ pageParam }) => Effect.succeed(`page-${pageParam}`),
        getNextPageParam: () => undefined,
        initialPageParam: 0,
      });
      return (
        <div>
          <div data-testid="hasNext">{String(result.hasNextPage)}</div>
          <div data-testid="status">{result.status}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("success");
    });
    expect(screen.getByTestId("hasNext").textContent).toBe("false");

    await runtime.dispose();
  });

  it("supports fetchPreviousPage and hasPreviousPage", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();

    const pages: Record<number, string[]> = {
      0: ["a", "b"],
      1: ["c", "d"],
      2: ["e", "f"],
    };

    let fetchPrevRef: (() => Promise<void>) | null = null;

    const Probe = () => {
      const result = useInfiniteQuery<string[], never, never, number>({
        key: ["bidirectional"],
        query: ({ pageParam }) => Effect.succeed(pages[pageParam] ?? []),
        getNextPageParam: (_lastPage, allPages) => {
          const next = allPages.length;
          return next < 3 ? next : undefined;
        },
        getPreviousPageParam: (firstPage, _allPages) => {
          if (firstPage[0] === "a") return undefined;
          return 0;
        },
        initialPageParam: 1,
        staleTime: 5000,
        gcTime: 10000,
      });
      fetchPrevRef = result.fetchPreviousPage;
      return (
        <div>
          <div data-testid="status">{result.status}</div>
          <div data-testid="pages">{result.data?.pages.length ?? 0}</div>
          <div data-testid="items">{result.data?.pages.flat().join(",") ?? ""}</div>
          <div data-testid="hasPrev">{String(result.hasPreviousPage)}</div>
          <div data-testid="hasNext">{String(result.hasNextPage)}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("success");
    });

    expect(screen.getByTestId("items").textContent).toBe("c,d");
    expect(screen.getByTestId("hasPrev").textContent).toBe("true");
    expect(screen.getByTestId("hasNext").textContent).toBe("true");

    await act(async () => {
      await fetchPrevRef!();
    });

    expect(screen.getByTestId("pages").textContent).toBe("2");
    expect(screen.getByTestId("items").textContent).toBe("a,b,c,d");
    expect(screen.getByTestId("hasPrev").textContent).toBe("false");

    await runtime.dispose();
  });

  it("supports refetch and invalidate", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let callCount = 0;

    let refetchRef: (() => Promise<void>) | null = null;
    let invalidateRef: (() => void) | null = null;

    const Probe = () => {
      const result = useInfiniteQuery<string, never, never, number>({
        key: ["refetch-inf"],
        query: () => {
          callCount += 1;
          return Effect.succeed(`v${callCount}`);
        },
        getNextPageParam: () => undefined,
        initialPageParam: 0,
      });
      refetchRef = result.refetch;
      invalidateRef = result.invalidate;
      return (
        <div>
          <div data-testid="status">{result.status}</div>
          <div data-testid="items">{result.data?.pages.join(",") ?? ""}</div>
        </div>
      );
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("status").textContent).toBe("success");
    });
    expect(screen.getByTestId("items").textContent).toBe("v1");

    await act(async () => {
      await refetchRef!();
    });

    await waitFor(() => {
      expect(screen.getByTestId("items").textContent).toBe("v2");
    });

    invalidateRef!();

    await runtime.dispose();
  });

  it("does not fetch when disabled", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const cache = new QueryCache();
    let calls = 0;

    const Probe = () => {
      const result = useInfiniteQuery<string, never, never, number>({
        key: ["disabled-inf"],
        enabled: false,
        query: () => {
          calls += 1;
          return Effect.succeed("x");
        },
        getNextPageParam: () => undefined,
        initialPageParam: 0,
      });
      return <div data-testid="status">{result.status}</div>;
    };

    render(
      <EffectProvider runtime={runtime} cache={cache}>
        <Probe />
      </EffectProvider>,
    );

    expect(screen.getByTestId("status").textContent).toBe("initial");
    expect(calls).toBe(0);

    await runtime.dispose();
  });
});
