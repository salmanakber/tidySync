"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  BlockStack,
  Button,
  InlineStack,
  Spinner,
  Text,
  TextField,
} from "@shopify/polaris";
import { gqlRequest, QUERIES, MUTATIONS } from "../lib/graphql";

interface CatalogProduct {
  id: string;
  title: string;
  handle?: string | null;
  status?: string;
  featuredImageUrl?: string | null;
}

interface ProductSeoCheck {
  id: string;
  label: string;
  status: string;
  detail: string;
  score: number;
}

interface ProductSeoMetrics {
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
  checks: ProductSeoCheck[];
}

interface ProductSeoInsight {
  productId: string;
  title: string;
  handle?: string | null;
  featuredImageUrl?: string | null;
  metrics: ProductSeoMetrics;
  aiExplanation: string;
  creditsUsed: number;
}

interface ProductSeoStudioProps {
  shop: string;
  creditsRemaining?: number | string;
  onCreditsRefresh?: () => void;
}

function scoreTone(score: number): "success" | "warning" | "critical" {
  if (score >= 75) return "success";
  if (score >= 50) return "warning";
  return "critical";
}

function MetricBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="tidysync-seo-metric">
      <InlineStack align="space-between">
        <Text as="span" variant="bodySm">{label}</Text>
        <Text as="span" variant="bodySm" fontWeight="semibold">{score}</Text>
      </InlineStack>
      <div className="tidysync-seo-metric-track">
        <div
          className={`tidysync-seo-metric-fill is-${scoreTone(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className={`tidysync-seo-ring is-${tone}`} aria-label={`Overall SEO score ${score}`}>
      <svg viewBox="0 0 120 120" className="tidysync-seo-ring-svg">
        <circle cx="60" cy="60" r="52" className="tidysync-seo-ring-bg" />
        <circle
          cx="60"
          cy="60"
          r="52"
          className="tidysync-seo-ring-progress"
          strokeDasharray={`${(score / 100) * 326} 326`}
        />
      </svg>
      <div className="tidysync-seo-ring-label">
        <span className="tidysync-seo-ring-value">{score}</span>
        <span className="tidysync-seo-ring-sub">SEO score</span>
      </div>
    </div>
  );
}

export function ProductSeoStudio({ shop, creditsRemaining, onCreditsRefresh }: ProductSeoStudioProps) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [insight, setInsight] = useState<ProductSeoInsight | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProducts = useCallback(async (query?: string) => {
    setLoadingList(true);
    setError(null);
    try {
      const data = await gqlRequest<{ catalogProducts: CatalogProduct[] }>(
        QUERIES.catalogProducts,
        { first: 24, query: query?.trim() || null },
        shop,
      );
      setProducts(data.catalogProducts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load products");
    } finally {
      setLoadingList(false);
    }
  }, [shop]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedId),
    [products, selectedId],
  );

  const analyze = async (productId: string) => {
    setAnalyzing(true);
    setError(null);
    setApplySuccess(null);
    setSelectedId(productId);
    try {
      const data = await gqlRequest<{ analyzeProductSeo: ProductSeoInsight }>(
        MUTATIONS.analyzeProductSeo,
        { productId },
        shop,
      );
      setInsight(data.analyzeProductSeo);
      onCreditsRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "SEO analysis failed");
      setInsight(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const applySeo = async () => {
    if (!insight?.productId) return;
    setApplying(true);
    setError(null);
    setApplySuccess(null);
    try {
      const data = await gqlRequest<{ applyProductSeo: ProductSeoInsight & { applied?: Record<string, string> } }>(
        MUTATIONS.applyProductSeo,
        { productId: insight.productId },
        shop,
      );
      setInsight(data.applyProductSeo);
      setApplySuccess("AI SEO improvements applied to Shopify.");
      onCreditsRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply SEO improvements");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="tidysync-seo-studio">
      <div className="tidysync-seo-header">
        <BlockStack gap="100">
          <Text as="h3" variant="headingMd">Product SEO intelligence</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Select a product for a deep SEO audit with scores, charts, and an AI strategist briefing.
            Each analysis uses <strong>1 AI credit</strong>.
          </Text>
        </BlockStack>
        <Badge tone="info">{`${String(creditsRemaining ?? "—")} credits left`}</Badge>
      </div>

      <div className="tidysync-seo-search">
        <TextField
          label="Search products"
          labelHidden
          value={search}
          onChange={setSearch}
          placeholder="Search by title or SKU…"
          autoComplete="off"
          connectedRight={
            <Button onClick={() => loadProducts(search)}>Search</Button>
          }
        />
      </div>

      {error && (
        <div className="tidysync-seo-error">
          <Text as="p" variant="bodySm">{error}</Text>
        </div>
      )}

      <div className="tidysync-seo-layout">
        <div className="tidysync-seo-product-list">
          {loadingList ? (
            <div className="tidysync-seo-list-loading">
              <Spinner size="small" />
              <Text as="p" variant="bodySm" tone="subdued">Loading catalog…</Text>
            </div>
          ) : products.length === 0 ? (
            <Text as="p" variant="bodySm" tone="subdued">No products found.</Text>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tidysync-seo-product-card${selectedId === p.id ? " is-selected" : ""}`}
                onClick={() => analyze(p.id)}
                disabled={analyzing || applying}
              >
                {p.featuredImageUrl ? (
                  <img src={p.featuredImageUrl} alt="" className="tidysync-seo-product-thumb" />
                ) : (
                  <div className="tidysync-seo-product-thumb tidysync-seo-product-thumb--empty" />
                )}
                <div className="tidysync-seo-product-meta">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">{p.title}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{p.handle ?? p.status}</Text>
                </div>
                <span className="tidysync-seo-product-cta">1 credit</span>
              </button>
            ))
          )}
        </div>

        <div className="tidysync-seo-insight-panel">
          {analyzing && (
            <div className="tidysync-seo-insight-loading">
              <Spinner />
              <Text as="p" variant="bodyMd">Analyzing {selectedProduct?.title ?? "product"}…</Text>
              <Text as="p" variant="bodySm" tone="subdued">Computing metrics and generating AI briefing</Text>
            </div>
          )}

          {!analyzing && !insight && (
            <div className="tidysync-seo-insight-empty">
              <Text as="p" variant="headingSm">Select a product</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Click any product on the left to run a full SEO insight report.
              </Text>
            </div>
          )}

          {!analyzing && insight && (
            <BlockStack gap="500">
              <InlineStack gap="400" blockAlign="start" wrap>
                {insight.featuredImageUrl && (
                  <img
                    src={insight.featuredImageUrl}
                    alt=""
                    className="tidysync-seo-insight-image"
                  />
                )}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">{insight.title}</Text>
                  {insight.handle && (
                    <Text as="p" variant="bodySm" tone="subdued">/{insight.handle}</Text>
                  )}
                  <InlineStack gap="200" wrap>
                    <Button
                      variant="primary"
                      onClick={() => applySeo()}
                      loading={applying}
                      disabled={analyzing || applying}
                    >
                      Apply AI SEO improvements (1 credit)
                    </Button>
                  </InlineStack>
                  {applySuccess && (
                    <Text as="p" variant="bodySm" tone="success">{applySuccess}</Text>
                  )}
                </BlockStack>
              </InlineStack>

              <div className="tidysync-seo-score-grid">
                <ScoreRing score={insight.metrics.overallScore} />
                <div className="tidysync-seo-metrics-stack">
                  <MetricBar label="Title" score={insight.metrics.titleScore} />
                  <MetricBar label="Meta tags" score={insight.metrics.metaScore} />
                  <MetricBar label="Description" score={insight.metrics.descriptionScore} />
                  <MetricBar label="Media & alt" score={insight.metrics.mediaScore} />
                  <MetricBar label="Readability" score={insight.metrics.readabilityScore} />
                </div>
              </div>

              <div className="tidysync-seo-kpi-grid">
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{insight.metrics.titleLength}</span>
                  <span className="tidysync-seo-kpi-label">Title chars</span>
                </div>
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{insight.metrics.metaDescriptionLength}</span>
                  <span className="tidysync-seo-kpi-label">Meta desc</span>
                </div>
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{insight.metrics.descriptionWordCount}</span>
                  <span className="tidysync-seo-kpi-label">Desc words</span>
                </div>
                <div className="tidysync-seo-kpi">
                  <span className="tidysync-seo-kpi-value">{insight.metrics.imageCount}</span>
                  <span className="tidysync-seo-kpi-label">Images</span>
                </div>
              </div>

              <BlockStack gap="200">
                <Text as="h4" variant="headingSm">Checklist</Text>
                {insight.metrics.checks.map((check) => (
                  <div key={check.id} className={`tidysync-seo-check is-${check.status}`}>
                    <Badge tone={check.status === "pass" ? "success" : check.status === "warn" ? "warning" : "critical"}>
                      {check.label}
                    </Badge>
                    <Text as="p" variant="bodySm">{check.detail}</Text>
                  </div>
                ))}
              </BlockStack>

              <div className="tidysync-seo-ai-panel">
                <Text as="h4" variant="headingSm">AI strategist briefing</Text>
                <div className="tidysync-seo-ai-body">
                  {insight.aiExplanation.split("\n").map((line, i) =>
                    line.trim() ? (
                      <p key={i} className="tidysync-seo-ai-line">{line}</p>
                    ) : null,
                  )}
                </div>
              </div>
            </BlockStack>
          )}
        </div>
      </div>
    </div>
  );
}
