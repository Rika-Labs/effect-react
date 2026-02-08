import {
  useNavigate as useNavigationNavigate,
  useNavigationSnapshot as useNavigationState,
} from "../navigation/react";
import type { AnyRouteDefinition, NavigationSnapshot, RouteMatch } from "./types";

export {
  Link,
  Outlet,
  type LinkProps,
} from "../navigation/react";

export const useNavigate = (): ((href: string) => Promise<NavigationSnapshot>) =>
  useNavigationNavigate();

export const useNavigationSnapshot = (): NavigationSnapshot =>
  useNavigationState();

export const useRouteMatch = <TRoute extends AnyRouteDefinition>(
  route: TRoute,
): RouteMatch<TRoute> | null => {
  const snapshot = useNavigationSnapshot();
  const match = snapshot.match;
  if (match === null || match.route.id !== route.id) {
    return null;
  }
  return match as RouteMatch<TRoute>;
};
