import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import "./index.css";
import App from "./App";
import { WebMcpBootstrap } from "./WebMcpBootstrap";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <WebMcpBootstrap />
      <App />
    </BrowserRouter>
  </StrictMode>
);
