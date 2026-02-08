import { act, render, waitFor } from "@testing-library/react";
import { Chunk, Effect, Fiber, Stream } from "effect";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createAppRuntime } from "../../kernel";
import { defineRoute } from "../../navigation";
import { EffectProvider } from "../../react";
import {
  createStore,
  createStoreFromEffect,
  createStoreTag,
  derive,
  makeStoreLayer,
  makeStoreLayerFromEffect,
  modify,
  select,
  selectChanges,
  set,
  update,
  useStore,
  useStoreSelector,
} from "../../state";

interface CounterState {
  readonly count: number;
  readonly label: string;
}

interface ViewState {
  readonly count: number;
  readonly other: number;
}

describe("state module", () => {
  it("supports update, modify, select, and derive", async () => {
    const store = Effect.runSync(
      createStore<CounterState>({
        count: 0,
        label: "idle",
      }),
    );

    Effect.runSync(
      update(store, (state) => ({
        ...state,
        count: state.count + 1,
      })),
    );

    const previousCount = Effect.runSync(
      modify(store, (state) => [
        state.count,
        {
          ...state,
          label: `count:${String(state.count)}`,
        },
      ]),
    );

    const selectedCount = Effect.runSync(select(store, (state) => state.count));
    const selectedLabel = Effect.runSync(select(store, (state) => state.label));
    const doubled = derive(store, (state) => state.count * 2);

    const selectedChanges = await Effect.runPromise(
      Stream.runCollect(selectChanges(store, (state) => state.count).pipe(Stream.take(1))),
    );

    Effect.runSync(
      update(store, (state) => ({
        ...state,
        label: "still-one",
      })),
    );

    Effect.runSync(
      update(store, (state) => ({
        ...state,
        count: state.count + 1,
      })),
    );

    expect(previousCount).toBe(1);
    expect(selectedCount).toBe(1);
    expect(selectedLabel).toBe("count:1");
    expect(Effect.runSync(doubled.get)).toBe(4);
    expect(Chunk.toReadonlyArray(selectedChanges)).toEqual([1]);
  });

  it("supports createStoreFromEffect, set, and layer-based store access", async () => {
    const store = await Effect.runPromise(
      createStoreFromEffect(
        Effect.succeed<CounterState>({
          count: 2,
          label: "from-effect",
        }),
      ),
    );

    await Effect.runPromise(
      set(store, {
        count: 3,
        label: "set",
      }),
    );

    const count = Effect.runSync(select(store, (state) => state.count));
    expect(count).toBe(3);

    const CounterTag = createStoreTag<CounterState>("StateModule/CounterTag");

    const fromLayer = await Effect.runPromise(
      Effect.flatMap(CounterTag, (service) => select(service, (state) => state.label)).pipe(
        Effect.provide(
          makeStoreLayer(CounterTag, {
            count: 10,
            label: "layer",
          }),
        ),
      ),
    );

    const fromLayerEffect = await Effect.runPromise(
      Effect.flatMap(CounterTag, (service) => select(service, (state) => state.count)).pipe(
        Effect.provide(
          makeStoreLayerFromEffect(
            CounterTag,
            Effect.succeed<CounterState>({
              count: 11,
              label: "layer-effect",
            }),
          ),
        ),
      ),
    );

    expect(fromLayer).toBe("layer");
    expect(fromLayerEffect).toBe(11);
  });

  it("supports distinct=false and default equality behavior in selectChanges", async () => {
    const store = Effect.runSync(
      createStore<ViewState>({
        count: 0,
        other: 0,
      }),
    );

    const nonDistinctChanges = await Effect.runPromise(
      Effect.gen(function* () {
        const collector = yield* Effect.fork(
          Stream.runCollect(
            selectChanges(store, (state) => state.other, { distinct: false }).pipe(Stream.take(3)),
          ),
        );

        yield* Effect.yieldNow();
        yield* update(store, (state) => ({
          ...state,
          other: state.other,
        }));
        yield* update(store, (state) => ({
          ...state,
          other: state.other,
        }));

        return yield* Fiber.join(collector);
      }),
    );

    const distinctChanges = await Effect.runPromise(
      Effect.gen(function* () {
        const collector = yield* Effect.fork(
          Stream.runCollect(selectChanges(store, (state) => state.count % 2).pipe(Stream.take(2))),
        );

        yield* Effect.yieldNow();
        yield* update(store, (state) => ({
          ...state,
          count: state.count + 2,
        }));
        yield* update(store, (state) => ({
          ...state,
          count: state.count + 1,
        }));

        return yield* Fiber.join(collector);
      }),
    );

    expect(Chunk.toReadonlyArray(nonDistinctChanges)).toEqual([0, 0, 0]);
    expect(Chunk.toReadonlyArray(distinctChanges)).toEqual([0, 1]);
  });

  it("useStoreSelector only updates when the selected slice changes", async () => {
    const store = Effect.runSync(
      createStore<ViewState>({
        count: 0,
        other: 0,
      }),
    );
    const home = defineRoute({
      id: "home",
      path: "/",
    });
    const runtime = createAppRuntime({
      routes: [home] as const,
    });
    const Provider = EffectProvider as unknown as (props: {
      readonly runtime: typeof runtime;
      readonly children?: ReactNode;
    }) => ReactNode;

    const SelectedProbe = () => {
      const count = useStoreSelector(store, (state) => state.count);
      return createElement("output", { "data-testid": "selected" }, String(count));
    };

    const FullProbe = () => {
      const state = useStore(store);
      return createElement(
        "output",
        { "data-testid": "full" },
        `${String(state.count)}:${String(state.other)}`,
      );
    };

    const rendered = render(
      createElement(
        Provider,
        { runtime },
        createElement("div", undefined, createElement(SelectedProbe), createElement(FullProbe)),
      ),
    );

    try {
      expect(rendered.getByTestId("selected").textContent).toBe("0");
      expect(rendered.getByTestId("full").textContent).toBe("0:0");

      act(() => {
        Effect.runSync(
          update(store, (state) => ({
            ...state,
            other: state.other + 1,
          })),
        );
      });

      await waitFor(() => {
        expect(rendered.getByTestId("full").textContent).toBe("0:1");
      });

      expect(rendered.getByTestId("selected").textContent).toBe("0");

      act(() => {
        Effect.runSync(
          update(store, (state) => ({
            ...state,
            count: state.count + 1,
          })),
        );
      });

      await waitFor(() => {
        expect(rendered.getByTestId("selected").textContent).toBe("1");
        expect(rendered.getByTestId("full").textContent).toBe("1:1");
      });
    } finally {
      rendered.unmount();
      await runtime.dispose();
    }
  });
});
