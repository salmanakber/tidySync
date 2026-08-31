import Link from "next/link";
import { MarketingShell } from "../components/MarketingShell";

export const metadata = {
  title: "Terms of Service — TidySync",
  description: "Terms of Service for the TidySync Shopify application.",
};

export default function TermsPage() {
  return (
    <MarketingShell active="terms">
      <div className="ts-container ts-legal">
        <h1>Terms of Service</h1>
        <p className="updated">Last updated: August 30, 2026</p>
        <article>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and use of TidySync
            (the &quot;App&quot;), a Shopify application that helps merchants import, export, and
            bulk-edit catalog data. By installing or using the App, you agree to these Terms.
          </p>

          <h2>1. Who we are</h2>
          <p>
            TidySync is operated by the TidySync team (&quot;we&quot;, &quot;us&quot;). The App runs
            as an embedded application inside Shopify Admin and may also expose public informational
            pages on our domain.
          </p>

          <h2>2. Eligibility &amp; Shopify relationship</h2>
          <p>
            You must have authority to install apps on a Shopify store. Your use of Shopify remains
            governed by Shopify&apos;s own terms. We are an independent app provider — not Shopify
            Inc.
          </p>

          <h2>3. The service</h2>
          <p>TidySync provides tools to:</p>
          <ul>
            <li>Import and export catalog resources (products, collections, customers, and related data)</li>
            <li>Run bulk edits with preview and approval</li>
            <li>Monitor jobs, schedules, catalog health, and audit history</li>
            <li>Manage plans, credits, and notifications where enabled</li>
          </ul>
          <p>
            Features may vary by plan. We may update, add, or remove features with reasonable notice
            where practical.
          </p>

          <h2>4. Accounts &amp; authentication</h2>
          <p>
            Merchants authenticate through Shopify. You are responsible for access granted to staff
            and collaborators on your store.
          </p>

          <h2>5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the App to violate law, Shopify policies, or third-party rights</li>
            <li>Attempt to reverse engineer, abuse rate limits, or disrupt the service</li>
            <li>Upload malware or content you do not have rights to process</li>
            <li>Circumvent billing, plan limits, or security controls</li>
          </ul>

          <h2>6. Data &amp; your content</h2>
          <p>
            You retain ownership of your store data. You grant us a limited license to process that
            data solely to provide the App (imports, exports, bulk edits you initiate, job history,
            and support). See our{" "}
            <Link href="/privacy" className="ts-text-link">
              Privacy Policy
            </Link>{" "}
            for details.
          </p>

          <h2>7. Suggestions &amp; previews</h2>
          <p>
            Automated suggestions and generated plans may be incorrect or incomplete. You must review
            previews before approving changes. You are responsible for the final state of your store
            after approved jobs.
          </p>

          <h2>8. Billing</h2>
          <p>
            Paid plans and credit top-ups are billed through Shopify Billing where configured. Fees,
            renewals, and cancellations follow Shopify&apos;s billing flows and your selected plan.
          </p>

          <h2>9. Availability &amp; support</h2>
          <p>
            We aim for reliable uptime but do not guarantee uninterrupted service. Large jobs depend
            on Shopify API limits and your catalog size. Support channels may be listed in the App or
            documentation.
          </p>

          <h2>10. Disclaimers</h2>
          <p>
            THE APP IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR
            IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED BY LAW.
          </p>

          <h2>11. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE ARE NOT LIABLE FOR INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR LOST PROFITS DAMAGES, OR FOR CATALOG DATA LOSS BEYOND OUR
            REASONABLE CONTROL. OUR TOTAL LIABILITY FOR CLAIMS RELATING TO THE APP SHALL NOT EXCEED
            THE FEES YOU PAID TO US FOR THE APP IN THE THREE (3) MONTHS BEFORE THE CLAIM.
          </p>

          <h2>12. Termination</h2>
          <p>
            You may uninstall the App at any time. We may suspend or terminate access for breach of
            these Terms, abuse, or non-payment. After uninstall, we handle data as described in the
            Privacy Policy.
          </p>

          <h2>13. Changes</h2>
          <p>
            We may update these Terms by posting a revised version with a new &quot;Last
            updated&quot; date. Continued use after changes constitutes acceptance.
          </p>

          <h2>14. Contact</h2>
          <p>
            Questions about these Terms: use your TidySync support channel or the contact method
            listed on{" "}
            <Link href="/" className="ts-text-link">
              sync.tidyflowapp.com
            </Link>
            .
          </p>
        </article>
      </div>
    </MarketingShell>
  );
}
