import Link from "next/link";

const year = new Date().getFullYear();

export function MarketingShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "home" | "docs" | "terms" | "privacy";
}) {
  return (
    <div className="ts-marketing">
      <header className="ts-nav">
        <div className="ts-container ts-nav-inner">
          <Link href="/" className="ts-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="TidySync" />
            <span>
              Tidy<span className="ts-brand-accent">Sync</span>
            </span>
          </Link>
          <nav className="ts-nav-links">
            <Link href="/#features" className="hide-sm">
              Features
            </Link>
            <Link href="/docs" className={active === "docs" ? "is-active" : undefined}>
              Docs
            </Link>
            <Link href="/docs#install" className="hide-sm">
              Install
            </Link>
            <Link href="/docs#install" className="ts-btn ts-btn-primary">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="ts-footer">
        <div className="ts-container ts-footer-inner">
          <div className="ts-footer-brand">
            <strong>TidySync</strong>
            <div>Bulk catalog operations for Shopify · © {year}</div>
          </div>
          <div className="ts-footer-links">
            <Link href="/docs">Documentation</Link>
            <Link href="/docs#install">Installation</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <a href="https://partners.shopify.com" target="_blank" rel="noreferrer">
              Shopify Partners
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
