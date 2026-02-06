import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MouseEvent } from "react";
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryRouterHistory,
  createRouter,
  defineRoute,
  useNavigate,
  useRouteMatch,
} from "../router";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("router branches", () => {
  it("throws when hooks are used outside RouterProvider", () => {
    const Probe = () => {
      useNavigate();
      return null;
    };

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrowError(/Missing RouterProvider context/);
    consoleError.mockRestore();
  });

  it("guards link clicks and renders outlet fallback when no outlet is provided", () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/home",
    });
    const nextRoute = defineRoute({
      id: "next",
      path: "/next",
    });
    const history = createMemoryRouterHistory("/home");
    const router = createRouter({
      routes: [homeRoute, nextRoute] as const,
      history,
    });

    const prevent = vi.fn((event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
    });

    render(
      <RouterProvider router={router}>
        <Link route={nextRoute} data-testid="normal-link">
          next
        </Link>
        <Link route={nextRoute} onClick={prevent} data-testid="prevent-link">
          prevent
        </Link>
        <Outlet fallback={<div data-testid="fallback">fallback</div>} />
      </RouterProvider>,
    );

    expect(screen.getByTestId("fallback").textContent).toBe("fallback");
    expect(router.getSnapshot().pathname).toBe("/home");

    fireEvent.click(screen.getByTestId("prevent-link"));
    expect(prevent).toHaveBeenCalledTimes(1);
    expect(router.getSnapshot().pathname).toBe("/home");

    fireEvent.click(screen.getByTestId("normal-link"), { metaKey: true });
    expect(router.getSnapshot().pathname).toBe("/home");

    fireEvent.click(screen.getByTestId("normal-link"), { button: 1 });
    expect(router.getSnapshot().pathname).toBe("/home");

    fireEvent.click(screen.getByTestId("normal-link"));
    expect(router.getSnapshot().pathname).toBe("/next");
  });

  it("supports string-path navigation and route matching transitions", () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/home",
    });
    const userRoute = defineRoute({
      id: "user",
      path: "/users/:id",
    });
    const history = createMemoryRouterHistory("/home");
    const router = createRouter({
      routes: [homeRoute, userRoute] as const,
      history,
    });

    const Probe = () => {
      const navigate = useNavigate();
      const match = useRouteMatch(userRoute);

      return (
        <div>
          <div data-testid="match-id">{match?.params.id ?? "-"}</div>
          <button onClick={() => navigate("/users/42?tab=1", { replace: true })}>go</button>
        </div>
      );
    };

    render(
      <RouterProvider router={router}>
        <Probe />
      </RouterProvider>,
    );

    expect(screen.getByTestId("match-id").textContent).toBe("-");
    fireEvent.click(screen.getByRole("button", { name: "go" }));
    expect(screen.getByTestId("match-id").textContent).toBe("42");
    expect(router.getSnapshot().searchText).toBe("?tab=1");
    expect(router.match(homeRoute)).toBeNull();
  });

  it("prefers static route matches over dynamic routes and returns null for misses", () => {
    const dynamicRoute = defineRoute({
      id: "dynamic",
      path: "/docs/:slug",
    });
    const staticRoute = defineRoute({
      id: "static",
      path: "/docs/settings",
    });

    const history = createMemoryRouterHistory("/docs/settings");
    const router = createRouter({
      routes: [dynamicRoute, staticRoute] as const,
      history,
    });

    expect(router.getSnapshot().match?.route.id).toBe("static");

    router.navigate(dynamicRoute, {
      params: { slug: "guide" },
      replace: true,
    });
    expect(router.getSnapshot().pathname).toBe("/docs/guide");

    router.navigatePath("/missing", { replace: true });
    expect(router.getSnapshot().match).toBeNull();
  });
});
