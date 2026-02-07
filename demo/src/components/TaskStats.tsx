import { useQuery } from "@effect-react/react/query";
import { useSubscriptionRef } from "@effect-react/react/state";
import { defaultFilters, filtersRef } from "../App";
import { fetchTasks } from "../api";
import type { Task } from "../types";

interface Stats {
  readonly total: number;
  readonly todo: number;
  readonly inProgress: number;
  readonly done: number;
}

const emptyStats: Stats = { total: 0, todo: 0, inProgress: 0, done: 0 };

function computeStats(tasks: readonly Task[]): Stats {
  if (tasks.length === 0) return emptyStats;
  return {
    total: tasks.length,
    todo: tasks.filter((t) => t.status === "todo").length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    done: tasks.filter((t) => t.status === "done").length,
  };
}

export function TaskStats() {
  const { value: filters } = useSubscriptionRef({
    ref: filtersRef,
    initial: defaultFilters,
  });

  const { data: stats } = useQuery({
    key: ["tasks", filters.status, filters.search],
    query: fetchTasks(filters),
    staleTime: "10 seconds",
    select: computeStats,
  });

  const resolved = stats ?? emptyStats;

  const badgeStyle = (color: string) => ({
    padding: "0.35rem 0.75rem",
    background: color,
    borderRadius: "6px",
    fontSize: "0.85rem",
    fontWeight: 600 as const,
    color: "#0f172a",
  });

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <span style={badgeStyle("#64748b")}>Total: {resolved.total}</span>
      <span style={badgeStyle("#94a3b8")}>To Do: {resolved.todo}</span>
      <span style={badgeStyle("#facc15")}>In Progress: {resolved.inProgress}</span>
      <span style={badgeStyle("#4ade80")}>Done: {resolved.done}</span>
    </div>
  );
}
