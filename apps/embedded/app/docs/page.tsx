import Link from "next/link";
import { MarketingShell } from "../components/MarketingShell";

export const metadata = {
  title: "Documentation & Installation — TidySync",
  description: "Install TidySync on Shopify and learn how imports, AI edits, and billing work.",
};

export default function DocsPage() {
  return (
    <MarketingShell active="docs">
      <div className="ts-container ts-legal">
        <h1>Documentation</h1>
        <p className="updated">Installation guide · Merchant docs · Operator notes</p>

        <nav className="ts-docs-nav">
          <a href="#install">Installation</a>
          <a href="#embedded">Using the app</a>
          <a href="#import">Import &amp; export</a>
          <a href="#ai">AI bulk edit</a>
          <a href="#billing">Billing &amp; plans</a>
          <a href="#admin">Internal admin</a>
          <a href="#troubleshoot">Troubleshooting</a>
        </nav>

        <article>
          <h2 id="install">Installation guide</h2>
          <p>Install TidySync on a Shopify development or production store:</p>
          <div className="ts-steps" style={{ margin: "20px 0" }}>
            <div className="ts-step">
              <div className="ts-step-num">1</div>
              <div>
                <h3 style={{ margin: "0 0 6px" }}>Open the install link</h3>
                <p style={{ margin: 0, color: "var(--ts-muted)" }}>
                  From Shopify Partners → your app → Select store, or visit:
                </p>
                <div className="ts-code">
                  https://sync.tidyflowapp.com/auth?shop=YOUR-STORE.myshopify.com
                </div>
              </div>
            </div>
            <div className="ts-step">
              <div className="ts-step-num">2</div>
              <div>
                <h3 style={{ margin: "0 0 6px" }}>Approve scopes</h3>
                <p style={{ margin: 0, color: "var(--ts-muted)" }}>
                  Allow product, inventory, customer, discount, and metaobject permissions so imports
                  and bulk edits can run.
                </p>
              </div>
            </div>
            <div className="ts-step">
              <div className="ts-step-num">3</div>
              <div>
                <h3 style={{ margin: "0 0 6px" }}>Open from Shopify Admin</h3>
                <p style={{ margin: 0, color: "var(--ts-muted)" }}>
                  Go to <strong style={{ color: "#fff" }}>Apps → TidySync</strong>. The embedded
                  dashboard loads inside Admin (do not rely on opening the bare domain alone for
                  day-to-day use).
                </p>
              </div>
            </div>
            <div className="ts-step">
              <div className="ts-step-num">4</div>
              <div>
                <h3 style={{ margin: "0 0 6px" }}>Verify the session (optional)</h3>
                <div className="ts-code">
                  {`curl "https://sync.tidyflowapp.com/auth/session?shop=YOUR-STORE.myshopify.com"`}
                </div>
                <p style={{ margin: 0, color: "var(--ts-muted)" }}>
                  Expect <code style={{ color: "#c9d4ff" }}>hasOfflineSession: true</code> and{" "}
                  <code style={{ color: "#c9d4ff" }}>ok: true</code>.
                </p>
              </div>
            </div>
          </div>

          <h2 id="embedded">Using the embedded dashboard</h2>
          <ul>
            <li>
              <strong style={{ color: "#fff" }}>Home</strong> — quick actions and live jobs
            </li>
            <li>
              <strong style={{ color: "#fff" }}>Import</strong> — drag-and-drop CSV/XLSX, map
              columns, preview diffs, approve
            </li>
            <li>
              <strong style={{ color: "#fff" }}>Export</strong> — choose resource + format, download
              from Jobs when ready
            </li>
            <li>
              <strong style={{ color: "#fff" }}>AI Edit</strong> — natural language prompt → plan →
              staggered diff → approve
            </li>
            <li>
              <strong style={{ color: "#fff" }}>Health / Schedules / Billing</strong> — scans,
              automation, and plans
            </li>
          </ul>

          <h2 id="import">Import &amp; export</h2>
          <p>
            Every import shows field mapping suggestions and a diff preview before commit. Exports
            run as background jobs with live progress. Completed exports can be downloaded from the
            Jobs table; most completed mutations support Undo via stored snapshots.
          </p>

          <h2 id="ai">AI bulk edit</h2>
          <p>
            Describe a change (for example, &quot;Increase Summer Collection prices by 10%&quot;).
            TidySync builds a mutation plan, shows impacted rows, and waits for your approval. AI
            actions consume monthly credits according to your plan.
          </p>

          <h2 id="billing">Billing &amp; plans</h2>
          <p>
            Paid plans and credit top-ups use Shopify Billing. On development stores, operators can
            enable <strong style={{ color: "#fff" }}>testing mode</strong> per store in the internal
            admin to skip live charges while validating flows.
          </p>

          <h2 id="admin">Internal admin</h2>
          <p>
            Operators manage tenants at{" "}
            <Link href="/admin" style={{ color: "#6b8fff" }}>
              /admin
            </Link>
            . Use tenant detail to assign plans, toggle testing mode, approve installs, grant
            credits, and inspect per-store job analytics.
          </p>

          <h2 id="troubleshoot">Troubleshooting</h2>
          <ul>
            <li>
              <strong style={{ color: "#fff" }}>idToken unavailable</strong> — reopen from Shopify
              Admin; confirm OAuth session with <code>/auth/session</code>
            </li>
            <li>
              <strong style={{ color: "#fff" }}>Unauthorized merchant session</strong> — complete{" "}
              <code>/auth?shop=...</code> so an offline Session row exists
            </li>
            <li>
              <strong style={{ color: "#fff" }}>Empty shopify-api-key</strong> — set{" "}
              <code>SHOPIFY_API_KEY</code> on the server and redeploy
            </li>
          </ul>

          <p style={{ marginTop: 28 }}>
            Legal:{" "}
            <Link href="/terms" style={{ color: "#6b8fff" }}>
              Terms
            </Link>{" "}
            ·{" "}
            <Link href="/privacy" style={{ color: "#6b8fff" }}>
              Privacy
            </Link>
          </p>
        </article>
      </div>
    </MarketingShell>
  );
}
