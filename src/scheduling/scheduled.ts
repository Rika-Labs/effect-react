import { useEffect, useRef } from "react";
import type { Effect, Exit } from "effect";
import { runEffect, type EffectRunHandle } from "../internal/effectRunner";
import type { DurationInput } from "../internal/duration";
import { toMillis } from "../internal/duration";
import { useRuntime } from "../provider/useRuntime";

export type ScheduledTask<A = void> = () => A | Promise<A>;

export interface IntervalSchedule {
  readonly kind: "interval";
  readonly every: DurationInput;
}

export interface TimeoutSchedule {
  readonly kind: "timeout";
  readonly after: DurationInput;
}

export type SchedulePolicy = IntervalSchedule | TimeoutSchedule;

export interface ScheduledRunner {
  readonly run: (task: ScheduledTask<unknown>) => void;
  readonly cancel: () => void;
  readonly isRunning: () => boolean;
}

const makeIntervalRunner = (everyMs: number): ScheduledRunner => {
  let timer: ReturnType<typeof setInterval> | undefined;
  let running = false;

  return {
    run: (task) => {
      if (timer !== undefined) {
        clearInterval(timer);
      }
      running = true;
      timer = setInterval(() => {
        void task();
      }, everyMs);
    },
    cancel: () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      running = false;
    },
    isRunning: () => running,
  };
};

const makeTimeoutRunner = (afterMs: number): ScheduledRunner => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  return {
    run: (task) => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      running = true;
      timer = setTimeout(() => {
        timer = undefined;
        running = false;
        void task();
      }, afterMs);
    },
    cancel: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      running = false;
    },
    isRunning: () => running,
  };
};

export const createScheduledRunner = (schedule: SchedulePolicy): ScheduledRunner => {
  if (schedule.kind === "interval") {
    return makeIntervalRunner(toMillis(schedule.every));
  }
  return makeTimeoutRunner(toMillis(schedule.after));
};

const resolveEffect = <A, E, R>(
  effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
): Effect.Effect<A, E, R> => (typeof effect === "function" ? effect() : effect);

export const useScheduledEffect = <A, E, R>(
  effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
  schedule: SchedulePolicy,
  enabled = true,
): void => {
  const runtime = useRuntime();
  const handleRef = useRef<EffectRunHandle<A, E> | null>(null);
  const runnerRef = useRef<ScheduledRunner>(createScheduledRunner(schedule));

  useEffect(() => {
    runnerRef.current.cancel();
    runnerRef.current = createScheduledRunner(schedule);
  }, [schedule]);

  useEffect(() => {
    if (!enabled) {
      runnerRef.current.cancel();
      handleRef.current?.cancel();
      handleRef.current = null;
      return;
    }
    runnerRef.current.run(() => {
      handleRef.current?.cancel();
      handleRef.current = runEffect(runtime, resolveEffect(effect));
      return handleRef.current.promise as Promise<Exit.Exit<A, E>>;
    });
    return () => {
      runnerRef.current.cancel();
      handleRef.current?.cancel();
      handleRef.current = null;
    };
  }, [effect, enabled, runtime]);
};

export const useIntervalEffect = <A, E, R>(
  effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
  duration: DurationInput,
  enabled = true,
): void => {
  useScheduledEffect(effect, { kind: "interval", every: duration }, enabled);
};

export const useTimeoutEffect = <A, E, R>(
  effect: Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>),
  duration: DurationInput,
  enabled = true,
): void => {
  useScheduledEffect(effect, { kind: "timeout", after: duration }, enabled);
};
