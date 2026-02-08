import { Effect } from "effect";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { type AppServices } from "../../kernel/app";
import type { AppManagedRuntime } from "../../kernel/runtime";
import {
  createApp,
  defineManifest,
  definePage,
  defineRoute,
} from "../../framework";
import { createSsrHandler } from "../../render/ssr";

const createTestApp = () => {
  const route = defineRoute({
    id: "home",
    path: "/",
  });

  return createApp({
    manifest: defineManifest({
      pages: [
        definePage({
          id: "home.page",
          route,
          component: () => createElement("main", undefined, "Home"),
        }),
      ],
    }),
  });
};

describe("SSR handler", () => {
  it("renders HTML, injects hydration before </body>, and defaults content-type", async () => {
    const app = createTestApp();

    try {
      const handler = createSsrHandler({
        runtime: app.runtime,
        status: 201,
        headers: {
          "x-request-id": "req-1",
        },
        hydrationGlobalName: "__customHydration",
        render: () =>
          Effect.succeed(
            createElement(
              "body",
              undefined,
              createElement("main", undefined, "SSR Body"),
            ),
          ),
      });

      const response = await handler(new Request("https://example.com/"));
      const html = await response.text();
      const scriptIndex = html.indexOf("<script>");
      const bodyCloseIndex = html.lastIndexOf("</body>");

      expect(response.status).toBe(201);
      expect(response.headers.get("x-request-id")).toBe("req-1");
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(html).toContain("SSR Body");
      expect(html).toContain("window[\"__customHydration\"]");
      expect(scriptIndex).toBeGreaterThan(-1);
      expect(bodyCloseIndex).toBeGreaterThan(scriptIndex);
    } finally {
      await app.dispose();
    }
  });

  it("appends hydration script when HTML has no </body> and preserves explicit content-type", async () => {
    const app = createTestApp();

    try {
      const handler = createSsrHandler({
        runtime: app.runtime,
        headers: {
          "content-type": "text/plain; charset=utf-8",
        },
        render: () => Effect.succeed(createElement("main", undefined, "No Body")),
      });

      const response = await handler(new Request("https://example.com/no-body"));
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(html).toContain("<main>No Body</main><script>");
      expect(html).toContain("window[\"__effectReactHydration\"]");
    } finally {
      await app.dispose();
    }
  });

  it("returns default plain-text 500 responses when rendering fails", async () => {
    const runtime = {
      runPromise: () => Promise.reject(new Error("explode")),
    } as unknown as AppManagedRuntime<AppServices>;

    const handler = createSsrHandler({
      runtime,
      render: () => Effect.succeed(createElement("main", undefined, "unused")),
    });

    const response = await handler(new Request("https://example.com/fail"));
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body).toBe("SSR render failed: explode");
  });

  it("calls onError with normalized Error instances for non-Error causes", async () => {
    const runtime = {
      runPromise: () => Promise.reject("kaboom"),
    } as unknown as AppManagedRuntime<AppServices>;

    const onError = vi.fn((error: string | Error) =>
      new Response(
        error instanceof Error ? `mapped:${error.message}` : `mapped:${error}`,
        { status: 418 },
      ));

    const handler = createSsrHandler<string>({
      runtime,
      render: () => Effect.succeed(createElement("main", undefined, "unused")),
      onError,
    });

    const response = await handler(new Request("https://example.com/on-error"));
    const body = await response.text();

    expect(response.status).toBe(418);
    expect(body).toBe("mapped:kaboom");
    expect(onError).toHaveBeenCalledTimes(1);
    const [captured] = onError.mock.calls[0] ?? [];
    expect(captured).toBeInstanceOf(Error);
    expect(captured).toMatchObject({
      message: "kaboom",
    });
  });
});
