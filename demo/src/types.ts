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
