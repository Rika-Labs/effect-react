import type { ReactNode } from "react";
import { defineLayout } from "@effect-react/react/framework";

const RootLayout = ({ children }: { readonly children?: unknown }) => (
  <>
    <p className="muted">
      Layout from <code>app/layout.tsx</code>
    </p>
    {children as ReactNode}
  </>
);

export const layout = defineLayout({
  id: "root.layout",
  component: RootLayout,
});

export default layout;
