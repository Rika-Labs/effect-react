import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Link,
  Outlet,
  RouterProvider,
  asAnyRouteLoader,
  createMemoryRouterHistory,
  createRouter,
  defineRoute,
  defineRouteLoader,
  useMatchChain,
  useNavigate,
  useParams,
  usePrefetchRoute,
  useRevalidateRouteLoaders,
  useRoute,
  useRouteLoaderState,
  useRouteLoadersPending,
  useRouteSearch,
  useSearchParams,
} from "../router";
import type { LazyRouteModule } from "../router";
import { createSearchAdapter, defineSearchSchema, numberCodec } from "../url-state";
import { Layer, ManagedRuntime, Effect } from "effect";

const searchSchema = defineSearchSchema({
  page: numberCodec,
});

const userRoute = defineRoute({
  id: "user",
  path: "/users/:id",
  search: createSearchAdapter(searchSchema),
});

describe("router", () => {
  it("matches params and typed search state", () => {
    const history = createMemoryRouterHistory("/users/alice?page=2");
    const router = createRouter({
      routes: [userRoute] as const,
      history,
    });

    const snapshot = router.getSnapshot();
    expect(snapshot.match?.route.id).toBe("user");
    expect(snapshot.match?.params.id).toBe("alice");
    expect(snapshot.match?.search["page"]).toBe(2);

    router.navigate(userRoute, {
      params: { id: "bob" },
      search: { page: 4 },
    });

    const nextSnapshot = router.getSnapshot();
    expect(nextSnapshot.pathname).toBe("/users/bob");
    expect(nextSnapshot.searchText).toBe("?page=4");
  });

  it("supports typed navigation from hooks", async () => {
    const history = createMemoryRouterHistory("/users/alice?page=1");
    const router = createRouter({
      routes: [userRoute] as const,
      history,
    });

    const Probe = () => {
      const params = useParams(userRoute);
      const search = useRouteSearch(userRoute);
      const navigate = useNavigate();

      return (
        <div>
          <div data-testid="id">{params?.id ?? "-"}</div>
          <div data-testid="page">{Number(search?.["page"] ?? 0)}</div>
          <button
            onClick={() =>
              navigate(userRoute, {
                params: { id: "charlie" },
                search: { page: 7 },
              })
            }
          >
            Navigate
          </button>
          <Link route={userRoute} params={{ id: "delta" }} search={{ page: 9 }}>
            Link
          </Link>
        </div>
      );
    };

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    expect(screen.getByTestId("id").textContent).toBe("alice");
    expect(screen.getByTestId("page").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Navigate" }));
    expect(screen.getByTestId("id").textContent).toBe("charlie");
    expect(screen.getByTestId("page").textContent).toBe("7");

    fireEvent.click(screen.getByRole("link", { name: "Link" }));
    expect(screen.getByTestId("id").textContent).toBe("delta");
    expect(screen.getByTestId("page").textContent).toBe("9");
  });

  it("supports route aliases and outlet rendering", () => {
    const history = createMemoryRouterHistory("/users/zeta?page=3");
    const router = createRouter({
      routes: [userRoute] as const,
      history,
    });

    const Probe = () => {
      const current = useRoute();
      const search = useSearchParams(userRoute);
      return (
        <div>
          <div data-testid="route-id">{current?.route.id ?? "-"}</div>
          <div data-testid="search-page">{Number(search?.["page"] ?? 0)}</div>
          <Outlet fallback={<div data-testid="fallback">none</div>} />
        </div>
      );
    };

    render(
      <RouterProvider router={router} outlet={<div data-testid="outlet">child</div>}>
        <Probe />
      </RouterProvider>,
    );

    expect(screen.getByTestId("route-id").textContent).toBe("user");
    expect(screen.getByTestId("search-page").textContent).toBe("3");
    expect(screen.getByTestId("outlet").textContent).toBe("child");
  });

  it("renders nested layout composition with routeComponents", () => {
    const settingsRoute = defineRoute({
      id: "settings",
      path: "/settings",
    });
    const dashboardRoute = defineRoute({
      id: "dashboard",
      path: "/dashboard",
      children: [settingsRoute],
    });

    const history = createMemoryRouterHistory("/dashboard/settings");
    const router = createRouter({
      routes: [dashboardRoute] as const,
      history,
    });

    render(
      <RouterProvider
        router={router}
        routeComponents={{
          dashboard: () => (
            <div data-testid="dashboard-layout">
              Dashboard:
              <Outlet />
            </div>
          ),
          settings: () => <div data-testid="settings-page">Settings Content</div>,
        }}
      >
        <Outlet />
      </RouterProvider>,
    );

    expect(screen.getByTestId("dashboard-layout")).toBeTruthy();
    expect(screen.getByTestId("settings-page")).toBeTruthy();
  });

  it("exposes match chain via useMatchChain hook", () => {
    const childRoute = defineRoute({
      id: "child",
      path: "/child",
    });
    const parentRoute = defineRoute({
      id: "parent",
      path: "/parent",
      children: [childRoute],
    });

    const history = createMemoryRouterHistory("/parent/child");
    const router = createRouter({
      routes: [parentRoute] as const,
      history,
    });

    const Probe = () => {
      const chain = useMatchChain();
      return <div data-testid="chain-length">{chain.length}</div>;
    };

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    expect(screen.getByTestId("chain-length").textContent).toBe("2");
  });

  it("triggers prefetch on mouse enter and focus", () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/home",
    });

    const history = createMemoryRouterHistory("/home");
    const router = createRouter({
      routes: [homeRoute] as const,
      history,
    });

    const loadFn = vi.fn(() => Promise.resolve({ default: () => null }));
    const lazyRoute: LazyRouteModule<typeof homeRoute> = {
      route: homeRoute,
      load: loadFn,
    };

    const Probe = () => {
      const prefetch = usePrefetchRoute(lazyRoute);
      return (
        <div>
          <button data-testid="hover-target" onMouseEnter={prefetch.onMouseEnter}>
            hover
          </button>
          <button data-testid="focus-target" onFocus={prefetch.onFocus}>
            focus
          </button>
        </div>
      );
    };

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    fireEvent.mouseEnter(screen.getByTestId("hover-target"));
    expect(loadFn).toHaveBeenCalledTimes(1);

    fireEvent.focus(screen.getByTestId("focus-target"));
    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  it("exposes loader state, pending status, and revalidation hooks", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);
    const history = createMemoryRouterHistory("/users/alice?page=1");

    let count = 0;
    const loader = defineRouteLoader({
      route: userRoute,
      run: ({ location }) =>
        Effect.sync(() => {
          count += 1;
          return {
            id: location.params.id,
            count,
          };
        }),
    });

    const router = createRouter({
      routes: [userRoute] as const,
      history,
      runtime,
      loaders: [asAnyRouteLoader(loader)],
    });

    const Probe = () => {
      const pending = useRouteLoadersPending();
      const state = useRouteLoaderState(userRoute);
      const revalidate = useRevalidateRouteLoaders();

      return (
        <div>
          <div data-testid="pending">{pending ? "yes" : "no"}</div>
          <div data-testid="loader-tag">{state?._tag ?? "none"}</div>
          <div data-testid="loader-count">
            {state !== undefined && state._tag === "success"
              ? String((state.value as { count: number }).count)
              : "0"}
          </div>
          <button onClick={() => void revalidate()}>Revalidate</button>
        </div>
      );
    };

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    await screen.findByText("no", { selector: "[data-testid='pending']" });
    await screen.findByText("success", { selector: "[data-testid='loader-tag']" });
    expect(screen.getByTestId("loader-count").textContent).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Revalidate" }));
    await screen.findByText("2", { selector: "[data-testid='loader-count']" });

    await runtime.dispose();
  });

  it("preserves initial loader state when runtime/loaders are not configured", () => {
    const history = createMemoryRouterHistory("/users/alice?page=1");
    const router = createRouter({
      routes: [userRoute] as const,
      history,
      initialLoaderState: {
        user: {
          _tag: "success",
          value: { id: "alice", hydrated: true },
        },
      },
    });

    const snapshot = router.getSnapshot();
    expect(snapshot.loaderState["user"]).toEqual({
      _tag: "success",
      value: { id: "alice", hydrated: true },
    });
    expect(snapshot.loadersPending).toBe(false);
  });
});
