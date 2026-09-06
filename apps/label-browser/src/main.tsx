import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import Faq from "./Faq.tsx";
import { initAnalytics } from "./analytics.ts";

initAnalytics();

// Tiny path-based routing. Cloudflare Pages serves index.html for any path
// (see public/_redirects), so a direct hit on /faq lands here too.
const path = window.location.pathname.replace(/\/+$/, "");
const isFaq = path === "/faq";
const Page = isFaq ? Faq : App;

// index.html ships the Label Browser title; override it for the FAQ route.
if (isFaq) {
  document.title = "SonaSky | FAQ";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
