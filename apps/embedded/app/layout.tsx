import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TidySync",
  description: "AI-guided bulk data management for Shopify",
};

/** Must be dynamic so SHOPIFY_API_KEY is injected at request time (not empty static HTML). */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiKey =
    process.env.SHOPIFY_API_KEY ?? process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? "";

  return (
    <html lang="en">
      <head>
        {/* App Bridge requires: meta first, then sync CDN script (no async/defer/module) */}
        <meta name="shopify-api-key" content={apiKey} />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
