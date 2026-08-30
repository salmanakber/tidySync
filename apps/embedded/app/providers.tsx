"use client";

import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import "@shopify/polaris/build/esm/styles.css";
import enTranslations from "@shopify/polaris/locales/en.json";
import { useSearchParams } from "next/navigation";
import {
  Suspense,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface ShopifyConfig {
  shop?: string;
  host?: string;
  apiKey?: string;
}

interface ShopifyGlobal {
  idToken?: () => Promise<string>;
  config?: Promise<ShopifyConfig>;
  environment?: { embedded?: boolean };
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
  authenticated: boolean;
  authError: string | null;
  beginInstall: () => void;
}

const ShopContext = createContext<ShopContextValue>({
  shop: "",
  host: "",
  ready: false,
  authenticated: false,
  authError: null,
  beginInstall: () => undefined,
});

export function useShop() {
  return useContext(ShopContext);
}

function shopFromHost(host: string): string | null {
  if (!host) return null;
  try {
    const padded = host.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(padded);
    const storeMatch = decoded.match(/\/store\/([^/?]+)/);
    if (storeMatch?.[1]) return `${storeMatch[1]}.myshopify.com`;
    const shopMatch = decoded.match(/([a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com)/);
    if (shopMatch?.[1]) return shopMatch[1];
  } catch {
    /* ignore */
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait for App Bridge CDN global, then try idToken with retries. */
export async function getSessionToken(retries = 8): Promise<string | null> {
  if (typeof window === "undefined") return null;

  for (let i = 0; i < retries; i++) {
    try {
      if (!window.shopify?.idToken) {
        await sleep(150 + i * 100);
        continue;
      }
      const token = await window.shopify.idToken();
      if (token) return token;
    } catch {
      await sleep(150 + i * 100);
    }
  }
  return null;
}

function beginOAuth(shop: string, host?: string) {
  if (!shop) return;
  const params = new URLSearchParams({ shop });
  if (host) params.set("host", host);
  // top-level navigation required for OAuth cookie/session flow
  window.open(`/auth?${params.toString()}`, "_top");
}

function PolarisWrapper({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [shop, setShop] = useState("");
  const [host, setHost] = useState("");
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const installAttempted = useRef(false);

  const beginInstall = useCallback(() => {
    const currentShop =
      shop ||
      searchParams.get("shop") ||
      shopFromHost(searchParams.get("host") ?? "") ||
      "";
    beginOAuth(currentShop, searchParams.get("host") ?? host);
  }, [shop, host, searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const urlShop = searchParams.get("shop") ?? "";
      const urlHost = searchParams.get("host") ?? "";
      const decodedShop = shopFromHost(urlHost);
      let resolvedShop = urlShop || decodedShop || "";
      let resolvedHost = urlHost;

      // Prefer App Bridge config when available
      for (let i = 0; i < 10 && !cancelled; i++) {
        try {
          if (window.shopify?.config) {
            const cfg = await window.shopify.config;
            if (cfg?.shop) resolvedShop = cfg.shop;
            if (cfg?.host) resolvedHost = cfg.host;
            break;
          }
        } catch {
          /* keep trying */
        }
        await sleep(100);
      }

      if (cancelled) return;

      setShop(resolvedShop);
      setHost(resolvedHost);

      const token = await getSessionToken(10);
      if (cancelled) return;

      if (token) {
        setAuthenticated(true);
        setAuthError(null);
        setReady(true);
        return;
      }

      // Token unavailable (common right after load) — check offline OAuth session on API
      if (resolvedShop) {
        try {
          const sessionRes = await fetch(
            `/auth/session?shop=${encodeURIComponent(resolvedShop)}`,
            { credentials: "same-origin" },
          );
          const sessionJson = (await sessionRes.json()) as { ok?: boolean };
          if (sessionJson.ok) {
            setAuthenticated(true);
            setAuthError(null);
            setReady(true);
            return;
          }
        } catch {
          /* fall through to OAuth */
        }

        if (!installAttempted.current) {
          installAttempted.current = true;
          setAuthError("Connecting to Shopify…");
          setReady(true);
          beginOAuth(resolvedShop, resolvedHost);
          return;
        }
      }

      setAuthenticated(false);
      setAuthError(
        resolvedShop
          ? "Shopify session token unavailable. Re-open the app from Shopify Admin or install again."
          : "Open TidySync from Shopify Admin (Apps → TidySync).",
      );
      setReady(true);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const ctx = useMemo(
    () => ({
      shop,
      host,
      ready,
      authenticated,
      authError,
      beginInstall,
    }),
    [shop, host, ready, authenticated, authError, beginInstall],
  );

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
