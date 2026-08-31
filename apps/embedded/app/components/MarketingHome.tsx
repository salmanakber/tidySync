import Link from "next/link";
import { MarketingShell } from "./MarketingShell";

const CORE_FEATURES = [
  {
    icon: "↑↓",
    iconClass: "is-green",
    title: "Import & export",
    body: "Bring products from CSV, Excel, WooCommerce, BigCommerce, or generic files. Map fields, preview rows, then commit with live progress.",
    bullets: ["Platform auto-detection", "Conditional import rules", "Scheduled exports"],
  },
  {
    icon: "AI",
    iconClass: "",
    title: "Natural language bulk edit",
    body: "Describe changes in plain English. TidySync builds a mutation plan and shows every diff before anything touches your catalog.",
    bullets: ["Price & inventory updates", "Title and description edits", "Approve before run"],
  },
  {
    icon: "◎",
    iconClass: "is-purple",
    title: "AI Agent command center",
    body: "One workspace to fix store health, improve SEO, trigger backups, and run bulk missions without jumping between tabs.",
    bullets: ["Store health scan", "Quick mission cards", "Preview + approve workflow"],
  },
  {
    icon: "◇",
    iconClass: "is-green",
    title: "Product SEO studio",
    body: "Deep SEO scores per product with AI-generated titles, meta descriptions, and strategist briefings — applied in one click.",
    bullets: ["Score rings & metrics", "Keyword insights", "1 credit per apply"],
  },
  {
    icon: "▣",
    iconClass: "is-purple",
    title: "Catalog vault (backups)",
    body: "Snapshot your catalog before risky imports or bulk edits. Plan-scoped retention and product limits keep vaults manageable.",
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
    title: "Plan-aware limits",
    desc: "Clear usage for products, AI credits, agent runs, and backups — with upgrade prompts, not vague errors.",
  },
];

export function MarketingHome() {
  return (
    <MarketingShell active="home">
      <section className="ts-hero">
        <div className="ts-container">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="ts-logo-hero" src="/images/logo.png" alt="TidySync logo" />
          <div className="ts-hero-badge">Built for Shopify merchants</div>
          <h1>
            Bulk catalog ops that feel <span className="accent">native</span> inside Shopify Admin
          </h1>
          <p>
            Import, export, AI bulk edit, SEO improvements, catalog backups, and an AI Agent — with live
            progress, full diffs, and one-click undo so you can move fast without breaking the store.
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
              <strong>AI-guided</strong>
              <span>NL edits, SEO, and Agent missions</span>
            </div>
          </div>
        </div>
      </section>

      <section className="ts-section ts-section--alt" id="features">
        <div className="ts-container">
          <h2 className="ts-section-title">Everything in one workspace</h2>
          <p className="ts-section-sub">
            Polaris-native UX inside Shopify — not a bolted-on spreadsheet. Sidebar navigation groups
            catalog, intelligence, vault, and billing so merchants always know where to go.
          </p>
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
            <h2 className="ts-section-title">How the AI Agent works</h2>
            <p className="ts-section-sub">
              The Agent is your ops co-pilot: scan the store, pick a quick mission, or type a command.
              It plans the work, shows previews, and queues jobs only after you approve.
            </p>
            <div className="ts-feature-list">
              <div className="ts-feature-item">
                <div className="ts-feature-check">1</div>
                <div>
                  <strong>Fix my store</strong>
                  <p>Runs a health scan — SEO gaps, missing SKUs, thin descriptions, image issues.</p>
                </div>
              </div>
              <div className="ts-feature-item">
                <div className="ts-feature-check">2</div>
                <div>
                  <strong>Improve SEO</strong>
                  <p>Targets products that need better titles and meta descriptions with AI suggestions.</p>
                </div>
              </div>
              <div className="ts-feature-item">
                <div className="ts-feature-check">3</div>
                <div>
                  <strong>Vault snapshot</strong>
                  <p>Creates a catalog backup before you run risky imports or bulk price changes.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="ts-feature-visual">
            <p style={{ margin: "0 0 12px", fontWeight: 700, color: "var(--ts-ink)" }}>
              Example commands
            </p>
            <div className="ts-code" style={{ marginBottom: 12 }}>
              Fix SEO for products missing meta descriptions
            </div>
            <div className="ts-code" style={{ marginBottom: 12 }}>
              Backup my catalog before I import 500 SKUs
            </div>
            <div className="ts-code">Increase all variant prices by 10%</div>
            <p style={{ margin: "16px 0 0", fontSize: 13, color: "var(--ts-muted)" }}>
              Agent runs are plan-limited. Usage ring shows remaining missions each month.
            </p>
          </div>
        </div>
      </section>

      <section className="ts-section ts-section--alt">
        <div className="ts-container">
          <h2 className="ts-section-title">Built for daily catalog operations</h2>
          <p className="ts-section-sub center">Reliability and visibility merchants actually need at scale.</p>
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
                d: "The embedded dashboard loads with App Bridge — no separate merchant login.",
              },
              {
                n: "3",
                t: "Import, export, or run the AI Agent",
                d: "Review diff previews, approve jobs, and watch live progress. Undo anytime.",
              },
            ].map((s) => (
              <div key={s.n} className="ts-step">
                <div className="ts-step-num">{s.n}</div>
                <div>
                  <h3 style={{ margin: "0 0 6px", color: "var(--ts-ink)" }}>{s.t}</h3>
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
          <div className="ts-card ts-cta-card">
            <h2 className="ts-section-title" style={{ marginBottom: 12 }}>
              Ready to tidy your catalog?
            </h2>
            <p className="ts-section-sub center" style={{ margin: "0 auto 22px" }}>
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
