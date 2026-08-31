/**
 * Shopify product description (descriptionHtml) formatting helpers.
 * Targets the rich HTML field in Shopify Admin — not markdown.
 */

export const SHOPIFY_DESCRIPTION_HTML_INSTRUCTIONS = `
Write product descriptionHtml as rich HTML for Shopify's product description field.

HTML rules (required):
- Use only: <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>, <em>, <br>
- NO markdown (no #, **, - bullets, or code fences)
- NO <html>, <body>, <div>, or inline styles

Structure (required for full descriptions):
1. Opening <p> — compelling hook, 2–3 sentences, include the product name once naturally
2. <h2>Key features</h2> + <ul> with 4–6 <li> benefit-led bullets (specific, not generic fluff)
3. <h2>Product details</h2> + 1–2 <p> on materials, dimensions, care, compatibility, or use cases (infer reasonably from title/type; do not invent false specs)
4. <h2>Perfect for</h2> + closing <p> with use cases and a soft call to action

Length: minimum 200 words in the descriptionHtml body (250–400 words ideal for SEO).
Tone: premium ecommerce copy — confident, clear, persuasive, scannable.
SEO: weave natural keywords from title, vendor, and product type; no keyword stuffing.
Truth: stay faithful to the source data; expand thoughtfully without fabricating certifications or specs.
`.trim();

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function countDescriptionWords(html: string): number {
  const text = stripHtml(html);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Strip fences and light markdown; wrap plain text in paragraphs. */
export function normalizeShopifyDescriptionHtml(raw: string): string {
  let html = raw.trim();
  if (!html) return "";

  html = html.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Convert common markdown slips when no real HTML structure exists
  if (!/<(p|h[1-6]|ul|ol|li|br)\b/i.test(html)) {
    const lines = html.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const parts: string[] = [];
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length) {
        parts.push(`<ul>${listItems.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</ul>`);
        listItems = [];
      }
    };

    for (const line of lines) {
      const heading = line.match(/^#{1,3}\s+(.+)$/);
      const bullet = line.match(/^[-*•]\s+(.+)$/);
      if (heading) {
        flushList();
        parts.push(`<h2>${escapeHtml(heading[1])}</h2>`);
      } else if (bullet) {
        listItems.push(bullet[1]);
      } else {
        flushList();
        parts.push(`<p>${escapeHtml(line)}</p>`);
      }
    }
    flushList();
    html = parts.join("\n");
  }

  // Bold markdown remnants inside HTML
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  return html.trim();
}

export function buildRichDescriptionFallback(title: string, plainHint?: string): string {
  const safeTitle = escapeHtml(title);
  const hint = stripHtml(plainHint ?? "") || title;
  const safeHint = escapeHtml(hint.slice(0, 500));

  return `
<p><strong>${safeTitle}</strong> brings together quality, clarity, and everyday usefulness. ${safeHint.length > 20 ? safeHint : `Discover ${safeTitle} — crafted to meet what your customers are searching for.`}</p>
<h2>Key features</h2>
<ul>
<li>Built for real-world use with attention to detail and lasting value</li>
<li>Clear product information so shoppers can buy with confidence</li>
<li>Designed to stand out in your catalog and in search results</li>
<li>Easy to pair with related items and collections in your store</li>
</ul>
<h2>Product details</h2>
<p>${safeHint}</p>
<p>Review the specifications, sizing, and materials on this page before you add to cart. If you have questions about fit, compatibility, or care, our product details are here to help you choose the right option.</p>
<h2>Perfect for</h2>
<p>Whether you are shopping for yourself or picking a gift, <strong>${safeTitle}</strong> is a smart addition to your cart. Add it today and enjoy a product presented with the professional, rich detail your customers expect on Shopify.</p>
`.trim();
}

/** Normalize AI output and expand if the model returned thin plain text. */
export function finalizeShopifyDescriptionHtml(
  raw: string,
  title: string,
  options?: { minWords?: number; plainFallback?: string },
): string {
  const minWords = options?.minWords ?? 180;
  const plainFallback = options?.plainFallback;

  let html = normalizeShopifyDescriptionHtml(raw);
  const words = countDescriptionWords(html);

  if (words < 80) {
    const hint = stripHtml(html) || plainFallback || title;
    html = buildRichDescriptionFallback(title, hint);
  } else if (words < minWords) {
    if (!/<h2/i.test(html)) {
      html += `\n<h2>Product details</h2>\n<p>${escapeHtml(stripHtml(html))}</p>`;
    }
    if (!/<ul/i.test(html)) {
      html += `\n<h2>Key features</h2>\n<ul><li>Quality-focused design aligned with your brand</li><li>Clear, scannable information for faster decisions</li><li>Optimized presentation for Shopify and search</li></ul>`;
    }
  }

  return html.trim();
}
