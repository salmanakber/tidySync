import Link from "next/link";
import { MarketingShell } from "../components/MarketingShell";

export const metadata = {
  title: "Documentation & Installation — TidySync",
  description: "Install TidySync on Shopify and learn how imports, bulk edits, exports, and billing work.",
};

export default function DocsPage() {
  return (
    <MarketingShell active="docs">
      <div className="ts-container ts-legal">
        <h1>Documentation</h1>
        <p className="updated">Installation guide and merchant help</p>

        <nav className="ts-docs-nav">
          <a href="#install">Installation</a>
          <a href="#embedded">Using the app</a>
          <a href="#import">Import &amp; export</a>
          <a href="#bulk-edit">Bulk edit</a>
          <a href="#billing">Billing &amp; plans</a>
          <a href="#help">Help &amp; support</a>
        </nav>

        <article>
          <h2 id="install">Installation guide</h2>
          <p>Install TidySync on your Shopify store:</p>
          <div className="ts-steps" style={{ margin: "20px 0" }}>
            <div className="ts-step">
              <div className="ts-step-num">1</div>
              <div>
                <h3>Install the app</h3>
                <p>
                  From the Shopify App Store or your Partner install link, choose your store and
                  approve the requested permissions.
                </p>
              </div>
            </div>
            <div className="ts-step">
              <div className="ts-step-num">2</div>
              <div>
                <h3>Approve permissions</h3>
                <p>
                  TidySync needs access to products, inventory, and related catalog data so imports,
                  exports, and bulk updates can run safely.
                </p>
              </div>
            </div>
            <div className="ts-step">
              <div className="ts-step-num">3</div>
              <div>
                <h3>Open from Shopify Admin</h3>
                <p>
                  Go to <strong>Apps → TidySync</strong>. Always open the app from Shopify Admin for
                  the best experience — not by visiting the marketing domain alone.
                </p>
              </div>
            </div>
          </div>

          <h2 id="embedded">Using the embedded dashboard</h2>
          <ul>
            <li>
              <strong>Home</strong> — quick actions, plan usage, and live job progress
            </li>
            <li>
              <strong>Import</strong> — upload CSV or Excel, map columns, preview changes, then approve
            </li>
            <li>
              <strong>Export</strong> — choose resource and format; download from Jobs when ready
            </li>
            <li>
              <strong>Bulk edit</strong> — describe a catalog change in plain English, review diffs,
              then approve
            </li>
            <li>
              <strong>SEO, Health, Schedules, Vault &amp; Billing</strong> — catalog quality, backups,
              automation, and your subscription
            </li>
          </ul>

          <h2 id="import">Import &amp; export</h2>
          <p>
            Every import shows field mapping suggestions and a diff preview before anything is committed.
            Exports run as background jobs with live progress. Completed exports can be downloaded from
            the Jobs tab. Most completed jobs support Undo using stored snapshots.
          </p>

          <h2 id="bulk-edit">Bulk edit</h2>
          <p>
            Describe a change (for example, &quot;Increase Summer Collection prices by 10%&quot; or
            &quot;Update meta descriptions for products missing SEO titles&quot;). TidySync builds a
            plan, shows impacted rows, and waits for your approval before updating Shopify.
          </p>

          <h2 id="billing">Billing &amp; plans</h2>
          <p>
            Paid plans and optional credit top-ups are handled through Shopify Billing. You can view
            your current plan, usage, and upgrade options in the Billing tab inside the app. Charges
            appear on your Shopify invoice like other app subscriptions.
          </p>

          <h2 id="help">Help &amp; support</h2>
          <p>If something does not look right:</p>
          <ul>
            <li>
              <strong>App won&apos;t load</strong> — close the tab and reopen TidySync from{" "}
              <strong>Apps → TidySync</strong> in Shopify Admin.
            </li>
            <li>
              <strong>Session or permission errors</strong> — uninstall and reinstall the app from your
              Shopify admin, then approve permissions again.
            </li>
            <li>
              <strong>Job failed</strong> — open the Jobs tab for the error summary; you can retry or
              undo when supported.
            </li>
            <li>
              <strong>Plan or billing questions</strong> — use the Billing tab in the app or contact
              your TidySync support channel.
            </li>
          </ul>

          <p style={{ marginTop: 28 }}>
            Legal:{" "}
            <Link href="/terms" className="ts-text-link">
              Terms
            </Link>{" "}
            ·{" "}
            <Link href="/privacy" className="ts-text-link">
              Privacy
            </Link>
          </p>
        </article>
      </div>
    </MarketingShell>
  );
}
