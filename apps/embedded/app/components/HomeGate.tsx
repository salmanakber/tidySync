"use client";

import { useEffect, useState } from "react";
import { AppProvider } from "../providers";
import { Dashboard } from "./Dashboard";
import { DashboardSkeleton, useShopifyBootstrap } from "./DashboardSkeleton";
import { MarketingHome } from "./MarketingHome";

export function ShopifyApp() {
  const bridgeReady = useShopifyBootstrap();

  if (!bridgeReady) {
    return (
      <div style={{ minHeight: "100vh", background: "#f6f6f7", padding: 16 }}>
        <DashboardSkeleton />
      </div>
    );
  }

  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}

export function HomeGate({ forceShopify }: { forceShopify: boolean }) {
  const [mode, setMode] = useState<"loading" | "shopify" | "marketing">(
    forceShopify ? "shopify" : "loading",
  );

  useEffect(() => {
    if (forceShopify) {
      setMode("shopify");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hasShopifyParams = Boolean(
      params.get("shop") || params.get("host") || params.get("embedded") || params.get("id_token"),
    );
    const inIframe = (() => {
      try {
        return window.self !== window.top;
      } catch {
        return true;
      }
    })();

    if (hasShopifyParams || inIframe) {
      setMode("shopify");
    } else {
      setMode("marketing");
    }
  }, [forceShopify]);

  if (mode === "loading") {
    return <div style={{ minHeight: "100vh", background: "#f4f6fa" }} aria-busy="true" />;
  }

  if (mode === "shopify") {
    return <ShopifyApp />;
  }

  return <MarketingHome />;
}
