import { useMutation } from "@effect-react/react/mutation";
import { updateTask, deleteTask } from "../api";
import type { Task } from "../types";

const statusColors: Record<Task["status"], string> = {
  todo: "#94a3b8",
  "in-progress": "#facc15",
  done: "#4ade80",
};

const statusLabels: Record<Task["status"], string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
};

const nextStatus: Record<Task["status"], Task["status"]> = {
  todo: "in-progress",
  "in-progress": "done",
  done: "todo",
};

const priorityColors: Record<Task["priority"], string> = {
  low: "#94a3b8",
  medium: "#facc15",
  high: "#f87171",
};

export function TaskItem({ task }: { readonly task: Task }) {
  const statusMutation = useMutation({
    mutation: (t: Task) => updateTask(t.id, { status: nextStatus[t.status] }),
    invalidate: [["tasks"]],
  });

  const deleteMutation = useMutation({
    mutation: (id: number) => deleteTask(id),
    invalidate: [["tasks"]],
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem",
        background: "#1e293b",
        borderRadius: "6px",
        border: "1px solid #334155",
      }}
    >
      {/* Status badge — click to cycle */}
      <button
        onClick={() => statusMutation.mutate(task)}
        title={`Click to change to ${statusLabels[nextStatus[task.status]]}`}
        style={{
          padding: "0.2rem 0.5rem",
          background: "transparent",
          border: `1px solid ${statusColors[task.status]}`,
          borderRadius: "4px",
          color: statusColors[task.status],
          cursor: "pointer",
          fontSize: "0.75rem",
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        {statusLabels[task.status]}
      </button>

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            textDecoration: task.status === "done" ? "line-through" : "none",
            opacity: task.status === "done" ? 0.6 : 1,
          }}
        >
          {task.title}
        </div>
        {task.description && (
          <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.15rem" }}>
            {task.description}
          </div>
        )}
      </div>

      {/* Priority dot */}
      <span
        title={`Priority: ${task.priority}`}
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: priorityColors[task.priority],
          flexShrink: 0,
        }}
      />

      {/* Delete */}
      <button
        onClick={() => deleteMutation.mutate(task.id)}
        disabled={deleteMutation.status === "pending"}
        title="Delete task"
        style={{
          padding: "0.2rem 0.5rem",
          background: "transparent",
          border: "1px solid #475569",
          borderRadius: "4px",
          color: "#f87171",
          cursor: "pointer",
          fontSize: "0.8rem",
        }}
      >
        x
      </button>
    </div>
  );
}
