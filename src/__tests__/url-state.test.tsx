import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  defineSearchSchema,
  numberCodec,
  serializeSearch,
  useUrlState,
  useUrlStates,
} from "../url-state";

const schema = defineSearchSchema({
  page: numberCodec,
  tab: numberCodec,
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("url-state", () => {
  it("syncs single key state to URL", async () => {
    window.history.replaceState(null, "", "/products?page=1");

    let setPage:
      | ((
          update: number | ((previous: number | undefined) => number | undefined) | undefined,
        ) => void)
      | undefined;

    const Probe = () => {
      const [page, setValue] = useUrlState("page", numberCodec, {
        historyMode: "replace",
      });
      setPage = setValue;
      return <div data-testid="page">{Number(page ?? 0)}</div>;
    };

    render(<Probe />);
    expect(screen.getByTestId("page").textContent).toBe("1");

    await act(async () => {
      setPage?.((previous) => (previous ?? 0) + 2);
    });

    expect(screen.getByTestId("page").textContent).toBe("3");
    expect(window.location.search).toBe("?page=3");
  });

  it("syncs schema state to URL", async () => {
    window.history.replaceState(null, "", "/products?page=2");

    let setValues:
      | ((
          update:
            | {
                readonly page?: number;
                readonly tab?: number;
              }
            | ((previous: { readonly page?: number; readonly tab?: number }) => {
                readonly page?: number;
                readonly tab?: number;
              }),
        ) => void)
      | undefined;

    const Probe = () => {
      const [value, setValue] = useUrlStates(schema, {
        historyMode: "replace",
      });
      setValues = setValue;
      return (
        <div>
          <div data-testid="page">{Number(value["page"] ?? 0)}</div>
          <div data-testid="tab">{Number(value["tab"] ?? 0)}</div>
        </div>
      );
    };

    render(<Probe />);
    expect(screen.getByTestId("page").textContent).toBe("2");

    await act(async () => {
      setValues?.((previous) => ({
        ...previous,
        tab: 8,
      }));
    });

    expect(screen.getByTestId("tab").textContent).toBe("8");
    expect(window.location.search).toBe("?page=2&tab=8");
  });

  it("serializes schema with stable keys", () => {
    const search = serializeSearch(
      {
        page: 5,
        tab: 3,
      },
      schema,
    );

    expect(search).toBe("?page=5&tab=3");
  });

  it("supports debounced URL writes", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/items?page=1");

    let setPage: ((update: number | undefined) => void) | undefined;

    const Probe = () => {
      const [page, setValue] = useUrlState("page", numberCodec, {
        historyMode: "push",
        debounceMs: 20,
      });
      setPage = setValue as (update: number | undefined) => void;
      return <div data-testid="page">{Number(page ?? 0)}</div>;
    };

    render(<Probe />);
    expect(screen.getByTestId("page").textContent).toBe("1");

    await act(async () => {
      setPage?.(4);
      vi.advanceTimersByTime(19);
    });
    expect(window.location.search).toBe("?page=1");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(window.location.search).toBe("?page=4");
  });
});
