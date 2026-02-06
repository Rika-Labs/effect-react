import { describe, expect, it } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { asAnyRouteLoader, defineRoute, defineRouteLoader } from "../router";
import { defineServerAction } from "../server";
import { defineApp } from "../framework";
import { parseFrameworkHydrationState } from "../ssr";

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
};

const readLoaderId = (loaderState: Readonly<Record<string, unknown>>, routeId: string): string => {
  const entry = loaderState[routeId];
  const entryRecord = asRecord(entry);
  if (entryRecord === undefined || entryRecord["_tag"] !== "success") {
    return "missing";
  }

  const value = asRecord(entryRecord["value"]);
  if (value === undefined || typeof value["id"] !== "string") {
    return "invalid";
  }

  return value["id"];
};

const extractHydrationPayload = (html: string, globalName: string): string | undefined => {
  const marker = `window[${JSON.stringify(globalName)}]=`;
  const start = html.indexOf(marker);
  if (start === -1) {
    return undefined;
  }
  const valueStart = start + marker.length;
  const end = html.indexOf(";", valueStart);
  if (end === -1) {
    return undefined;
  }
  return html.slice(valueStart, end);
};

describe("framework ssr e2e", () => {
  it("runs match -> loaders -> render -> hydration in string mode", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const profileRoute = defineRoute({
      id: "profile",
      path: "/profile/:id",
    });
    const profileLoader = defineRouteLoader({
      route: profileRoute,
      run: ({ location }) => Effect.succeed({ id: location.params.id }),
    });
    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const app = defineApp({
      runtime,
      routes: [profileRoute] as const,
      actions: [ping] as const,
      loaders: [asAnyRouteLoader(profileLoader)],
    });

    const handler = app.createSsrHandler({
      render: ({ loaderState, cache }) =>
        Effect.sync(() => {
          const id = readLoaderId(loaderState as Readonly<Record<string, unknown>>, "profile");
          cache.setQueryData(["profile", id], {
            id,
          });

          return (
            <html>
              <body>
                <main data-testid="ssr-profile">{id}</main>
              </body>
            </html>
          );
        }),
    });

    const response = await handler(new Request("https://example.test/profile/u1"));
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain('data-testid="ssr-profile">u1</main>');
    expect(html).toContain("__EFFECT_REACT_STATE__");

    const payload = extractHydrationPayload(html, "__EFFECT_REACT_STATE__");
    expect(payload).toBeDefined();

    const hydrationState = parseFrameworkHydrationState(payload!);
    expect(hydrationState?.loaderState["profile"]).toEqual({
      _tag: "success",
      value: { id: "u1" },
    });
    expect(hydrationState?.query.queries.length).toBe(1);

    await runtime.dispose();
  });

  it("supports stream mode and custom hydration global", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const profileRoute = defineRoute({
      id: "profile",
      path: "/profile/:id",
    });
    const profileLoader = defineRouteLoader({
      route: profileRoute,
      run: ({ location }) => Effect.succeed({ id: location.params.id }),
    });
    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const app = defineApp({
      runtime,
      routes: [profileRoute] as const,
      actions: [ping] as const,
      loaders: [asAnyRouteLoader(profileLoader)],
    });

    const handler = app.createSsrHandler({
      mode: "stream",
      globalName: "__STREAM_STATE__",
      render: ({ loaderState }) =>
        Effect.sync(() => {
          const id = readLoaderId(loaderState as Readonly<Record<string, unknown>>, "profile");
          return (
            <html>
              <body>
                <main>{id}</main>
              </body>
            </html>
          );
        }),
    });

    const response = await handler(new Request("https://example.test/profile/u2"));
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain("<main>u2</main>");
    expect(html).toContain("__STREAM_STATE__");

    const payload = extractHydrationPayload(html, "__STREAM_STATE__");
    expect(payload).toBeDefined();
    const scriptIndex = html.indexOf("__STREAM_STATE__");
    const bodyCloseIndex = html.indexOf("</body>");
    expect(scriptIndex).toBeGreaterThan(-1);
    expect(bodyCloseIndex).toBeGreaterThan(-1);
    expect(scriptIndex).toBeLessThan(bodyCloseIndex);

    await runtime.dispose();
  });

  it("appends hydration script when string output has no body tag", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const rootRoute = defineRoute({
      id: "root",
      path: "/",
    });
    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const app = defineApp({
      runtime,
      routes: [rootRoute] as const,
      actions: [ping] as const,
    });

    const handler = app.createSsrHandler({
      render: () =>
        Effect.sync(() => (
          <>
            <main data-testid="no-body">plain</main>
          </>
        )),
    });

    const response = await handler(new Request("https://example.test/"));
    expect(response.status).toBe(200);

    const html = await response.text();
    expect(html).toContain('data-testid="no-body">plain</main>');
    expect(html).toContain("__EFFECT_REACT_STATE__");

    const marker = "__EFFECT_REACT_STATE__";
    const markerIndex = html.indexOf(marker);
    const contentIndex = html.indexOf('data-testid="no-body"');
    expect(markerIndex).toBeGreaterThan(contentIndex);
    expect(html.trimEnd().endsWith("</script>")).toBe(true);

    await runtime.dispose();
  });

  it("allows custom render error mapping at the request boundary", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const rootRoute = defineRoute({
      id: "root",
      path: "/",
    });
    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const app = defineApp({
      runtime,
      routes: [rootRoute] as const,
      actions: [ping] as const,
    });

    const handler = app.createSsrHandler({
      render: () =>
        Effect.fail({
          code: "view_crash" as const,
        }),
      onError: (error) =>
        new Response(JSON.stringify(error), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    });

    const response = await handler(new Request("https://example.test/"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      _tag: "render_failure",
      error: { code: "view_crash" },
    });

    await runtime.dispose();
  });

  it("preserves render failure mapping in stream mode", async () => {
    const runtime = ManagedRuntime.make(Layer.empty);

    const rootRoute = defineRoute({
      id: "root",
      path: "/",
    });
    const ping = defineServerAction({
      name: "ping",
      run: (input: { readonly value: string }) => Effect.succeed({ pong: input.value }),
    });

    const app = defineApp({
      runtime,
      routes: [rootRoute] as const,
      actions: [ping] as const,
    });

    const handler = app.createSsrHandler({
      mode: "stream",
      render: () =>
        Effect.fail({
          code: "view_crash" as const,
        }),
      onError: (error) =>
        new Response(JSON.stringify(error), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
    });

    const response = await handler(new Request("https://example.test/"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      _tag: "render_failure",
      error: { code: "view_crash" },
    });

    await runtime.dispose();
  });
});
