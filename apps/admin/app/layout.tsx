import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TidySync Admin",
  description: "Internal ops console for TidySync",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
