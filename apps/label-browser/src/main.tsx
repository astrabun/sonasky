import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import Faq from "./Faq.tsx";

// Tiny path-based routing. Cloudflare Pages serves index.html for any path
// (see public/_redirects), so a direct hit on /faq lands here too.
const path = window.location.pathname.replace(/\/+$/, "");
const Page = path === "/faq" ? Faq : App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
