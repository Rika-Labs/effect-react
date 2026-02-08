import { Effect } from "effect";
import {
  cachePolicy,
  defineLoader,
  definePage,
  defineRoute,
} from "@effect-react/react/framework";

const route = defineRoute({
  id: "home",
  path: "/",
});

const loader = defineLoader({
  name: "home.loader",
  routeId: route.id,
  run: () =>
    Effect.succeed({
      headline: "Effect-native by default",
      details: "Route loaders/actions run in one managed runtime.",
    }),
});

const HomePage = () => (
  <>
    <h2 className="title">Home Route</h2>
    <p className="muted">
      This page is discovered from <code>app/page.tsx</code>.
    </p>
  </>
);

export const page = definePage({
  id: "home.page",
  route,
  loader,
  cache: cachePolicy({
    mode: "force-cache",
    ttl: "1 minute",
    tags: ["home"],
    key: "home.page",
  }),
  component: HomePage,
});

export default page;
