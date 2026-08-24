import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { AnalyticsApp } from "./components/AnalyticsApp.js";
import "./styles.css";

const container = document.getElementById("root");
if (container === null) {
  throw new Error("Application root is missing");
}

const path = window.location.pathname.replace(/\/+$/, "") || "/";
createRoot(container).render(path === "/analytics" ? <AnalyticsApp /> : <App />);
