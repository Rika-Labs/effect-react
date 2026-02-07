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

const VALID_STATUSES = new Set(["todo", "in-progress", "done"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high"]);
const MAX_TITLE_LENGTH = 500;
const MAX_DESCRIPTION_LENGTH = 2000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const sanitize = (str: string): string =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

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

    if (req.method === "GET" && path === "/api/tasks") {
      const status = url.searchParams.get("status");
      const search = url.searchParams.get("search");
      const limitParam = url.searchParams.get("limit");
      const offsetParam = url.searchParams.get("offset");

      const limit = Math.min(
        Math.max(parseInt(limitParam ?? "", 10) || DEFAULT_LIMIT, 1),
        MAX_LIMIT,
      );
      const offset = Math.max(parseInt(offsetParam ?? "", 10) || 0, 0);

      let query = "SELECT * FROM tasks";
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (status && status !== "all") {
        if (!VALID_STATUSES.has(status)) {
          return json({ error: "Invalid status filter" }, 400);
        }
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
      query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const tasks = db.prepare(query).all(...params);
      return json(tasks);
    }

    if (req.method === "POST" && path === "/api/tasks") {
      try {
        const body = (await req.json()) as Record<string, unknown>;

        if (typeof body.title !== "string" || body.title.trim().length === 0) {
          return json({ error: "Title is required and must be a string" }, 400);
        }

        const title = sanitize(body.title.trim());
        if (title.length > MAX_TITLE_LENGTH) {
          return json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` }, 400);
        }

        const rawDescription = typeof body.description === "string" ? body.description.trim() : "";
        const description = sanitize(rawDescription);
        if (description.length > MAX_DESCRIPTION_LENGTH) {
          return json(
            { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` },
            400,
          );
        }

        const priority = typeof body.priority === "string" ? body.priority : "medium";
        if (!VALID_PRIORITIES.has(priority)) {
          return json({ error: "Priority must be low, medium, or high" }, 400);
        }

        const stmt = db.prepare(
          "INSERT INTO tasks (title, description, priority) VALUES (?, ?, ?) RETURNING *",
        );
        const task = stmt.get(title, description, priority);
        return json(task, 201);
      } catch (e) {
        if (e instanceof SyntaxError) {
          return json({ error: "Invalid JSON body" }, 400);
        }
        return json({ error: "Failed to create task" }, 500);
      }
    }

    const putMatch = path.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method === "PUT" && putMatch) {
      try {
        const id = putMatch[1];
        const body = (await req.json()) as Record<string, unknown>;

        const fields: string[] = [];
        const params: unknown[] = [];

        if ("title" in body) {
          if (typeof body.title !== "string" || body.title.trim().length === 0) {
            return json({ error: "Title must be a non-empty string" }, 400);
          }
          const title = sanitize(body.title.trim());
          if (title.length > MAX_TITLE_LENGTH) {
            return json({ error: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` }, 400);
          }
          fields.push("title = ?");
          params.push(title);
        }

        if ("description" in body) {
          const rawDescription =
            typeof body.description === "string" ? body.description.trim() : "";
          const description = sanitize(rawDescription);
          if (description.length > MAX_DESCRIPTION_LENGTH) {
            return json(
              { error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer` },
              400,
            );
          }
          fields.push("description = ?");
          params.push(description);
        }

        if ("status" in body) {
          if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
            return json({ error: "Status must be todo, in-progress, or done" }, 400);
          }
          fields.push("status = ?");
          params.push(body.status);
        }

        if ("priority" in body) {
          if (typeof body.priority !== "string" || !VALID_PRIORITIES.has(body.priority)) {
            return json({ error: "Priority must be low, medium, or high" }, 400);
          }
          fields.push("priority = ?");
          params.push(body.priority);
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
