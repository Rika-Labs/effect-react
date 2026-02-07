import { Effect, Layer, ManagedRuntime, SubscriptionRef } from "effect";
import { EffectProvider } from "@effect-react/react/provider";
import { QueryCache } from "@effect-react/react/query";
import { TaskList } from "./components/TaskList";
import { TaskForm } from "./components/TaskForm";
import { TaskFilters } from "./components/TaskFilters";
import { TaskStats } from "./components/TaskStats";
import type { TaskFilters as TaskFiltersType } from "./types";

const runtime = ManagedRuntime.make(Layer.empty);
const cache = new QueryCache();

export const defaultFilters: TaskFiltersType = { status: "all", search: "" };

// Shared filter state — created synchronously since SubscriptionRef.make is pure
export const filtersRef = Effect.runSync(
  SubscriptionRef.make<TaskFiltersType>(defaultFilters),
);

export function App() {
  return (
    <EffectProvider runtime={runtime} cache={cache}>
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          Effect React Demo — Task Manager
        </h1>
        <TaskStats />
        <TaskFilters />
        <TaskForm />
        <TaskList />
      </div>
    </EffectProvider>
  );
}
