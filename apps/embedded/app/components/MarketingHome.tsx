import Link from "next/link";
import { MarketingShell } from "./MarketingShell";

const CORE_FEATURES = [
  {
    icon: "↑↓",
    iconClass: "is-brand",
    title: "Import & export",
    body: "Bring products from CSV, Excel, WooCommerce, BigCommerce, or generic files. Map fields, preview rows, then commit with live progress.",
    bullets: ["Platform auto-detection", "Conditional import rules", "Scheduled exports"],
  },
  {
    icon: "✎",
    iconClass: "",
    title: "Bulk edit in plain English",
    body: "Describe catalog changes in everyday language. TidySync builds a plan and shows every diff before anything touches your store.",
    bullets: ["Price & inventory updates", "Title and description edits", "Approve before run"],
  },
  {
    icon: "◎",
    iconClass: "is-brand",
    title: "Command center",
    body: "One workspace to scan store health, improve SEO, create backups, and run bulk missions without jumping between tabs.",
    bullets: ["Store health scan", "Quick mission cards", "Preview + approve workflow"],
  },
  {
    icon: "◇",
    iconClass: "is-brand",
    title: "Product SEO studio",
    body: "SEO scores per product with suggested titles, meta descriptions, and improvement briefings — applied when you approve.",
    bullets: ["Score rings & metrics", "Keyword insights", "One-click apply"],
  },
  {
    icon: "▣",
    iconClass: "",
    title: "Catalog vault (backups)",
    body: "Snapshot your catalog before risky imports or bulk edits. Plan-scoped retention keeps vaults manageable.",
    bullets: ["On-demand snapshots", "Status tracking", "Delete when done"],
  },
  {
    icon: "↺",
    iconClass: "",
    title: "Undo you can trust",
    body: "Every committed job stores a snapshot so you can roll back instantly if something looks wrong in the live store.",
    bullets: ["Per-job undo", "Diff history", "Audit trail"],
  },
];

const OPS_FEATURES = [
  {
    title: "Live job progress",
    desc: "Watch success and fail counters tick in real time on large catalogs — no silent black box.",
  },
  {
    title: "Catalog health scans",
    desc: "Find missing images, thin content, SKU gaps, and pricing anomalies across your entire catalog.",
  },
  {
    title: "Schedules",
    desc: "Automate daily exports and weekly health scans so ops keep running without babysitting.",
  },
  {
    title: "Clear plan limits",
    desc: "Transparent usage for products, credits, backups, and missions — with upgrade prompts when you need more.",
  },
];

