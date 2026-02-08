import { createRoot } from "react-dom/client";
import { hydrateApp } from "@effect-react/react/client";
import App from "./App";
import "./app.css";
import { app } from "./frameworkApp";

const root = document.getElementById("root");

if (root !== null) {
  void hydrateApp({ app }).finally(() => {
    createRoot(root).render(<App app={app} />);
  });
}
