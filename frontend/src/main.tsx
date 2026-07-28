import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// Self-hosted fonts (weight + optical-size axes) — bundled by Vite, no
// external request to Google's font CDN at runtime.
import "@fontsource-variable/fraunces/standard.css";
import "@fontsource-variable/space-grotesk/wght.css";
import "./index.css";
import App from "./App.tsx";
import { initAnalytics } from "./utils/analytics";

// Render's redirect rules only match on path, not hostname, so the raw
// thewalletaudit.onrender.com URL can't be redirected to the custom domain
// at the platform level — Render always serves both. Doing it here instead:
// bail out before mounting anything so visitors (and search engines) land on
// the canonical domain rather than seeing the app served from both.
if (window.location.hostname === "thewalletaudit.onrender.com") {
  window.location.replace(
    `https://thewalletaudit.com${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
} else {
  initAnalytics();

  const queryClient = new QueryClient();

  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Root element #root not found in index.html");

  createRoot(rootElement).render(
    <StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}