export function MarketingHome() {
  return (
    <MarketingShell active="home">
      <section className="ts-hero">
        <div className="ts-container">
          <div className="ts-hero-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ts-logo-hero" src="/images/logo.png" alt="TidySync logo" />
            <div className="ts-hero-badge">Built for Shopify merchants</div>
            <h1>
              Bulk catalog ops that feel <span className="accent">native</span> inside Shopify Admin
            </h1>
            <p className="ts-hero-lead">
              Import, export, bulk edit, SEO improvements, and catalog backups — with live progress,
              full diffs, and one-click undo so you can move fast without breaking the store.
            </p>
            <div className="ts-hero-actions">
              <Link href="/docs#install" className="ts-btn ts-btn-primary">
                Install guide
              </Link>
              <Link href="/docs" className="ts-btn ts-btn-ghost">
                Read the docs
              </Link>
            </div>
            <div className="ts-hero-stats">
              <div className="ts-hero-stat">
                <strong>Preview-first</strong>
                <span>Every change reviewed before run</span>
              </div>
              <div className="ts-hero-stat">
                <strong>Embedded</strong>
                <span>Runs inside Shopify Admin</span>
              </div>
              <div className="ts-hero-stat">
                <strong>Merchant-ready</strong>
                <span>Bulk edits, SEO, vault &amp; undo</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="ts-section ts-section--alt" id="features">
        <div className="ts-container">
          <div className="ts-section-head">
            <span className="ts-section-eyebrow">Platform</span>
            <h2 className="ts-section-title">Everything in one workspace</h2>
            <p className="ts-section-sub">
              A native experience inside Shopify — not a bolted-on spreadsheet. Sidebar navigation
              groups catalog, intelligence, vault, and billing so merchants always know where to go.
            </p>
          </div>
          <div className="ts-grid ts-grid--3">
            {CORE_FEATURES.map((f) => (
              <div key={f.title} className="ts-card">
                <div className={`ts-card-icon ${f.iconClass}`}>{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
                <ul>
                  {f.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ts-section">
        <div className="ts-container ts-feature-row">
          <div>
            <span className="ts-section-eyebrow">Workflow</span>
            <h2 className="ts-section-title">Store missions &amp; quick actions</h2>
            <p className="ts-section-sub">
              Scan your store, pick a quick mission, or type what you need. TidySync plans the work,
              shows previews, and runs jobs only after you approve.
            </p>
            <div className="ts-feature-list">
              <div className="ts-feature-item">
                <div className="ts-feature-check">1</div>
                <div>
                  <strong>Fix my store</strong>
                  <p>Health scan for SEO gaps, missing SKUs, thin descriptions, and image issues.</p>
                </div>
              </div>
              <div className="ts-feature-item">
                <div className="ts-feature-check">2</div>
                <div>
                  <strong>Improve SEO</strong>
                  <p>Targets products that need better titles and meta descriptions.</p>
                </div>
              </div>
              <div className="ts-feature-item">
                <div className="ts-feature-check">3</div>
                <div>
                  <strong>Vault snapshot</strong>
                  <p>Creates a catalog backup before risky imports or bulk price changes.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="ts-feature-visual">
            <p className="ts-feature-visual-title">Example requests</p>
            <div className="ts-code">Fix SEO for products missing meta descriptions</div>
            <div className="ts-code">Backup my catalog before I import 500 SKUs</div>
            <div className="ts-code">Increase all variant prices by 10%</div>
            <p className="ts-code-note">Mission limits depend on your plan. Usage is shown clearly in the app.</p>
          </div>
        </div>
      </section>

      <section className="ts-section ts-section--alt">
        <div className="ts-container">
          <div className="ts-section-head center">
            <span className="ts-section-eyebrow">Operations</span>
            <h2 className="ts-section-title">Built for daily catalog operations</h2>
            <p className="ts-section-sub center">Reliability and visibility merchants need at scale.</p>
          </div>
          <div className="ts-grid">
            {OPS_FEATURES.map((f) => (
              <div key={f.title} className="ts-card">
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ts-section">
        <div className="ts-container">
          <div className="ts-section-head">
            <span className="ts-section-eyebrow">Get started</span>
            <h2 className="ts-section-title">From install to first job in minutes</h2>
            <p className="ts-section-sub">Open TidySync from Shopify Admin after a one-time install.</p>
          </div>
          <div className="ts-steps">
            {[
              {
                n: "1",
                t: "Install from the App Store or Partner listing",
                d: "Approve scopes for products, inventory, customers, and discounts.",
              },
              {
                n: "2",
                t: "Open Apps → TidySync inside Shopify Admin",
                d: "The embedded dashboard loads inside Admin — no separate merchant login.",
              },
              {
                n: "3",
                t: "Import, export, or run a bulk edit",
                d: "Review diff previews, approve jobs, and watch live progress. Undo anytime.",
              },
            ].map((s) => (
              <div key={s.n} className="ts-step">
                <div className="ts-step-num">{s.n}</div>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
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
          <div className="ts-cta-card">
            <span className="ts-section-eyebrow">Start today</span>
            <h2 className="ts-section-title">Ready to tidy your catalog?</h2>
            <p className="ts-section-sub center">
              Install TidySync on your store and run your first preview-safe bulk job in minutes.
            </p>
            <div className="ts-hero-actions">
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
