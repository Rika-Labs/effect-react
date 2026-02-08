import { Effect } from "effect";
import { useCallback, useMemo, useState } from "react";
import { useEffectRuntime } from "../react/provider";
import { Actions } from "./service";
import type { ActionDefinition, ActionError } from "./types";

const useActionService = () => {
  const runtime = useEffectRuntime();
  return useMemo(() => runtime.runSync(Actions), [runtime]);
};

export interface UseActionResult<Input, Output, E> {
  readonly run: (input: Input) => Promise<Output>;
  readonly pending: boolean;
  readonly error: ActionError<E> | undefined;
}

export const useAction = <Name extends string, Input, Output, E>(
  definition: ActionDefinition<Name, Input, Output, E>,
): UseActionResult<Input, Output, E> => {
  const runtime = useEffectRuntime();
  const actions = useActionService();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ActionError<E> | undefined>(undefined);

  const run = useCallback(
    (input: Input): Promise<Output> => {
      setPending(true);
      setError(undefined);

      return runtime
        .runPromise(actions.run(definition, input))
        .then((value) => {
          setPending(false);
          return value;
        })
        .catch((cause: unknown) => {
          setPending(false);
          const resolved = cause as ActionError<E>;
          setError(resolved);
          return runtime.runPromise(Effect.fail(resolved));
        });
    },
    [actions, definition, runtime],
  );

  return {
    run,
    pending,
    error,
  };
};
