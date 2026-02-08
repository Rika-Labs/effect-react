import { act, renderHook, waitFor } from "@testing-library/react";
import { Schema } from "effect";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createAppRuntime } from "../../kernel";
import { EffectProvider } from "../../react";
import {
  defineRoute,
  routeHref,
  routePath,
  routeSearchText,
  routeUrl,
  useNavigate,
  useNavigationSnapshot,
  useRouteMatch,
} from "../../router";

const createRuntimeWrapper = (runtime: ReturnType<typeof createAppRuntime>) => {
  const Wrapper = ({ children }: { readonly children?: ReactNode }) =>
    createElement(EffectProvider, { runtime }, children);
  return Wrapper;
};

describe("router module", () => {
  it("builds typed route path and url helpers", () => {
    const userRoute = defineRoute({
      id: "users.show",
      path: "/users/:id",
      search: Schema.Struct({
        tab: Schema.String,
        filter: Schema.String,
      }),
    });

    const pathname = routePath(userRoute, {
      id: "Ada Lovelace",
    });

    const searchText = routeSearchText({
      tab: "profile",
      filter: "active",
    });

    const href = routeHref(userRoute, {
      params: {
        id: "42",
      },
      search: {
        tab: "activity",
        filter: "all",
      },
    });

    const absolute = routeUrl(userRoute, {
      params: {
        id: "42",
      },
      search: {
        tab: "activity",
        filter: "all",
      },
      base: "https://example.com",
    });

    expect(pathname).toBe("/users/Ada%20Lovelace");
    expect(searchText).toBe("?filter=active&tab=profile");
    expect(href).toBe("/users/42?filter=all&tab=activity");
    expect(absolute.toString()).toBe("https://example.com/users/42?filter=all&tab=activity");
  });

  it("exposes navigation hooks over the navigation runtime", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const userRoute = defineRoute({
      id: "users.show",
      path: "/users/:id",
      search: Schema.Struct({
        tab: Schema.String,
      }),
    });

    const runtime = createAppRuntime({
      routes: [homeRoute, userRoute] as const,
    });

    const { result, unmount } = renderHook(
      () => {
        const snapshot = useNavigationSnapshot();
        const navigate = useNavigate();
        const userMatch = useRouteMatch(userRoute);
        return {
          snapshot,
          navigate,
          userMatch,
        };
      },
      {
        wrapper: createRuntimeWrapper(runtime),
      },
    );

    await act(async () => {
      await result.current.navigate(
        routeHref(userRoute, {
          params: {
            id: "7",
          },
          search: {
            tab: "profile",
          },
        }),
      );
    });

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe("success");
      expect(result.current.snapshot.pathname).toBe("/users/7");
    });

    expect(result.current.snapshot.match?.route.id).toBe("users.show");
    expect(result.current.snapshot.match?.params["id"]).toBe("7");
    expect(result.current.snapshot.match?.search).toEqual({
      tab: "profile",
    });
    expect(result.current.userMatch?.params["id"]).toBe("7");

    unmount();
  });
});
