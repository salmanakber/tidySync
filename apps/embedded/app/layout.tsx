import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TidySync — AI-guided bulk data for Shopify",
  description:
    "Import, export, and AI bulk-edit your Shopify catalog with preview, undo, and live progress.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
