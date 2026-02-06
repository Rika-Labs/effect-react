export type FocusListenerCleanup = () => void;

export const onWindowFocus = (
  listener: () => void,
  target: Window | undefined = typeof window === "undefined" ? undefined : window,
): FocusListenerCleanup => {
  if (target === undefined) {
    return () => {};
  }
  target.addEventListener("focus", listener);
  return () => {
    target.removeEventListener("focus", listener);
  };
};

export const onWindowReconnect = (
  listener: () => void,
  target: Window | undefined = typeof window === "undefined" ? undefined : window,
): FocusListenerCleanup => {
  if (target === undefined) {
    return () => {};
  }
  target.addEventListener("online", listener);
  return () => {
    target.removeEventListener("online", listener);
  };
};
