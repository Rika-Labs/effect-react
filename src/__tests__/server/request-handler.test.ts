import { Effect, Schema } from "effect";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { hydrateApp } from "../../client";
import { createApp } from "../../framework";
import {
  defineAction,
  defineManifest,
  definePage,
  defineRoute,
} from "../../framework";
import { Data, defineQuery, fetchQuery } from "../../data";
import { dehydrateAppState } from "../../render";
import { createRequestHandler } from "../../server";

const createActionRequest = (url: string, body: { readonly name: string; readonly input: unknown }) =>
  new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

describe("framework request handler", () => {
  it("handles typed action transport and SSR rendering", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const createUser = defineAction({
      name: "users.create",
      input: Schema.Struct({ name: Schema.String }),
      output: Schema.Struct({ ok: Schema.Boolean }),
      error: Schema.Struct({ reason: Schema.String }),
      handler: ({ name }) => Effect.succeed({ ok: name.length > 0 }),
    });

    const homePage = definePage({
      id: "home.page",
      route: homeRoute,
      component: () => createElement("main", undefined, "Home Page"),
    });

    const app = createApp({
      manifest: defineManifest({
        pages: [homePage],
        actions: [createUser],
      }),
    });

    try {
      const handler = createRequestHandler({ app });

      const actionResponse = await handler(
        createActionRequest("https://example.com/_actions", {
          name: "users.create",
          input: {
            name: "Ada",
          },
        }),
      );

      const actionPayload = (await actionResponse.json()) as {
        readonly _tag: string;
      };

      expect(actionResponse.status).toBe(200);
      expect(actionPayload._tag).toBe("success");

      const ssrResponse = await handler(new Request("https://example.com/"));
      const html = await ssrResponse.text();

      expect(ssrResponse.status).toBe(200);
      expect(html).toContain("Home Page");
      expect(html).toContain("__effectReactHydration");
    } finally {
      await app.dispose();
    }
  });

  it("falls back to SSR when POST action path does not match", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    let calls = 0;
    const createUser = defineAction({
      name: "users.create",
      input: Schema.Struct({ name: Schema.String }),
      output: Schema.Struct({ ok: Schema.Boolean }),
      error: Schema.Struct({ reason: Schema.String }),
      handler: ({ name }) =>
        Effect.sync(() => {
          calls += 1;
          return { ok: name.length > 0 };
        }),
    });

    const homePage = definePage({
      id: "home.page",
      route: homeRoute,
      component: () => createElement("main", undefined, "Home Page"),
    });

    const app = createApp({
      manifest: defineManifest({
        pages: [homePage],
        actions: [createUser],
      }),
    });

    try {
      const handler = createRequestHandler({
        app,
        actionPath: "/rpc",
      });

      const mismatchResponse = await handler(
        createActionRequest("https://example.com/", {
          name: "users.create",
          input: {
            name: "Ada",
          },
        }),
      );

      const mismatchHtml = await mismatchResponse.text();

      expect(mismatchResponse.status).toBe(200);
      expect(mismatchResponse.headers.get("content-type")).toContain("text/html");
      expect(mismatchHtml).toContain("Home Page");
      expect(calls).toBe(0);

      const matchedResponse = await handler(
        createActionRequest("https://example.com/rpc", {
          name: "users.create",
          input: {
            name: "Ada",
          },
        }),
      );

      const matchedPayload = (await matchedResponse.json()) as {
        readonly _tag: string;
      };

      expect(matchedResponse.status).toBe(200);
      expect(matchedPayload._tag).toBe("success");
      expect(calls).toBe(1);
    } finally {
      await app.dispose();
    }
  });

  it("returns defect wire payload for unknown actions", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const homePage = definePage({
      id: "home.page",
      route: homeRoute,
      component: () => createElement("main", undefined, "Home Page"),
    });

    const app = createApp({
      manifest: defineManifest({
        pages: [homePage],
      }),
    });

    try {
      const handler = createRequestHandler({ app });

      const response = await handler(
        createActionRequest("https://example.com/_actions", {
          name: "users.unknown",
          input: {
            name: "Ada",
          },
        }),
      );

      const payload = (await response.json()) as
        | {
            readonly _tag: "defect";
            readonly message: string;
          }
        | {
            readonly _tag: string;
          };

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(payload._tag).toBe("defect");
      if (payload._tag === "defect" && "message" in payload) {
        expect(payload.message).toBe("Unknown action: users.unknown");
      }
    } finally {
      await app.dispose();
    }
  });

  it("renders not found for unknown routes instead of failing navigation", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const homePage = definePage({
      id: "home.page",
      route: homeRoute,
      component: () => createElement("main", undefined, "Home Page"),
    });

    const app = createApp({
      manifest: defineManifest({
        pages: [homePage],
      }),
    });

    try {
      const handler = createRequestHandler({ app });
      const response = await handler(new Request("https://example.com/missing"));
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(html).toContain("Not Found");
    } finally {
      await app.dispose();
    }
  });

  it("hydrates state through the client entrypoint", async () => {
    const homeRoute = defineRoute({
      id: "home",
      path: "/",
    });

    const greetingQuery = defineQuery({
      name: "greeting",
      input: Schema.Struct({ name: Schema.String }),
      output: Schema.String,
      run: ({ name }) => Effect.succeed(`hello ${name}`),
    });

    const homePage = definePage({
      id: "home.page",
      route: homeRoute,
      component: () => createElement("main", undefined, "Hydration"),
    });

    const source = createApp({
      manifest: defineManifest({
        pages: [homePage],
      }),
    });

    const target = createApp({
      manifest: defineManifest({
        pages: [homePage],
      }),
    });

    try {
      await source.runtime.runPromise(fetchQuery(greetingQuery, { name: "Ada" }));
      const state = await source.runtime.runPromise(dehydrateAppState());

      await hydrateApp({
        app: target,
        payload: state,
      });

      const hydrated = await target.runtime.runPromise(
        Effect.flatMap(Data, (data) => data.getSnapshot(greetingQuery, { name: "Ada" })),
      );

      expect(hydrated.phase).toBe("success");
      expect(hydrated.data).toBe("hello Ada");
    } finally {
      await source.dispose();
      await target.dispose();
    }
  });
});
