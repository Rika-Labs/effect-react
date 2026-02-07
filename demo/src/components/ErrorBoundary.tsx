import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            padding: "1.5rem",
            background: "#1e293b",
            border: "1px solid #f87171",
            borderRadius: "8px",
            color: "#f87171",
          }}
        >
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.5rem" }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: "0.9rem", color: "#94a3b8" }}>{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: "0.75rem",
              padding: "0.4rem 0.8rem",
              background: "#334155",
              border: "1px solid #475569",
              borderRadius: "4px",
              color: "#e2e8f0",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
