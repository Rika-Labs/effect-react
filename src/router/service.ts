import { Effect } from "effect";
import { Navigation, navigateTo } from "../navigation";
import type { NavigationError, NavigationSnapshot } from "./types";

export const navigate = (
  href: string,
): Effect.Effect<NavigationSnapshot, NavigationError, Navigation> =>
  navigateTo(href);

export const revalidateNavigation = (): Effect.Effect<NavigationSnapshot, NavigationError, Navigation> =>
  Effect.flatMap(Navigation, (service) => service.revalidate());
