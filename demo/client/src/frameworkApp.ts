import { createApp, type EffectReactApp } from "@effect-react/react/framework";
import manifest from "virtual:effect-react/manifest";

const initialHref =
  typeof window === "undefined"
    ? "/"
    : `${window.location.pathname}${window.location.search}`;

export const app: EffectReactApp = createApp({
  manifest,
  initialHref,
});
