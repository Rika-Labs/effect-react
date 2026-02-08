import { Effect, Fiber, Stream } from "effect";
import {
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useEffectRuntime } from "../react/provider";
import { Navigation } from "./service";
import type { NavigationSnapshot } from "./types";

const useNavigationService = () => {
  const runtime = useEffectRuntime();
  return useMemo(() => runtime.runSync(Navigation), [runtime]);
};

export const useNavigationSnapshot = (): NavigationSnapshot => {
  const runtime = useEffectRuntime();
  const navigation = useNavigationService();

  const subscribe = useCallback(
    (listener: () => void) => {
      const fiber = runtime.runFork(
        Stream.runForEach(navigation.snapshots, () => Effect.sync(listener)),
      );

      return () => {
        runtime.runFork(Fiber.interrupt(fiber));
      };
    },
    [navigation, runtime],
  );

  const getSnapshot = useCallback(
    () => runtime.runSync(navigation.getSnapshot),
    [navigation, runtime],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

export const useNavigate = (): ((href: string) => Promise<NavigationSnapshot>) => {
  const runtime = useEffectRuntime();
  const navigation = useNavigationService();

  return useCallback(
    (href: string) => runtime.runPromise(navigation.navigate(href)),
    [navigation, runtime],
  );
};

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  readonly to: string;
  readonly children?: ReactNode;
}

export const Link = ({ to, onClick, children, ...rest }: LinkProps) => {
  const navigate = useNavigate();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }
      if (event.button !== 0 || event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      void navigate(to);
    },
    [navigate, onClick, to],
  );

  return (
    <a {...rest} href={to} onClick={handleClick}>
      {children}
    </a>
  );
};

export const Outlet = ({ children }: { readonly children?: ReactNode }) => <>{children}</>;
