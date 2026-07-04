import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Root } from "./ui/Root";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
