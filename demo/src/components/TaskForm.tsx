import { useRef } from "react";
import { useForm } from "@effect-react/react/forms";
import { useMutation } from "@effect-react/react/mutation";
import { Cause } from "effect";
import { createTask } from "../api";

export function TaskForm() {
  const titleRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutation: (data: { title: string; description: string; priority: string }) => createTask(data),
    invalidate: [["tasks"]],
    onSuccess: () => {
      titleRef.current?.focus();
    },
  });

  const form = useForm({
    initialValues: { title: "", description: "", priority: "medium" },
    validate: (values: { title: string; description: string; priority: string }) => {
      const errors: Record<string, string> = {};
      if (values.title.trim().length === 0) errors.title = "Title is required";
      return errors;
    },
    onSubmit: async (values: { title: string; description: string; priority: string }) => {
      await mutation.mutate(values);
      form.reset();
    },
  });

  const inputStyle = {
    padding: "0.5rem",
    background: "#1e293b",
    border: "1px solid #475569",
    borderRadius: "4px",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    width: "100%",
  };

  const mutationError =
    mutation.status === "failure" && mutation.cause ? Cause.squash(mutation.cause).message : null;

  return (
    <div
      style={{
        padding: "1rem",
        background: "#1e293b",
        borderRadius: "8px",
        border: "1px solid #334155",
      }}
    >
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>New Task</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        <div>
          <label
            htmlFor="task-title"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
            }}
          >
            Task title
          </label>
          <input
            ref={titleRef}
            id="task-title"
            aria-label="Task title"
            placeholder="Task title"
            value={form.values.title}
            onChange={(e) => form.setFieldValue("title", e.target.value)}
            onBlur={() => form.blurField("title")}
            style={inputStyle}
          />
          {form.touched.title && form.errors.title && (
            <p style={{ color: "#f87171", fontSize: "0.8rem", marginTop: "0.25rem" }}>
              {form.errors.title}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="task-description"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
            }}
          >
            Description
          </label>
          <textarea
            id="task-description"
            aria-label="Description"
            placeholder="Description (optional)"
            value={form.values.description}
            onChange={(e) => form.setFieldValue("description", e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        {mutationError && (
          <p role="alert" style={{ color: "#f87171", fontSize: "0.85rem" }}>
            {mutationError}
          </p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <label
            htmlFor="task-priority"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
            }}
          >
            Priority
          </label>
          <select
            id="task-priority"
            aria-label="Priority"
            value={form.values.priority}
            onChange={(e) => form.setFieldValue("priority", e.target.value)}
            style={{ ...inputStyle, width: "auto" }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>

          <button
            type="submit"
            disabled={form.isSubmitting || mutation.status === "pending"}
            style={{
              padding: "0.5rem 1rem",
              background: "#3b82f6",
              border: "none",
              borderRadius: "4px",
              color: "#fff",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
              opacity: form.isSubmitting ? 0.6 : 1,
            }}
          >
            {form.isSubmitting ? "Creating..." : "Add Task"}
          </button>
        </div>
      </form>
    </div>
  );
}
