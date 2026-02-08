import { Effect, Stream } from "effect";
import { describe, expect, it, vi } from "vitest";
import { Navigation } from "../../navigation";
import { routeHref, routePath, routeSearchText, routeUrl } from "../../router/helpers";
import { revalidateNavigation, navigate } from "../../router/service";
import type { NavigationSnapshot } from "../../router/types";

const createSnapshot = (href: string): NavigationSnapshot => ({
  pathname: href,
  searchText: "",
  href,
  status: "success",
  match: null,
  loaders: {},
  error: undefined,
});

describe("router helpers", () => {
  it("serializes sorted search params and skips nullish or unsupported values", () => {
    const search = {
      z: undefined,
      tags: ["router", ["effect"], null] as unknown,
      includeDrafts: true,
      page: 2,
      q: "ada lovelace",
      skip: null,
      ignored: {
        nested: true,
      },
    } as unknown as Readonly<Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined>>;

    expect(routeSearchText()).toBe("");
    expect(routeSearchText(search)).toBe("?includeDrafts=true&page=2&q=ada+lovelace&tags=router&tags=effect");
  });

  it("builds paths and hrefs, and throws when route params are missing", () => {
    const userRoute = {
      id: "users.show",
      path: "/users/:id",
    } as const;

    expect(routePath(userRoute, { id: "Ada Lovelace" })).toBe("/users/Ada%20Lovelace");
    expect(() => routePath(userRoute)).toThrow("Missing route param 'id' for route 'users.show'");

    expect(routeHref(userRoute, {
      params: { id: 7 },
      search: {
        tab: "activity",
        page: 1,
      },
    })).toBe("/users/7?page=1&tab=activity");
  });

  it("builds absolute URLs from explicit and implicit bases", () => {
    const route = {
      id: "posts.show",
      path: "/posts/:id",
    } as const;

    expect(
      routeUrl(route, {
        params: { id: "42" },
        base: new URL("https://example.com/root/"),
      }).toString(),
    ).toBe("https://example.com/posts/42");
    const implicitBase = routeUrl(route, {
      params: { id: "7" },
    });
    expect(implicitBase.origin).toBe(window.location.origin);
    expect(implicitBase.pathname).toBe("/posts/7");

    const previousWindow = globalThis.window;
    vi.stubGlobal("window", undefined);

    try {
      expect(
        routeUrl(route, {
          params: { id: "99" },
        }).toString(),
      ).toBe("http://localhost/posts/99");
    } finally {
      vi.stubGlobal("window", previousWindow);
    }
  });
});

describe("router service wrappers", () => {
  it("delegates navigate and revalidate effects to Navigation service", async () => {
    const navigateResult = createSnapshot("/users/1");
    const revalidatedResult = createSnapshot("/users/1?fresh=1");

    const navigateMock = vi.fn((href: string) => Effect.succeed(createSnapshot(href)));
    const revalidateMock = vi.fn(() => Effect.succeed(revalidatedResult));

    const navigationService = {
      navigate: navigateMock,
      revalidate: revalidateMock,
      getSnapshot: Effect.succeed(navigateResult),
      hydrateSnapshot: () => Effect.void,
      snapshots: Stream.empty,
    };

    const navigated = await Effect.runPromise(
      navigate("/users/1").pipe(
        Effect.provideService(Navigation, navigationService),
      ),
    );

    const revalidated = await Effect.runPromise(
      revalidateNavigation().pipe(
        Effect.provideService(Navigation, navigationService),
      ),
    );

    expect(navigateMock).toHaveBeenCalledWith("/users/1");
    expect(revalidateMock).toHaveBeenCalledTimes(1);
    expect(navigated.href).toBe("/users/1");
    expect(revalidated.href).toBe("/users/1?fresh=1");
  });
});
