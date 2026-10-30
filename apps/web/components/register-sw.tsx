"use client";

import { useEffect } from "react";

/** Registers the service worker that makes the site installable and shows alert notifications. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("service worker failed", err));
  }, []);
  return null;
}
