import Script from "next/script";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TidySync",
  description: "AI-guided bulk data management for Shopify",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY ?? ""} />
      </head>
      <body>
        <Script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
