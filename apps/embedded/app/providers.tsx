"use client";

import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useSearchParams } from "next/navigation";
import { Suspense, createContext, useContext, useEffect, useMemo, useState } from "react";

interface ShopifyConfig {
  shop?: string;
  host?: string;
}

interface ShopifyGlobal {
  idToken?: () => Promise<string>;
  config?: Promise<ShopifyConfig>;
}

declare global {
  interface Window {
    shopify?: ShopifyGlobal;
  }
}

interface ShopContextValue {
  shop: string;
  host: string;
  ready: boolean;
}

const ShopContext = createContext<ShopContextValue>({ shop: "", host: "", ready: false });

export function useShop() {
  return useContext(ShopContext);
}

function PolarisWrapper({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [shop, setShop] = useState("");
  const [host, setHost] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const urlShop = searchParams.get("shop") ?? "";
      const urlHost = searchParams.get("host") ?? "";

      if (urlShop) {
        if (!cancelled) {
          setShop(urlShop);
          setHost(urlHost);
          setReady(true);
        }
        return;
      }

      try {
        if (window.shopify?.config) {
          const cfg = await window.shopify.config;
          if (!cancelled && cfg?.shop) {
            setShop(cfg.shop);
            setHost(cfg.host ?? urlHost);
            setReady(true);
            return;
          }
        }
      } catch {
        /* App Bridge not ready */
      }

      if (!cancelled) {
        setHost(urlHost);
        setReady(true);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const ctx = useMemo(() => ({ shop, host, ready }), [shop, host, ready]);

  return (
    <ShopContext.Provider value={ctx}>
      <PolarisAppProvider i18n={enTranslations}>
        <div
          data-shop={shop}
          data-host={host}
          style={{ minHeight: "100vh", background: "#f6f6f7", paddingBottom: 80 }}
        >
          {children}
        </div>
      </PolarisAppProvider>
    </ShopContext.Provider>
  );
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <PolarisWrapper>{children}</PolarisWrapper>
    </Suspense>
  );
}

export async function getSessionToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    if (window.shopify?.idToken) {
      return await window.shopify.idToken();
    }
  } catch {
    return null;
  }
  return null;
}
