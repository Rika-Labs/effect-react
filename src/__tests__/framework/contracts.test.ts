import { Effect, Schema } from "effect";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { defineConfig, resolveConfig } from "../../config";
import {
  cachePolicy,
  defineAction,
  defineLoader,
  defineLayout,
  defineManifest,
  defineMiddleware,
  definePage,
  defineRoute,
  loadersFromManifest,
  noStore,
  routesFromManifest,
} from "../../framework";

describe("framework contracts", () => {
  it("builds manifest from typed route/page/action definitions", () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const homeLoader = defineLoader({
      name: "home.loader",
      routeId: homeRoute.id,
      run: () => Effect.succeed({ title: "home" }),
    });

    const savePrefs = defineAction({
      name: "prefs.save",
      input: Schema.Struct({ theme: Schema.String }),
      output: Schema.Struct({ ok: Schema.Boolean }),
      error: Schema.Struct({ reason: Schema.String }),
      handler: () => Effect.succeed({ ok: true }),
    });

    const page = definePage({
      id: "home.page",
      route: homeRoute,
      loader: homeLoader,
      cache: cachePolicy({
        mode: "force-cache",
        tags: ["home"],
        ttl: "1 minute",
      }),
      component: () => createElement("main", undefined, "home"),
    });

    const manifest = defineManifest({
      pages: [page],
      actions: [savePrefs],
    });

    expect(routesFromManifest(manifest)).toEqual([homeRoute]);
    expect(loadersFromManifest(manifest)).toEqual([homeLoader]);
    expect(manifest.actions?.[0]?.name).toBe("prefs.save");
    expect(manifest.pages[0]?.cache).toEqual({
      mode: "force-cache",
      tags: ["home"],
      ttl: "1 minute",
    });
  });

  it("keeps explicit cache policy definitions intact", () => {
    const policy = cachePolicy({
      mode: "force-cache",
      ttl: "5 minutes",
      tags: ["feed", "homepage"],
      key: "home:feed",
    });

    expect(policy).toEqual({
      mode: "force-cache",
      ttl: "5 minutes",
      tags: ["feed", "homepage"],
      key: "home:feed",
    });
    expect(noStore()).toEqual({
      mode: "no-store",
    });
  });

  it("returns layout and middleware definitions unchanged", () => {
    const layout = {
      id: "shell",
      component: () => createElement("section"),
    };

    const middleware = {
      use: () => Effect.succeed(new Response("ok")),
    };

    expect(defineLayout(layout)).toBe(layout);
    expect(defineMiddleware(middleware)).toBe(middleware);
  });

  it("resolves strict defaults from config", () => {
    const resolved = resolveConfig(defineConfig({}));

    expect(resolved.appDir).toBe("app");
    expect(resolved.adapters).toEqual(["node", "bun"]);
    expect(resolved.ssr.streaming).toBe(true);
    expect(resolved.cache.defaultPolicy).toBe("no-store");
    expect(resolved.cache.routeSegmentDefaults).toBe("explicit");
    expect(resolved.strict.boundarySchemas).toBe(true);
    expect(resolved.strict.typedErrors).toBe(true);
  });
});
