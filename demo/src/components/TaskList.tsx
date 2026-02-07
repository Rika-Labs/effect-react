import { useQuery } from "@effect-react/react/query";
import { useSubscriptionRef } from "@effect-react/react/state";
import { defaultFilters, filtersRef } from "../App";
import { fetchTasks } from "../api";
import { TaskItem } from "./TaskItem";

export function TaskList() {
  const { value: filters } = useSubscriptionRef({
    ref: filtersRef,
    initial: defaultFilters,
  });

  const { data, status, refetch } = useQuery({
    key: ["tasks", filters.status, filters.search],
    query: fetchTasks(filters),
    staleTime: "10 seconds",
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Tasks</h2>
        <button
          onClick={() => refetch()}
          style={{
            padding: "0.25rem 0.75rem",
            background: "#334155",
            border: "1px solid #475569",
            borderRadius: "4px",
            color: "#e2e8f0",
            cursor: "pointer",
            fontSize: "0.85rem",
          }}
        >
          Refresh
        </button>
      </div>

      {status === "loading" && <p style={{ color: "#94a3b8" }}>Loading tasks...</p>}

      {status === "failure" && <p style={{ color: "#f87171" }}>Failed to load tasks.</p>}

      {(status === "success" || status === "refreshing") && data && (
        <>
          {data.length === 0 ? (
            <p style={{ color: "#94a3b8" }}>No tasks yet. Create one above!</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {data.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
