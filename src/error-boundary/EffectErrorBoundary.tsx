import { Cause } from "effect";
import { Component, type ReactNode } from "react";
import { isSuspenseQueryError } from "../query/useSuspenseQuery";

export type EffectBoundaryErrorKind = "interruption" | "failure" | "defect";

export interface EffectBoundaryFallbackProps {
  readonly error: unknown;
  readonly kind: EffectBoundaryErrorKind;
  readonly reset: () => void;
}

export type EffectBoundaryFallback =
  | ReactNode
  | ((props: EffectBoundaryFallbackProps) => ReactNode);

export interface EffectErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: EffectBoundaryFallback;
  readonly interruptionFallback?: EffectBoundaryFallback;
  readonly failureFallback?: EffectBoundaryFallback;
  readonly defectFallback?: EffectBoundaryFallback;
  readonly resetKeys?: readonly unknown[];
  readonly onError?: (error: unknown) => void;
  readonly onReset?: () => void;
}

interface EffectErrorBoundaryState {
  readonly error: Error | null;
}

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const classifyError = (error: Error): EffectBoundaryErrorKind => {
  if (isSuspenseQueryError(error)) {
    return Cause.isInterruptedOnly(error.queryCause) ? "interruption" : "failure";
  }
  return "defect";
};

const keysChanged = (
  previous: readonly unknown[] | undefined,
  current: readonly unknown[] | undefined,
): boolean => {
  if (previous === current) {
    return false;
  }
  if (previous === undefined || current === undefined) {
    return true;
  }
  if (previous.length !== current.length) {
    return true;
  }
  for (let index = 0; index < previous.length; index += 1) {
    if (!Object.is(previous[index], current[index])) {
      return true;
    }
  }
  return false;
};

const renderFallback = (
  fallback: EffectBoundaryFallback,
  props: EffectBoundaryFallbackProps,
): ReactNode => {
  if (typeof fallback === "function") {
    return fallback(props);
  }
  return fallback;
};

export class EffectErrorBoundary extends Component<
  EffectErrorBoundaryProps,
  EffectErrorBoundaryState
> {
  override state: EffectErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: unknown): EffectErrorBoundaryState {
    return { error: normalizeError(error) };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  override componentDidUpdate(previousProps: EffectErrorBoundaryProps): void {
    if (this.state.error === null) {
      return;
    }
    if (!keysChanged(previousProps.resetKeys, this.props.resetKeys)) {
      return;
    }
    this.reset();
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    const error = this.state.error;
    if (error === null) {
      return this.props.children;
    }

    const kind = classifyError(error);
    const fallback =
      kind === "interruption"
        ? (this.props.interruptionFallback ?? this.props.fallback)
        : kind === "failure"
          ? (this.props.failureFallback ?? this.props.fallback)
          : (this.props.defectFallback ?? this.props.fallback);

    if (fallback === undefined) {
      return null;
    }

    return renderFallback(fallback, {
      error,
      kind,
      reset: this.reset,
    });
  }
}
