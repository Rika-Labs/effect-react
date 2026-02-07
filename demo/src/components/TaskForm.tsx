import { useForm } from "@effect-react/react/forms";
import { useMutation } from "@effect-react/react/mutation";
import { createTask } from "../api";

export function TaskForm() {
  const mutation = useMutation({
    mutation: (data: { title: string; description: string; priority: string }) =>
      createTask(data),
    invalidate: [["tasks"]],
  });

  const form = useForm({
    initialValues: { title: "", description: "", priority: "medium" },
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (values.title.trim().length === 0) errors.title = "Title is required";
      return errors;
    },
    onSubmit: async (values) => {
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

  return (
    <div
      style={{
        padding: "1rem",
        background: "#1e293b",
        borderRadius: "8px",
        border: "1px solid #334155",
      }}
    >
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        New Task
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.submit();
        }}
        style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
      >
        <div>
          <input
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

        <textarea
          placeholder="Description (optional)"
          value={form.values.description}
          onChange={(e) => form.setFieldValue("description", e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select
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
