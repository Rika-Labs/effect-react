import type { PersistenceStore } from "../persistence/persistence";

export interface StateMiddleware<A> {
  readonly onSet?: (next: A, prev: A) => void;
  readonly onInit?: (initial: A) => A;
}

export const createPersistMiddleware = <A>(store: PersistenceStore<A>): StateMiddleware<A> => ({
  onSet: (next: A) => {
    void store.save(next);
  },
});

export const createDevtoolsMiddleware = <A>(label?: string): StateMiddleware<A> => ({
  onSet: (next: A, prev: A) => {
    console.debug(
      `[effect-react]${label !== undefined && label !== "" ? ` ${label}` : ""} state update`,
      { prev, next },
    );
  },
});
