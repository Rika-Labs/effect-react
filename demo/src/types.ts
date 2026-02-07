export interface Task {
  readonly id: number;
  readonly title: string;
  readonly description: string;
  readonly status: "todo" | "in-progress" | "done";
  readonly priority: "low" | "medium" | "high";
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TaskFilters {
  readonly status: "all" | "todo" | "in-progress" | "done";
  readonly search: string;
}

const VALID_STATUSES = new Set(["todo", "in-progress", "done"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);

function isTask(value: unknown): value is Task {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "number" &&
    typeof obj.title === "string" &&
    typeof obj.description === "string" &&
    typeof obj.status === "string" &&
    VALID_STATUSES.has(obj.status) &&
    typeof obj.priority === "string" &&
    VALID_PRIORITIES.has(obj.priority) &&
    typeof obj.created_at === "string" &&
    typeof obj.updated_at === "string"
  );
}

export function validateTask(value: unknown): Task {
  if (!isTask(value)) throw new Error("Invalid task response");
  return value;
}

export function validateTaskArray(value: unknown): readonly Task[] {
  if (!Array.isArray(value)) throw new Error("Expected array of tasks");
  return value.map(validateTask);
}
