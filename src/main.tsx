import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PostHogProvider } from "@posthog/react";
import posthog from "posthog-js";
import { App } from "./features/prototype/app";
import "./app/globals.css";

// Analytics run only where both variables are set at build time (the Netlify
// production deploy). Local dev, CI and participant packages send nothing.
const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

if (posthogToken && posthogHost) {
  posthog.init(posthogToken, {
    api_host: posthogHost,
    defaults: "2026-08-30",
    // HashRouter keeps every route in the URL hash. The 2026 defaults strip hashes
    // from captured URLs, which would record every screen as "/"; keep them and
    // count hash-only navigation as a pageview.
    disable_capture_url_hashes: false,
    capture_pageview: { path: true, hash: true },
    // No cookies or localStorage identifiers: no consent banner is needed.
    persistence: "memory",
    person_profiles: "identified_only",
    // Forms hold CV and message text; replay stays off.
    disable_session_recording: true,
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </StrictMode>,
);
