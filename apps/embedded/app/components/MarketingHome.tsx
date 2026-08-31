import Link from "next/link";
import { MarketingShell } from "./MarketingShell";

const CORE_FEATURES = [
  {
    icon: "↑↓",
    iconClass: "is-brand",
    title: "Import & export",
    body: "CSV, Excel, WooCommerce, Amazon, Etsy, or Google Sheets — map fields, preview every row, then commit with live progress.",
    bullets: ["Migration wizard", "Google Sheets connect", "Scheduled exports"],
  },
  {
    icon: "⟳",
    iconClass: "is-brand",
    title: "Live supplier feed",
    body: "Match supplier sheets by SKU or barcode and update price, stock, and titles on a schedule — no duplicate products every run.",
    bullets: ["Update by SKU / barcode", "Upsert new rows", "Optional auto-sync"],
  },
  {
    icon: "◎",
    iconClass: "is-brand",
    title: "AI Agent",
    body: "Scan your store, fix SEO gaps, merge duplicates, and run multi-step missions from one command center.",
    bullets: ["Fix my store scan", "Fix-all buttons", "1 credit per scan"],
  },
  {
    icon: "✎",
    iconClass: "",
    title: "AI bulk edit",
    body: "Describe catalog changes in plain English. TidySync builds a mutation plan and shows every diff before anything runs.",
    bullets: ["Natural language edits", "Rich HTML descriptions", "Approve before run"],
  },
  {
    icon: "◇",
    iconClass: "is-brand",
    title: "SEO studio",
    body: "Per-product SEO scores, keyword insights, and AI strategist briefings — applied only when you approve.",
    bullets: ["Score rings & metrics", "Meta title & description", "One-click apply"],
  },
  {
    icon: "▣",
    iconClass: "",
    title: "Catalog vault",
    body: "Snapshot products before risky imports or bulk edits. Restore with filters when you need to roll back.",
    bullets: ["On-demand backups", "Filtered restore", "Plan-scoped retention"],
  },
];

const OPS_FEATURES = [
  {
    title: "Sticky live progress",
    desc: "Watch jobs across import, feed sync, agent runs, and bulk edits — cancel stuck work from the bar.",
  },
  {
    title: "Duplicate merge",
    desc: "Find duplicate listings by title or SKU, preview merges, and combine variants safely.",
  },
  {
    title: "Schedules & automation",
    desc: "Daily exports, health scans, and supplier feed sync on hourly, daily, or weekly intervals.",
  },
  {
    title: "Friendly notifications",
    desc: "Email updates in merchant language — not raw job IDs — when imports and syncs finish or fail.",
  },
];

export function MarketingHome() {
  return (
    <MarketingShell active="home">
      <section className="ts-hero">
        <div className="ts-container">
          <div className="ts-hero-panel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ts-logo-hero" src="/images/logo.png" alt="TidySync" />
            <div className="ts-hero-badge">Built for Shopify merchants</div>
            <h1>
              Catalog ops that feel <span className="accent">native</span> inside Shopify Admin
            </h1>
            <p className="ts-hero-lead">
              Import, live supplier feeds, AI agent missions, bulk edits, SEO, vault backups, and duplicate merge —
              with preview-first workflows, live progress, and undo when you need it.
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
                <strong>Live feeds</strong>
                <span>SKU-matched sheet sync</span>
              </div>
              <div className="ts-hero-stat">
                <strong>Preview-first</strong>
                <span>Review diffs before run</span>
              </div>
              <div className="ts-hero-stat">
                <strong>Agent + vault</strong>
                <span>Fix, backup, and undo</span>
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
              Sidebar groups Overview, Catalog, Intelligence, Vault &amp; health, and Billing — Agent, live feeds,
              migration wizard, and vault live alongside import and export.
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
            <h2 className="ts-section-title">Agent missions &amp; supplier feeds</h2>
            <p className="ts-section-sub">
              Scan the store, sync a supplier sheet by SKU, or type a bulk edit. TidySync shows previews and runs only
              after you approve (unless you enable auto-apply on feeds).
            </p>
            <div className="ts-feature-list">
              <div className="ts-feature-item">
                <div className="ts-feature-check">1</div>
                <div>
                  <strong>Live supplier feed</strong>
                  <p>Map columns once, then schedule SKU-matched price and inventory updates from Google Sheets.</p>
                </div>
              </div>
              <div className="ts-feature-item">
                <div className="ts-feature-check">2</div>
                <div>
                  <strong>Fix my store</strong>
                  <p>Health scan plus fix-all for missing SEO, thin descriptions, and image gaps.</p>
                </div>
              </div>
              <div className="ts-feature-item">
                <div className="ts-feature-check">3</div>
                <div>
                  <strong>Vault before risky work</strong>
                  <p>Snapshot the catalog before large imports or feed syncs — restore with filters if needed.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="ts-feature-visual">
            <p className="ts-feature-visual-title">Example workflows</p>
            <div className="ts-code">Sync supplier sheet — update prices by SKU every 6 hours</div>
            <div className="ts-code">Fix SEO for all products missing meta descriptions</div>
            <div className="ts-code">Merge duplicate listings found by matching title</div>
            <p className="ts-code-note">Plan limits apply to AI credits, agent runs, and automation.</p>
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
                t: "Connect a sheet or upload a file",
                d: "Map columns, preview changes, approve — then enable live SKU sync if needed.",
              },
              {
                n: "3",
                t: "Run Agent or schedules",
                d: "Fix catalog issues, automate exports, and let supplier feeds run on a schedule.",
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
              Install TidySync and run your first preview-safe import or supplier feed sync in minutes.
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
