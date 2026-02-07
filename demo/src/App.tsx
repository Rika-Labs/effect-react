import { Effect, Layer, ManagedRuntime, SubscriptionRef } from "effect";
import { EffectProvider } from "@effect-react/react/provider";
import { QueryCache } from "@effect-react/react/query";
import { TaskList } from "./components/TaskList";
import { TaskForm } from "./components/TaskForm";
import { TaskFilters } from "./components/TaskFilters";
import { TaskStats } from "./components/TaskStats";
import { ErrorBoundary } from "./components/ErrorBoundary";
import type { TaskFilters as TaskFiltersType } from "./types";

const runtime = ManagedRuntime.make(Layer.empty);
const cache = new QueryCache({
  defaultStaleTime: "30 seconds",
  defaultGcTime: "5 minutes",
});

export const defaultFilters: TaskFiltersType = { status: "all", search: "" };

export const filtersRef = Effect.runSync(SubscriptionRef.make<TaskFiltersType>(defaultFilters));

export function App() {
  return (
    <EffectProvider runtime={runtime} cache={cache}>
      <ErrorBoundary>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Effect React Demo — Task Manager</h1>
          <TaskStats />
          <TaskFilters />
          <TaskForm />
          <TaskList />
        </div>
      </ErrorBoundary>
    </EffectProvider>
  );
}
