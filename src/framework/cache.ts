import type { Duration } from "effect";

export type CacheMode = "no-store" | "force-cache";

export interface CachePolicy {
  readonly mode: CacheMode;
  readonly ttl?: Duration.DurationInput;
  readonly tags?: readonly string[];
  readonly key?: string;
}

export const cachePolicy = (policy: CachePolicy): CachePolicy => policy;

export const noStore = (): CachePolicy => ({
  mode: "no-store",
});
