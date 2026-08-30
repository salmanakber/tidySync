import Link from "next/link";
import { MarketingShell } from "./MarketingShell";

export function MarketingHome() {
  return (
    <MarketingShell active="home">
      <section className="ts-hero">
        <div className="ts-container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ts-logo-hero" src="/images/logo.png" alt="TidySync logo" />
          <div className="ts-hero-badge">Built for Shopify merchants</div>
          <h1>
            Bulk catalog work that feels <span className="accent">native</span> to Shopify
          </h1>
          <p>
            Import, export, and AI bulk-edit products with live progress, full diffs, and one-click
            undo — so you can move fast without breaking the store.
          </p>
          <div className="ts-hero-actions">
            <Link href="/docs#install" className="ts-btn ts-btn-primary">
              Install guide
            </Link>
            <Link href="/docs" className="ts-btn ts-btn-ghost">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <section className="ts-section" id="features">
        <div className="ts-container">
          <h2 className="ts-section-title">Everything you need for catalog ops</h2>
          <p className="ts-section-sub">
            Designed to sit inside Shopify Admin with Polaris-native UX — not a bolted-on spreadsheet
            tool.
          </p>
          <div className="ts-grid">
            {[
              {
                icon: "↑↓",
                title: "Import & export",
                body: "CSV / Excel from WooCommerce, BigCommerce, or generic files — mapped, previewed, then committed.",
              },
              {
                icon: "AI",
                title: "Natural language edits",
                body: "Describe a change in plain English. TidySync builds a mutation plan and shows every diff before run.",
              },
              {
                icon: "↺",
                title: "Undo that you trust",
                body: "Every commit stores a snapshot so you can snap back instantly if something looks wrong.",
              },
              {
                icon: "◉",
                title: "Live job progress",
                body: "Watch success / fail counters tick in real time on large catalogs — no silent black box.",
              },
              {
                icon: "♥",
                title: "Catalog health",
                body: "Scan for missing images, thin content, and pricing issues, then rewrite with brand voice.",
              },
              {
                icon: "⏱",
                title: "Schedules",
                body: "Automate daily exports and weekly health scans so ops keep running without babysitting.",
              },
            ].map((f) => (
              <div key={f.title} className="ts-card">
                <div className="ts-card-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ts-section">
        <div className="ts-container">
          <h2 className="ts-section-title">From install to first job in minutes</h2>
          <p className="ts-section-sub">Open TidySync from Shopify Admin after a one-time OAuth install.</p>
          <div className="ts-steps">
            {[
              {
                n: "1",
                t: "Install from your Partner / App Store listing",
                d: "Approve scopes for products, inventory, customers, and discounts.",
              },
              {
                n: "2",
                t: "Open Apps → TidySync inside Shopify Admin",
                d: "The embedded dashboard loads with App Bridge — no separate login for merchants.",
              },
              {
                n: "3",
                t: "Import, export, or describe an AI edit",
                d: "Review the diff preview, approve, and watch live progress. Undo anytime.",
              },
            ].map((s) => (
              <div key={s.n} className="ts-step">
                <div className="ts-step-num">{s.n}</div>
                <div>
                  <h3 style={{ margin: "0 0 6px" }}>{s.t}</h3>
                  <p style={{ margin: 0, color: "var(--ts-muted)" }}>{s.d}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 28 }}>
            <Link href="/docs#install" className="ts-btn ts-btn-primary">
              Full installation guide
            </Link>
          </div>
        </div>
      </section>

      <section className="ts-section">
        <div className="ts-container">
          <div
            className="ts-card"
            style={{
              textAlign: "center",
              padding: "40px 24px",
              background:
                "linear-gradient(135deg, rgba(30,79,214,0.25), rgba(5,7,13,0.9)), var(--ts-card)",
            }}
          >
            <h2 className="ts-section-title" style={{ marginBottom: 12 }}>
              Ready to tidy your catalog?
            </h2>
            <p className="ts-section-sub" style={{ margin: "0 auto 22px" }}>
              Install TidySync on a development store, enable testing mode in admin if needed, and run
              your first preview-safe bulk job.
            </p>
            <div className="ts-hero-actions" style={{ marginBottom: 0 }}>
              <Link href="/docs#install" className="ts-btn ts-btn-primary">
                Get started
              </Link>
              <Link href="/privacy" className="ts-btn ts-btn-ghost">
                Privacy policy
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
