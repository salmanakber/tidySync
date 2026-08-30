export interface ProductSeoCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  score: number;
}

export interface ProductSeoMetrics {
  overallScore: number;
  titleScore: number;
  descriptionScore: number;
  metaScore: number;
  mediaScore: number;
  readabilityScore: number;
  titleLength: number;
  metaDescriptionLength: number;
  descriptionWordCount: number;
  imageCount: number;
  imagesWithAlt: number;
  hasCustomSeoTitle: boolean;
  hasCustomSeoDescription: boolean;
  checks: ProductSeoCheck[];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function wordCount(text: string): number {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

function scoreTitle(title: string): { score: number; checks: ProductSeoCheck[] } {
  const len = title.length;
  const checks: ProductSeoCheck[] = [];
  let score = 100;

  if (len === 0) {
    score = 0;
    checks.push({
      id: "title_missing",
      label: "Product title",
      status: "fail",
      detail: "Title is empty.",
      score: 0,
    });
  } else if (len < 20) {
    score = 45;
    checks.push({
      id: "title_short",
      label: "Title length",
      status: "warn",
      detail: `${len} characters — aim for 40–70 for search visibility.`,
      score: 45,
    });
  } else if (len > 70) {
    score = 65;
    checks.push({
      id: "title_long",
      label: "Title length",
      status: "warn",
      detail: `${len} characters — may truncate in search results.`,
      score: 65,
    });
  } else {
    checks.push({
      id: "title_length",
      label: "Title length",
      status: "pass",
      detail: `${len} characters — good length for SEO.`,
      score: 100,
    });
  }

  return { score, checks };
}

function scoreMeta(seoTitle: string | null, seoDescription: string | null, productTitle: string): {
  score: number;
  checks: ProductSeoCheck[];
} {
  const checks: ProductSeoCheck[] = [];
  let score = 0;
  let parts = 0;

  const metaTitle = seoTitle?.trim() || "";
  const metaDesc = seoDescription?.trim() || "";

  if (metaTitle) {
    parts++;
    const len = metaTitle.length;
    const titleScore =
      len >= 40 && len <= 60 ? 100 : len >= 25 && len <= 70 ? 75 : len > 0 ? 50 : 0;
    score += titleScore;
    checks.push({
      id: "meta_title",
      label: "SEO title",
      status: titleScore >= 75 ? "pass" : titleScore >= 50 ? "warn" : "fail",
      detail: metaTitle === productTitle
        ? `Uses product title (${len} chars) — consider a keyword-focused SEO title.`
        : `Custom SEO title (${len} chars).`,
      score: titleScore,
    });
  } else {
    checks.push({
      id: "meta_title_missing",
      label: "SEO title",
      status: "fail",
      detail: "No custom SEO title — search engines use the product title only.",
      score: 0,
    });
  }

  if (metaDesc) {
    parts++;
    const len = metaDesc.length;
    const descScore =
      len >= 120 && len <= 160 ? 100 : len >= 80 && len <= 200 ? 75 : len > 0 ? 55 : 0;
    score += descScore;
    checks.push({
      id: "meta_description",
      label: "Meta description",
      status: descScore >= 75 ? "pass" : descScore >= 50 ? "warn" : "fail",
      detail: `${len} characters — ideal range is 120–160.`,
      score: descScore,
    });
  } else {
    checks.push({
      id: "meta_description_missing",
      label: "Meta description",
      status: "fail",
      detail: "Missing meta description — add a compelling summary for Google snippets.",
      score: 0,
    });
  }

  return { score: parts > 0 ? Math.round(score / parts) : 0, checks };
}

function scoreDescription(html: string): { score: number; checks: ProductSeoCheck[]; wordCount: number } {
  const text = stripHtml(html);
  const words = wordCount(text);
  const checks: ProductSeoCheck[] = [];
  let score = 100;

  if (words === 0) {
    score = 0;
    checks.push({
      id: "description_empty",
      label: "Description",
      status: "fail",
      detail: "No product description — thin content hurts rankings.",
      score: 0,
    });
  } else if (words < 50) {
    score = 40;
    checks.push({
      id: "description_thin",
      label: "Description depth",
      status: "warn",
      detail: `${words} words — expand to 150+ words for better SEO.`,
      score: 40,
    });
  } else if (words < 150) {
    score = 70;
    checks.push({
      id: "description_ok",
      label: "Description depth",
      status: "warn",
      detail: `${words} words — good start; 150+ words is ideal.`,
      score: 70,
    });
  } else {
    checks.push({
      id: "description_rich",
      label: "Description depth",
      status: "pass",
      detail: `${words} words — rich content for search and conversion.`,
      score: 100,
    });
  }

  return { score, checks, wordCount: words };
}

function scoreMedia(imageCount: number, imagesWithAlt: number): { score: number; checks: ProductSeoCheck[] } {
  const checks: ProductSeoCheck[] = [];
  let score = 0;

  if (imageCount === 0) {
    score = 0;
    checks.push({
      id: "images_missing",
      label: "Product images",
      status: "fail",
      detail: "No images — products with visuals convert and rank better.",
      score: 0,
    });
  } else {
    const imgScore = imageCount >= 3 ? 100 : imageCount >= 1 ? 75 : 50;
    score = imgScore;
    checks.push({
      id: "images_count",
      label: "Product images",
      status: imageCount >= 2 ? "pass" : "warn",
      detail: `${imageCount} image(s) — multiple angles help SEO and trust.`,
      score: imgScore,
    });

    const altRatio = imagesWithAlt / imageCount;
    const altScore = altRatio >= 0.8 ? 100 : altRatio >= 0.5 ? 70 : 40;
    score = Math.round((score + altScore) / 2);
    checks.push({
      id: "images_alt",
      label: "Image alt text",
      status: altScore >= 70 ? "pass" : altScore >= 40 ? "warn" : "fail",
      detail: `${imagesWithAlt}/${imageCount} images have alt text.`,
      score: altScore,
    });
  }

  return { score, checks };
}

function readabilityScore(text: string): { score: number; checks: ProductSeoCheck[] } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return {
      score: 0,
      checks: [
        {
          id: "readability",
          label: "Readability",
          status: "fail",
          detail: "No text to analyze.",
          score: 0,
        },
      ],
    };
  }

  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length || 1;
  const avgWordsPerSentence = words.length / sentences;
  let score = 85;
  let status: "pass" | "warn" | "fail" = "pass";
  let detail = `~${avgWordsPerSentence.toFixed(0)} words per sentence — readable flow.`;

