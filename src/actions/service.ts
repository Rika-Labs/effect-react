import { Cause, Context, Effect, Layer } from "effect";
import { Boundary, BoundaryDecodeError } from "../boundary";
import { BoundaryProtocolError } from "../boundary/errors";
import { Telemetry } from "../kernel/telemetry";
import {
  type ActionDefinition,
  type ActionError,
  type ActionWireResult,
  type AnyActionDefinition,
} from "./types";

const toFailureDetail = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
};

export interface ActionService {
  readonly run: <Name extends string, Input, Output, E>(
    definition: ActionDefinition<Name, Input, Output, E>,
    input: unknown,
  ) => Effect.Effect<Output, ActionError<E>, never>;
  readonly dispatch: (name: string, input: unknown) => Effect.Effect<ActionWireResult, never, never>;
}

export class Actions extends Context.Tag("EffectReact/Actions")<Actions, ActionService>() {}

export interface MakeActionsLayerOptions {
  readonly actions: readonly AnyActionDefinition[];
}

export const makeActionsLayer = (
  options: MakeActionsLayerOptions,
): Layer.Layer<Actions, never, Boundary | Telemetry> =>
  Layer.effect(
    Actions,
    Effect.gen(function* () {
      const boundary = yield* Boundary;
      const telemetry = yield* Telemetry;
      const actionMap = new Map<string, AnyActionDefinition>(
        options.actions.map((action) => [action.name, action] as const),
      );

      const run: ActionService["run"] = (definition, input) =>
        Effect.gen(function* () {
          yield* telemetry.emit({
            _tag: "action",
            phase: "start",
            name: definition.name,
            timestamp: Date.now(),
          });

          const decodedInput = yield* boundary.decodeUnknown({
            source: `action:${definition.name}:input`,
            schema: definition.input,
            value: input,
          });

          const value = yield* definition.handler(decodedInput);

          const decodedOutput = yield* boundary.decodeUnknown({
            source: `action:${definition.name}:output`,
            schema: definition.output,
            value,
          });

          yield* telemetry.emit({
            _tag: "action",
            phase: "success",
            name: definition.name,
            timestamp: Date.now(),
          });

          return decodedOutput;
        }).pipe(
          Effect.tapError((error) =>
            telemetry.emit({
              _tag: "action",
              phase: "failure",
              name: definition.name,
              timestamp: Date.now(),
              detail: error,
            }),
          ),
        );

      const dispatch: ActionService["dispatch"] = (name, input) =>
        Effect.gen(function* () {
          const definition = actionMap.get(name);
          if (definition === undefined) {
            return {
              _tag: "defect",
              message: `Unknown action: ${name}`,
            } satisfies ActionWireResult;
          }

          const decodedInput = yield* boundary.decodeUnknown({
            source: `action:${name}:dispatch-input`,
            schema: definition.input as never,
            value: input,
          });

          const handler = definition.handler as (input: unknown) => Effect.Effect<unknown, unknown, never>;
          const result = yield* Effect.exit(handler(decodedInput));
          if (result._tag === "Success") {
            const encoded = yield* boundary.encode({
              source: `action:${name}:wire-success`,
              schema: definition.output as never,
              value: result.value,
            });

            return {
              _tag: "success",
              value: encoded,
            } satisfies ActionWireResult;
          }

          const failure = Cause.failureOption(result.cause);
          if (failure._tag === "Some") {
            const value = failure.value;
            if (value instanceof BoundaryDecodeError || value instanceof BoundaryProtocolError) {
              return {
                _tag: "defect",
                message: toFailureDetail(value),
              } satisfies ActionWireResult;
            }

            const encodedError = yield* boundary.encode({
              source: `action:${name}:wire-failure`,
              schema: definition.error as never,
              value,
            }).pipe(
              Effect.catchAll(() => Effect.succeed(value)),
            );

            return {
              _tag: "failure",
              error: encodedError,
            } satisfies ActionWireResult;
          }

          return {
            _tag: "defect",
            message: Cause.pretty(result.cause),
          } satisfies ActionWireResult;
        }).pipe(
          Effect.catchAll((error) =>
            Effect.succeed({
              _tag: "defect",
              message: toFailureDetail(error),
            } satisfies ActionWireResult),
          ),
        );

      return {
        run,
        dispatch,
      } satisfies ActionService;
    }),
  );

export const runAction = <Name extends string, Input, Output, E>(
  definition: ActionDefinition<Name, Input, Output, E>,
  input: unknown,
): Effect.Effect<Output, ActionError<E>, Actions> =>
  Effect.flatMap(Actions, (service) => service.run(definition, input));

export const dispatchAction = (
  name: string,
  input: unknown,
): Effect.Effect<ActionWireResult, never, Actions> =>
  Effect.flatMap(Actions, (service) => service.dispatch(name, input));
