import { act, renderHook, waitFor } from "@testing-library/react";
import { Effect, Schema } from "effect";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Data } from "../../data";
import { createAppRuntime } from "../../kernel";
import { defineRoute } from "../../navigation";
import { EffectProvider } from "../../react";
import {
  defineQuery,
  invalidateQuery,
  prefetchQuery,
  useInfiniteQuery,
  useQuery,
} from "../../query";

const createRuntimeWrapper = (runtime: ReturnType<typeof createAppRuntime>) => {
  const Wrapper = ({ children }: { readonly children?: ReactNode }) =>
    createElement(EffectProvider, { runtime }, children);
  return Wrapper;
};

describe("query module", () => {
  it("supports query hook smoke behavior", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [homeRoute] as const,
      data: {
        capacity: 64,
        timeToLive: "1 minute",
      },
    });

    const getDouble = defineQuery({
      name: "query.double",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      run: ({ value }) => Effect.succeed(value * 2),
    });

    const input = { value: 21 } as const;
    await runtime.runPromise(prefetchQuery(getDouble, input));

    const { result, unmount } = renderHook(
      () => useQuery(getDouble, input),
      {
        wrapper: createRuntimeWrapper(runtime),
      },
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("success");
      expect(result.current.data).toBe(42);
    });

    unmount();
  });

  it("supports effect-based prefetch/invalidate helpers", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [homeRoute] as const,
    });

    const getDouble = defineQuery({
      name: "query.double.helpers",
      input: Schema.Struct({ value: Schema.Number }),
      output: Schema.Number,
      run: ({ value }) => Effect.succeed(value * 2),
    });

    const input = { value: 21 } as const;

    await runtime.runPromise(prefetchQuery(getDouble, input));

    const snapshotAfterPrefetch = await runtime.runPromise(
      Effect.flatMap(Data, (service) => service.getSnapshot(getDouble, input)),
    );
    expect(snapshotAfterPrefetch.phase).toBe("success");
    expect(snapshotAfterPrefetch.data).toBe(42);

    await runtime.runPromise(invalidateQuery(getDouble, input));

    const snapshotAfterInvalidate = await runtime.runPromise(
      Effect.flatMap(Data, (service) => service.getSnapshot(getDouble, input)),
    );

    expect(snapshotAfterInvalidate.phase).toBe("initial");

    await runtime.dispose();
  });

  it("supports infinite query baseline pagination", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [homeRoute] as const,
    });

    const listNumbers = defineQuery({
      name: "query.numbers.page",
      input: Schema.Struct({ cursor: Schema.Number }),
      output: Schema.Struct({
        items: Schema.Array(Schema.Number),
        nextCursor: Schema.Number,
      }),
      run: ({ cursor }) =>
        Effect.succeed({
          items: [cursor, cursor + 1],
          nextCursor: cursor >= 2 ? -1 : cursor + 2,
        }),
    });

    await runtime.runPromise(prefetchQuery(listNumbers, { cursor: 0 }));

    const { result, unmount } = renderHook(
      () =>
        useInfiniteQuery(listNumbers, {
          initialPageParam: 0,
          getInput: (cursor) => ({ cursor }),
          getNextPageParam: (lastPage) =>
            lastPage.nextCursor >= 0 ? lastPage.nextCursor : undefined,
        }),
      {
        wrapper: createRuntimeWrapper(runtime),
      },
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("success");
      expect(result.current.pages.length).toBe(1);
    });

    expect(result.current.pages[0]).toEqual({
      items: [0, 1],
      nextCursor: 2,
    });
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      const nextPage = await result.current.fetchNextPage();
      expect(nextPage).toEqual({
        items: [2, 3],
        nextCursor: -1,
      });
    });

    await waitFor(() => {
      expect(result.current.pages.length).toBe(2);
      expect(result.current.hasNextPage).toBe(false);
    });

    unmount();
  });

  it("handles initial infinite query failures and refetches from the initial page param", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [homeRoute] as const,
    });

    let shouldFail = true;

    const listNumbers = defineQuery({
      name: "query.numbers.initial-failure",
      input: Schema.Struct({ cursor: Schema.Number }),
      output: Schema.Struct({
        items: Schema.Array(Schema.Number),
        nextCursor: Schema.Number,
      }),
      run: ({ cursor }) =>
        shouldFail
          ? Effect.fail("initial-failure" as const)
          : Effect.succeed({
              items: [cursor],
              nextCursor: -1,
            }),
    });

    const failedPrefetch = await runtime.runPromise(
      Effect.exit(prefetchQuery(listNumbers, { cursor: 0 })),
    );
    expect(failedPrefetch._tag).toBe("Failure");

    const { result, unmount } = renderHook(
      () =>
        useInfiniteQuery(listNumbers, {
          initialPageParam: 0,
          getInput: (cursor) => ({ cursor }),
          getNextPageParam: (lastPage) =>
            lastPage.nextCursor >= 0 ? lastPage.nextCursor : undefined,
        }),
      {
        wrapper: createRuntimeWrapper(runtime),
      },
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("failure");
      expect(result.current.error).toBe("initial-failure");
    });

    expect(result.current.pages).toEqual([]);
    expect(result.current.pageParams).toEqual([]);
    expect(result.current.hasNextPage).toBe(false);

    await act(async () => {
      const page = await result.current.fetchNextPage();
      expect(page).toBeUndefined();
    });

    shouldFail = false;

    await act(async () => {
      const pages = await result.current.refetch();
      expect(pages).toEqual([
        {
          items: [0],
          nextCursor: -1,
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("success");
      expect(result.current.pages).toEqual([
        {
          items: [0],
          nextCursor: -1,
        },
      ]);
      expect(result.current.pageParams).toEqual([0]);
      expect(result.current.error).toBeUndefined();
    });

    unmount();
  });

  it("surfaces next-page/refetch failures and resets local pages after invalidate", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const runtime = createAppRuntime({
      routes: [homeRoute] as const,
    });

    let failNextPage = true;
    let failRefetch = false;

    const listNumbers = defineQuery({
      name: "query.numbers.failure-branches",
      input: Schema.Struct({ cursor: Schema.Number }),
      output: Schema.Struct({
        items: Schema.Array(Schema.Number),
        nextCursor: Schema.Number,
      }),
      run: ({ cursor }) => {
        if (cursor === 2 && failNextPage) {
          return Effect.fail("next-page-failure" as const);
        }
        if (cursor === 0 && failRefetch) {
          return Effect.fail("refetch-failure" as const);
        }
        return Effect.succeed({
          items: [cursor, cursor + 1],
          nextCursor: cursor === 0 ? 2 : -1,
        });
      },
    });

    await runtime.runPromise(prefetchQuery(listNumbers, { cursor: 0 }));

    const { result, unmount } = renderHook(
      () =>
        useInfiniteQuery(listNumbers, {
          initialPageParam: 0,
          getInput: (cursor) => ({ cursor }),
          getNextPageParam: (lastPage) =>
            lastPage.nextCursor >= 0 ? lastPage.nextCursor : undefined,
        }),
      {
        wrapper: createRuntimeWrapper(runtime),
      },
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("success");
      expect(result.current.pages).toEqual([
        {
          items: [0, 1],
          nextCursor: 2,
        },
      ]);
    });

    expect(result.current.hasNextPage).toBe(true);

    await act(async () => {
      await expect(result.current.fetchNextPage()).rejects.toThrow("next-page-failure");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("failure");
      expect(result.current.error).toBeDefined();
      if (result.current.error instanceof Error) {
        expect(result.current.error.message).toContain("next-page-failure");
      } else {
        expect(result.current.error).toBe("next-page-failure");
      }
      expect(result.current.isFetchingNextPage).toBe(false);
    });

    failRefetch = true;

    await act(async () => {
      await expect(result.current.refetch()).rejects.toThrow("refetch-failure");
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("failure");
      expect(result.current.error).toBeDefined();
      if (result.current.error instanceof Error) {
        expect(result.current.error.message).toContain("refetch-failure");
      } else {
        expect(result.current.error).toBe("refetch-failure");
      }
    });

    failRefetch = false;

    await act(async () => {
      const pages = await result.current.refetch();
      expect(pages).toEqual([
        {
          items: [0, 1],
          nextCursor: 2,
        },
      ]);
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("success");
      expect(result.current.error).toBeUndefined();
    });

    await act(async () => {
      const invalidate = result.current.invalidate();
      unmount();
      await invalidate;
    });
  });
});