  if (avgWordsPerSentence > 25) {
    score = 55;
    status = "warn";
    detail = "Sentences are long — break into shorter paragraphs for shoppers and search.";
  } else if (avgWordsPerSentence < 8) {
    score = 70;
    status = "warn";
    detail = "Very short sentences — add more descriptive detail.";
  }

  return {
    score,
    checks: [
      {
        id: "readability",
        label: "Readability",
        status,
        detail,
        score,
      },
    ],
  };
}

export function analyzeProductSeoMetrics(product: {
  title: string;
  descriptionHtml?: string | null;
  seo?: { title?: string | null; description?: string | null } | null;
  featuredImage?: { url?: string | null; altText?: string | null } | null;
  images?: Array<{ url?: string | null; altText?: string | null }>;
}): ProductSeoMetrics {
  const titleResult = scoreTitle(product.title);
  const descText = stripHtml(product.descriptionHtml ?? "");
  const descResult = scoreDescription(product.descriptionHtml ?? "");
  const metaResult = scoreMeta(
    product.seo?.title ?? null,
    product.seo?.description ?? null,
    product.title,
  );
  const images = product.images ?? [];
  const imageCount = images.length || (product.featuredImage?.url ? 1 : 0);
  const imagesWithAlt =
    images.filter((i) => i.altText?.trim()).length +
    (product.featuredImage?.altText?.trim() && images.length === 0 ? 1 : 0);
  const mediaResult = scoreMedia(imageCount, imagesWithAlt);
  const readResult = readabilityScore(descText);

  const checks = [
    ...titleResult.checks,
    ...metaResult.checks,
    ...descResult.checks,
    ...mediaResult.checks,
    ...readResult.checks,
  ];

  const overallScore = Math.round(
    (titleResult.score +
      metaResult.score +
      descResult.score +
      mediaResult.score +
      readResult.score) /
      5,
  );

  return {
    overallScore,
    titleScore: titleResult.score,
    descriptionScore: descResult.score,
    metaScore: metaResult.score,
    mediaScore: mediaResult.score,
    readabilityScore: readResult.score,
    titleLength: product.title.length,
    metaDescriptionLength: (product.seo?.description ?? "").length,
    descriptionWordCount: descResult.wordCount,
    imageCount,
    imagesWithAlt,
    hasCustomSeoTitle: Boolean(product.seo?.title?.trim()),
    hasCustomSeoDescription: Boolean(product.seo?.description?.trim()),
    checks,
  };
}
