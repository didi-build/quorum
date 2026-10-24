import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./components/AppShell";
import "./styles/app.css";

if (import.meta.env.DEV || import.meta.env.MODE === "mock-preview") {
  void import("./lib/preview/loadPreviewMocks").then((mod) =>
    mod.touchMockPreviewTransport(),
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppShell />
    </StrictMode>,
  );
}
