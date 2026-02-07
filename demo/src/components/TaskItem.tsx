import { useRef } from "react";
import { useMutation } from "@effect-react/react/mutation";
import { Cause } from "effect";
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
  const statusBtnRef = useRef<HTMLButtonElement>(null);

  const statusMutation = useMutation({
    mutation: (t: Task) => updateTask(t.id, { status: nextStatus[t.status] }),
    invalidate: [["tasks"]],
    onSuccess: () => {
      statusBtnRef.current?.focus();
    },
  });

  const deleteMutation = useMutation({
    mutation: (id: number) => deleteTask(id),
    invalidate: [["tasks"]],
  });

  const handleDelete = () => {
    if (window.confirm(`Delete "${task.title}"?`)) {
      deleteMutation.mutate(task.id);
    }
  };

  const errorMessage =
    (statusMutation.status === "failure" && statusMutation.cause
      ? Cause.squash(statusMutation.cause).message
      : null) ??
    (deleteMutation.status === "failure" && deleteMutation.cause
      ? Cause.squash(deleteMutation.cause).message
      : null);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.25rem",
      }}
    >
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
        <button
          ref={statusBtnRef}
          onClick={() => statusMutation.mutate(task)}
          title={`Click to change to ${statusLabels[nextStatus[task.status]]}`}
          aria-label={`Status: ${statusLabels[task.status]}. Click to change to ${statusLabels[nextStatus[task.status]]}`}
          tabIndex={0}
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

        <button
          onClick={handleDelete}
          disabled={deleteMutation.status === "pending"}
          aria-label="Delete task"
          tabIndex={0}
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

      {errorMessage && (
        <p role="alert" style={{ color: "#f87171", fontSize: "0.8rem", paddingLeft: "0.75rem" }}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
