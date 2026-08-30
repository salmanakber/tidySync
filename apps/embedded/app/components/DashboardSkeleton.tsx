"use client";

import { useEffect, useState } from "react";

/** Polaris-surface skeleton while App Bridge / tenant data loads. */
export function DashboardSkeleton() {
  return (
    <div className="tidysync-skeleton-page tidysync-enter" aria-busy="true" aria-label="Loading dashboard">
      <div style={{ marginBottom: 20 }}>
        <div className="tidysync-skeleton" style={{ height: 28, width: 180, marginBottom: 8 }} />
        <div className="tidysync-skeleton" style={{ height: 14, width: 260 }} />
      </div>
      <div className="tidysync-skeleton-stats">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="tidysync-skeleton tidysync-skeleton-stat" />
        ))}
      </div>
      <div className="tidysync-skeleton tidysync-skeleton-nav" />
      <div className="tidysync-skeleton tidysync-skeleton-panel" />
    </div>
  );
}

export function useShopifyBootstrap(apiKey: string) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let meta = document.querySelector('meta[name="shopify-api-key"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "shopify-api-key");
      document.head.insertBefore(meta, document.head.firstChild);
    }
    meta.setAttribute("content", apiKey);

    const existing = document.querySelector(
      'script[src="https://cdn.shopify.com/shopifycloud/app-bridge.js"]',
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://cdn.shopify.com/shopifycloud/app-bridge.js";
      // Insert as early as possible after meta
      if (meta.nextSibling) {
        document.head.insertBefore(script, meta.nextSibling);
      } else {
        document.head.appendChild(script);
      }
      script.onload = () => setReady(true);
      script.onerror = () => setReady(true);
    } else {
      setReady(true);
    }

    // Fallback if already loaded
    const t = window.setTimeout(() => setReady(true), 800);
    return () => window.clearTimeout(t);
  }, [apiKey]);

  return ready;
}
