import { Database } from "bun:sqlite";

const db = new Database("tasks.db");

db.run(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in-progress', 'done')),
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

const cors = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });

Bun.serve({
  port: 3001,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") return cors();

    // GET /api/tasks
    if (req.method === "GET" && path === "/api/tasks") {
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");

      let query = "SELECT * FROM tasks";
      const conditions: string[] = [];
      const params: string[] = [];

      if (status && status !== "all") {
        conditions.push("status = ?");
        params.push(status);
      }
      if (search) {
        conditions.push("(title LIKE ? OR description LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
      }

      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " ORDER BY created_at DESC";

      const tasks = db.prepare(query).all(...params);
      return json(tasks);
    }

    // POST /api/tasks
    if (req.method === "POST" && path === "/api/tasks") {
      try {
        const body = (await req.json()) as {
          title?: string;
          description?: string;
          priority?: string;
        };
        if (!body.title || body.title.trim().length === 0) {
          return json({ error: "Title is required" }, 400);
        }

        const stmt = db.prepare(
          "INSERT INTO tasks (title, description, priority) VALUES (?, ?, ?) RETURNING *",
        );
        const task = stmt.get(
          body.title.trim(),
          body.description?.trim() ?? "",
          body.priority ?? "medium",
        );
        return json(task, 201);
      } catch (e) {
        if (e instanceof SyntaxError) {
          return json({ error: "Invalid JSON body" }, 400);
        }
        return json({ error: "Failed to create task" }, 500);
      }
    }

    // PUT /api/tasks/:id
    const putMatch = path.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method === "PUT" && putMatch) {
      try {
        const id = putMatch[1];
        const body = (await req.json()) as Record<string, unknown>;

        const fields: string[] = [];
        const params: unknown[] = [];

        for (const key of ["title", "description", "status", "priority"] as const) {
          if (key in body) {
            fields.push(`${key} = ?`);
            params.push(body[key]);
          }
        }

        if (fields.length === 0) {
          return json({ error: "No fields to update" }, 400);
        }

        fields.push("updated_at = datetime('now')");
        params.push(id);

        const task = db
          .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? RETURNING *`)
          .get(...(params as [unknown, ...unknown[]]));

        if (!task) return json({ error: "Task not found" }, 404);
        return json(task);
      } catch (e) {
        if (e instanceof SyntaxError) {
          return json({ error: "Invalid JSON body" }, 400);
        }
        return json({ error: "Failed to update task" }, 500);
      }
    }

    // DELETE /api/tasks/:id
    const delMatch = path.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method === "DELETE" && delMatch) {
      const id = delMatch[1];
      const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      if (result.changes === 0) return json({ error: "Task not found" }, 404);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  },
});

console.log("API server running on http://localhost:3001");
