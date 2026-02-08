import { Effect, Fiber, Stream } from "effect";
import { useEffect, useState } from "react";
import { useEffectRuntime } from "../react/provider";
import type { DevtoolsEvent, DevtoolsEventStream } from "./events";

export interface UseEventStreamOptions {
  readonly enabled?: boolean;
  readonly limit?: number;
}

const appendEvent = <Event,>(
  current: readonly Event[],
  event: Event,
  limit: number,
): readonly Event[] => {
  if (limit <= 0) {
    return current;
  }
  if (current.length < limit) {
    return [...current, event];
  }
  return [...current.slice(current.length - limit + 1), event];
};

export const useEventStream = <Event,>(
  stream: Stream.Stream<Event>,
  options: UseEventStreamOptions = {},
): readonly Event[] => {
  const runtime = useEffectRuntime();
  const limit = options.limit ?? 128;
  const [events, setEvents] = useState<readonly Event[]>([]);

  useEffect(() => {
    if (options.enabled === false || limit <= 0) {
      return;
    }

    const fiber = runtime.runFork(
      Stream.runForEach(stream, (event) =>
        Effect.sync(() => {
          setEvents((current) => appendEvent(current, event, limit));
        }),
      ),
    );

    return () => {
      runtime.runFork(Fiber.interrupt(fiber));
    };
  }, [runtime, stream, options.enabled, limit]);

  return events;
};

export const useDevtoolsEvents = (
  source: DevtoolsEventStream,
  options: UseEventStreamOptions = {},
): readonly DevtoolsEvent[] => useEventStream(source.stream, options);
