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

/** Wait for App Bridge global from layout.tsx — do NOT inject the script here (async breaks Shopify). */
export function useShopifyBootstrap() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40;

    const check = () => {
      if (cancelled) return;
      attempts += 1;
      if (window.shopify?.idToken) {
        setReady(true);
        return;
      }
      if (attempts >= maxAttempts) {
        // Proceed anyway — providers will retry idToken / fall back to OAuth check
        setReady(true);
        return;
      }
      window.setTimeout(check, 100);
    };

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
