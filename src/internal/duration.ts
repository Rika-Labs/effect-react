import { Duration } from "effect";

export type DurationInput = Duration.DurationInput;

export const toDuration = (input: DurationInput): Duration.Duration => Duration.decode(input);

export const toMillis = (input: DurationInput): number => Duration.toMillis(toDuration(input));

export const addDuration = (startMs: number, input: DurationInput): number =>
  startMs + toMillis(input);

export const isExpired = (expiresAtMs: number, nowMs = Date.now()): boolean => nowMs >= expiresAtMs;
