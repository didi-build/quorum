import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell } from "./components/AppShell";
import "./styles/app.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppShell />
    </StrictMode>,
  );
}
