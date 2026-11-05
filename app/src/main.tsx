import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { detectBackend, onBackendChange } from "./engine/api";
import { set } from "./engine/store";

onBackendChange(() => set({}));

// Find out whether a backend with the integrations is here before the first render.
detectBackend().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
