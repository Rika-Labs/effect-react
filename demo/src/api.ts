import { Effect } from "effect";
import type { Task, TaskFilters } from "./types";
import { validateTask, validateTaskArray } from "./types";

export const fetchTasks = (filters: TaskFilters): Effect.Effect<readonly Task[], Error> =>
  Effect.tryPromise({
    try: async () => {
      const params = new URLSearchParams();
      if (filters.status !== "all") params.set("status", filters.status);
      if (filters.search) params.set("search", filters.search);
      const qs = params.toString();
      const res = await fetch(`/api/tasks${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
      return validateTaskArray(await res.json());
    },
    catch: (e) => new Error(String(e)),
  });

export const createTask = (data: {
  readonly title: string;
  readonly description: string;
  readonly priority: string;
}): Effect.Effect<Task, Error> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
      return validateTask(await res.json());
    },
    catch: (e) => new Error(String(e)),
  });

export const updateTask = (
  id: number,
  data: Partial<Pick<Task, "title" | "description" | "status" | "priority">>,
): Effect.Effect<Task, Error> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Failed to update task: ${res.status}`);
      return validateTask(await res.json());
    },
    catch: (e) => new Error(String(e)),
  });

export const deleteTask = (id: number): Effect.Effect<void, Error> =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`);
    },
    catch: (e) => new Error(String(e)),
  });
