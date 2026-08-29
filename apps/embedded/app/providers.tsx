"use client";

import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useSearchParams } from "next/navigation";
import { Suspense, createContext, useContext, useMemo } from "react";

interface ShopifyGlobal {
  idToken?: () => Promise<string>;
}

declare global {
  interface Window {
    shopify?: ShopifyGlobal;
  }
}

const ShopContext = createContext<{ shop: string; host: string }>({ shop: "", host: "" });

export function useShop() {
  return useContext(ShopContext);
}

function PolarisWrapper({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const shop = searchParams.get("shop") ?? "";
  const host = searchParams.get("host") ?? "";

  const ctx = useMemo(() => ({ shop, host }), [shop, host]);

  return (
    <ShopContext.Provider value={ctx}>
      <PolarisAppProvider i18n={enTranslations}>
        <div data-shop={shop} data-host={host}>{children}</div>
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
