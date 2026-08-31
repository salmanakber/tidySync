import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";

export const metadata: Metadata = {
  title: "TidySync — Bulk catalog operations for Shopify",
  description:
    "Import, export, bulk-edit, AI agent, supplier feeds, and catalog vault — with preview, undo, and live progress.",
  icons: {
    icon: "/images/logo-icon.png",
    apple: "/images/logo-icon.png",
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiKey =
    process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";

  return (
    <html lang="en">
      <head>
        {/* App Bridge: must be first script, sync load from Shopify CDN (no async/defer/module) */}
        {apiKey ? (
          <>
            <meta name="shopify-api-key" content={apiKey} />
            {/* eslint-disable-next-line @next/next/no-sync-scripts */}
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
          </>
        ) : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
