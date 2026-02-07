import { useSubscriptionRef } from "@effect-react/react/state";
import { defaultFilters, filtersRef } from "../App";

export function TaskFilters() {
  const { value: filters, set } = useSubscriptionRef({
    ref: filtersRef,
    initial: defaultFilters,
  });

  const inputStyle = {
    padding: "0.5rem",
    background: "#1e293b",
    border: "1px solid #475569",
    borderRadius: "4px",
    color: "#e2e8f0",
    fontSize: "0.9rem",
  };

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      <select
        value={filters.status}
        onChange={(e) => set({ ...filters, status: e.target.value as typeof filters.status })}
        style={inputStyle}
      >
        <option value="all">All Statuses</option>
        <option value="todo">To Do</option>
        <option value="in-progress">In Progress</option>
        <option value="done">Done</option>
      </select>

      <input
        type="text"
        placeholder="Search tasks..."
        value={filters.search}
        onChange={(e) => set({ ...filters, search: e.target.value })}
        style={{ ...inputStyle, flex: 1 }}
      />
    </div>
  );
}
