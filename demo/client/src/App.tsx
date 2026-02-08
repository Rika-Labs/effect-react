import { useEffect, useMemo, useState } from "react";
import type { EffectReactApp } from "@effect-react/react/framework";

interface AppProps {
  readonly app: EffectReactApp;
}

const currentHref = (): string =>
  typeof window === "undefined"
    ? "/"
    : `${window.location.pathname}${window.location.search}`;

const NotFoundPage = () => (
  <>
    <h2 className="title">Not Found</h2>
    <p className="muted">No matching route exists for this URL in the demo manifest.</p>
  </>
);

const parseNumber = (value: string): number => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

const ActionResult = ({ result }: { readonly result: unknown }) => (
  <pre>{JSON.stringify(result, null, 2)}</pre>
);

const App = ({ app }: AppProps) => {
  const [href, setHref] = useState(currentHref());
  const [input, setInput] = useState("1");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    const onPopState = () => setHref(currentHref());
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      void app.dispose();
    };
  }, [app]);

  const activePage = useMemo(() => app.matchPage(href), [app, href]);

  const layout = app.manifest.layouts?.[0];

  const navigate = (to: string) => {
    window.history.pushState({}, "", to);
    setHref(currentHref());
  };

  const runAction = async () => {
    setRunning(true);

    try {
      const response = await app.handleActionRequest(
        new Request("https://demo.local/_actions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: "counter.increment",
            input: {
              value: parseNumber(input),
            },
          }),
        }),
      );

      setResult(await response.json());
    } finally {
      setRunning(false);
    }
  };

  const pageBody = activePage ? <activePage.component /> : <NotFoundPage />;

  return (
    <div className="page-shell">
      <div className="panel">
        <h1 className="title">effect-react 0.1.0 demo</h1>
        <p className="muted">
          Framework-first app composition with discovered routes and typed actions.
        </p>

        <div className="nav">
          <button type="button" onClick={() => navigate("/")}>Home</button>
          <button type="button" onClick={() => navigate("/users/ada")}>User ada</button>
          <button type="button" onClick={() => navigate("/users/grace")}>User grace</button>
          <button type="button" onClick={() => navigate("/missing")}>Missing route</button>
        </div>

        {layout ? <layout.component>{pageBody}</layout.component> : pageBody}

        <div className="row">
          <label htmlFor="counter">counter.increment input</label>
          <input
            id="counter"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="button" onClick={() => void runAction()} disabled={running}>
            {running ? "Running..." : "Run Action"}
          </button>
        </div>

        {result !== null ? <ActionResult result={result} /> : null}
      </div>
    </div>
  );
};

export default App;
