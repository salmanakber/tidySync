"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BlockStack,
  Select,
  Text,
  Button,
  TextField,
  Banner,
  InlineStack,
  Badge,
  ProgressBar,
} from "@shopify/polaris";
import { gqlRequest, MUTATIONS } from "../lib/graphql";
import {
  IMPORT_REQUIRED_BY_RESOURCE,
  isFieldMapped,
  validateImportMappings,
  IMPORT_CONDITION_PRESETS,
  type ImportDefaults,
  type ImportCondition,
} from "@tidysync/shared/import-settings";

interface MappingRow {
  sourceColumn: string;
  targetField: string;
  suggested?: boolean;
  confidence?: number;
  matchReason?: string | null;
}

const PRODUCT_TARGETS = [
  { label: "— Skip —", value: "" },
  { label: "title", value: "title" },
  { label: "descriptionHtml", value: "descriptionHtml" },
  { label: "vendor", value: "vendor" },
  { label: "productType", value: "productType" },
  { label: "tags", value: "tags" },
  { label: "status", value: "status" },
  { label: "variants.sku", value: "variants.sku" },
  { label: "variants.price", value: "variants.price" },
  { label: "variants.compareAtPrice", value: "variants.compareAtPrice" },
  { label: "variants.inventoryQuantity", value: "variants.inventoryQuantity" },
  { label: "variants.barcode", value: "variants.barcode" },
  { label: "images", value: "images" },
];

const COLLECTION_TARGETS = [
  { label: "— Skip —", value: "" },
  { label: "title", value: "title" },
  { label: "handle", value: "handle" },
  { label: "descriptionHtml", value: "descriptionHtml" },
  { label: "sortOrder", value: "sortOrder" },
  { label: "ruleSet", value: "ruleSet" },
];

const CUSTOMER_TARGETS = [
  { label: "— Skip —", value: "" },
  { label: "email", value: "email" },
  { label: "firstName", value: "firstName" },
  { label: "lastName", value: "lastName" },
  { label: "phone", value: "phone" },
  { label: "tags", value: "tags" },
  { label: "note", value: "note" },
  { label: "acceptsMarketing", value: "acceptsMarketing" },
  { label: "address1", value: "address1" },
  { label: "city", value: "city" },
  { label: "province", value: "province" },
  { label: "country", value: "country" },
  { label: "zip", value: "zip" },
];

const METAFIELD_TARGETS = [
  { label: "— Skip —", value: "" },
  { label: "ownerId", value: "ownerId" },
  { label: "ownerType", value: "ownerType" },
  { label: "namespace", value: "namespace" },
  { label: "key", value: "key" },
  { label: "value", value: "value" },
  { label: "type", value: "type" },
  { label: "description", value: "description" },
];

const DISCOUNT_TARGETS = [
  { label: "— Skip —", value: "" },
  { label: "title", value: "title" },
  { label: "code", value: "code" },
  { label: "valueType", value: "valueType" },
  { label: "value", value: "value" },
  { label: "startsAt", value: "startsAt" },
  { label: "endsAt", value: "endsAt" },
  { label: "usageLimit", value: "usageLimit" },
  { label: "appliesOncePerCustomer", value: "appliesOncePerCustomer" },
];

function targetsForResource(resourceType: string) {
  if (resourceType === "collections") return COLLECTION_TARGETS;
  if (resourceType === "customers") return CUSTOMER_TARGETS;
  if (resourceType === "metafields") return METAFIELD_TARGETS;
  if (resourceType === "discounts") return DISCOUNT_TARGETS;
  return PRODUCT_TARGETS;
}

function matchTone(confidence?: number, suggested?: boolean): "success" | "attention" | "warning" | undefined {
  if (!suggested || !confidence) return undefined;
  if (confidence >= 0.85) return "success";
  if (confidence >= 0.65) return "attention";
  return "warning";
}

export function MappingEditor({
  shop,
  jobId,
  platformKey,
  resourceType = "products",
  initialMappings,
  templates = [],
  onComplete,
  onRemap,
}: {
  shop: string;
  jobId: string;
  platformKey: string;
  resourceType?: string;
  initialMappings: MappingRow[];
  templates?: Array<{ id: string; name: string; mappings: MappingRow[] }>;
  onComplete: () => void;
  onRemap?: () => Promise<MappingRow[]>;
}) {
  const [mappings, setMappings] = useState<MappingRow[]>(initialMappings);
  const [loading, setLoading] = useState(false);
  const [loadingMappings, setLoadingMappings] = useState(initialMappings.length === 0);
  const [remapping, setRemapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [defaults, setDefaults] = useState<ImportDefaults>({
    price: "",
    vendor: "",
    status: "ACTIVE",
    title: "",
    skuPrefix: "",
  });
  const [aiPolishDescriptions, setAiPolishDescriptions] = useState(false);
  const [aiPolishTitles, setAiPolishTitles] = useState(false);
  const [brandVoice, setBrandVoice] = useState("professional, helpful, SEO-optimized");
  const [polishSamples, setPolishSamples] = useState<
    Array<{ rowIndex: number; field: string; before: string; after: string }>
  >([]);
  const [polishing, setPolishing] = useState(false);
  const [conditions, setConditions] = useState<ImportCondition[]>([]);
  const targetOptions = targetsForResource(resourceType);
  const requiredFields = IMPORT_REQUIRED_BY_RESOURCE[resourceType] ?? IMPORT_REQUIRED_BY_RESOURCE.products;

  const requirementStatus = useMemo(() => {
    return requiredFields.map((req) => ({
      ...req,
      satisfied:
        isFieldMapped(mappings, req.field) ||
        (req.field === "variants.price" && defaults.price?.trim()) ||
        (req.field === "title" && defaults.title?.trim()),
    }));
  }, [requiredFields, mappings, defaults]);

  const validation = useMemo(
    () => validateImportMappings(resourceType, mappings, defaults),
    [resourceType, mappings, defaults],
  );

  useEffect(() => {
    if (initialMappings.length > 0) {
      setMappings(initialMappings);
      setLoadingMappings(false);
      return;
    }
    let cancelled = false;
    setLoadingMappings(true);
    gqlRequest<{
      suggestFieldMappings: MappingRow[];
    }>(
      MUTATIONS.suggestMappings,
      { jobId, platformKey, useAi: false },
      shop,
    )
      .then((data) => {
        if (!cancelled) setMappings(data.suggestFieldMappings);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load column mappings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMappings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, platformKey, shop, initialMappings.length]);

  const stats = useMemo(() => {
    const matched = mappings.filter((m) => m.targetField).length;
    const total = mappings.length || 1;
    return {
      matched,
      unmatched: mappings.length - matched,
      pct: Math.round((matched / total) * 100),
    };
  }, [mappings]);

  const updateRow = (index: number, targetField: string) => {
    setMappings((prev) =>
      prev.map((m, i) =>
        i === index
          ? {
              ...m,
              targetField,
              suggested: Boolean(targetField),
              confidence: targetField ? m.confidence ?? 1 : 0,
              matchReason: targetField ? m.matchReason ?? "manual" : "unmatched",
            }
          : m,
      ),
    );
  };

  const applyTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template?.mappings) return;
    setMappings((prev) =>
      prev.map((row) => {
        const match = (template.mappings as MappingRow[]).find(
          (m) => m.sourceColumn === row.sourceColumn,
        );
        return match
          ? {
              ...row,
              targetField: match.targetField,
              suggested: true,
              confidence: 1,
              matchReason: "template",
            }
          : row;
      }),
    );
  };

  const applyPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!mappings.some((m) => m.targetField)) {
        throw new Error("Map at least one column before previewing.");
      }
      if (!validation.ok) {
        throw new Error(
          `Required: ${validation.missing.map((m) => m.label).join(", ")}. Map a column or set a default below.`,
        );
      }
      await gqlRequest(
        MUTATIONS.updateMappings,
        {
          jobId,
          mappings: {
            mappings: mappings.map(({ sourceColumn, targetField }) => ({
              sourceColumn,
              targetField,
            })),
            defaults,
            aiPolish:
              aiPolishDescriptions || aiPolishTitles
                ? {
                    descriptions: aiPolishDescriptions,
                    titles: aiPolishTitles,
                    brandVoice,
                  }
                : null,
            conditions: conditions.length > 0 ? conditions : null,
          },
        },
        shop,
      );
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setLoading(false);
    }
  };

  const previewPolish = async () => {
    setPolishing(true);
    setError(null);
    try {
      if (!isFieldMapped(mappings, "descriptionHtml")) {
        throw new Error("Map a column to descriptionHtml before previewing AI polish.");
      }
      await gqlRequest(
        MUTATIONS.updateMappings,
        {
          jobId,
          mappings: {
            mappings: mappings.map(({ sourceColumn, targetField }) => ({
              sourceColumn,
              targetField,
            })),
            defaults,
            aiPolish: null,
          },
        },
        shop,
      );
      const data = await gqlRequest<{
        polishImportSample: { rows: typeof polishSamples; creditsUsed: number };
      }>(MUTATIONS.polishImportSample, { jobId, brandVoice }, shop);
      setPolishSamples(data.polishImportSample.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI polish preview failed");
    } finally {
      setPolishing(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    await gqlRequest(
      MUTATIONS.saveTemplate,
      { name: templateName, platformKey, mappings },
      shop,
    );
  };

  const runRemap = async () => {
    if (!onRemap) return;
    setRemapping(true);
    setError(null);
    try {
      const next = await onRemap();
      setMappings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI remap failed");
    } finally {
      setRemapping(false);
    }
  };

  return (
    <BlockStack gap="400">
      <div className="tidysync-mapping-summary">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h3" variant="headingSm">
              Column mapping
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Matched columns are highlighted. Review AI / auto suggestions before preview.
            </Text>
          </BlockStack>
          <Badge tone={stats.pct >= 70 ? "success" : "attention"}>
            {`${stats.matched}/${mappings.length} matched`}
          </Badge>
        </InlineStack>
        <div style={{ marginTop: 10 }}>
          <ProgressBar progress={stats.pct} size="small" tone="primary" />
        </div>
      </div>

      {error && (
        <Banner tone="critical" onDismiss={() => setError(null)}>
          {error}
        </Banner>
      )}

      {resourceType === "products" && (
        <div className="tidysync-mapping-required">
          <Text as="h4" variant="headingSm">Required for Shopify API</Text>
          <div className="tidysync-required-grid">
            {requirementStatus.map((req) => (
              <div
                key={req.field}
                className={`tidysync-required-item${req.satisfied ? " is-ok" : " is-missing"}`}
              >
                <Badge tone={req.satisfied ? "success" : "critical"}>{req.label}</Badge>
                <Text as="p" variant="bodySm" tone="subdued">{req.hint}</Text>
              </div>
            ))}
          </div>
          {!validation.ok && (
            <Banner tone="warning">
              Map required fields above or set defaults in the panel below before previewing.
            </Banner>
          )}
        </div>
      )}

      {resourceType === "products" && (
        <div className="tidysync-mapping-defaults">
          <Text as="h4" variant="headingSm">Defaults when a column is not mapped</Text>
          <div className="tidysync-defaults-grid">
            <TextField
              label="Default price"
              value={defaults.price ?? ""}
              onChange={(v) => setDefaults((d) => ({ ...d, price: v }))}
              placeholder="e.g. 29.99"
              autoComplete="off"
              helpText="Used when no price column is mapped"
            />
            <TextField
              label="Default vendor"
              value={defaults.vendor ?? ""}
              onChange={(v) => setDefaults((d) => ({ ...d, vendor: v }))}
              autoComplete="off"
            />
            <Select
              label="Product status"
              options={[
                { label: "Active", value: "ACTIVE" },
                { label: "Draft", value: "DRAFT" },
                { label: "Archived", value: "ARCHIVED" },
              ]}
              value={defaults.status ?? "ACTIVE"}
              onChange={(v) => setDefaults((d) => ({ ...d, status: v }))}
            />
            <TextField
              label="Title fallback pattern"
              value={defaults.title ?? ""}
              onChange={(v) => setDefaults((d) => ({ ...d, title: v }))}
              placeholder="Imported product {n}"
              autoComplete="off"
              helpText="Use {n} for row number"
            />
            <TextField
              label="SKU prefix"
              value={defaults.skuPrefix ?? ""}
              onChange={(v) => setDefaults((d) => ({ ...d, skuPrefix: v }))}
              placeholder="SKU"
              autoComplete="off"
            />
          </div>
        </div>
      )}

      {resourceType === "products" && (
        <div className="tidysync-mapping-conditions">
          <Text as="h4" variant="headingSm">Conditional import rules</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Apply actions when row data matches — e.g. if vendor equals Nike, reduce price 10%.
          </Text>
          <div className="tidysync-condition-presets">
            {IMPORT_CONDITION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="tidysync-chip"
                onClick={() =>
                  setConditions((prev) => [
                    ...prev,
                    { ...preset.condition, id: `cond-${Date.now()}-${prev.length}` },
                  ])
                }
              >
                + {preset.label}
              </button>
            ))}
          </div>
          {conditions.length > 0 && (
            <BlockStack gap="200">
              {conditions.map((c) => (
                <div key={c.id} className="tidysync-condition-card">
                  <Text as="p" variant="bodySm" fontWeight="semibold">
                    {c.label ?? `${c.field} ${c.operator} ${c.value}`}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">Action: {c.action}</Text>
                  <Button
                    size="slim"
                    onClick={() => setConditions((prev) => prev.filter((x) => x.id !== c.id))}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </BlockStack>
          )}
        </div>
      )}

      {resourceType === "products" && (
        <div className="tidysync-mapping-ai-polish">
          <InlineStack align="space-between" blockAlign="center" wrap>
            <BlockStack gap="100">
              <Text as="h4" variant="headingSm">AI catalog polish</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Rewrite descriptions (and optional titles) during import. Preview costs 1 credit; enabling polish on import costs 1 credit when you save preview.
              </Text>
            </BlockStack>
            <Badge tone="info">AI</Badge>
          </InlineStack>
          <div style={{ marginTop: 12 }}>
            <TextField
              label="Brand voice"
              value={brandVoice}
              onChange={setBrandVoice}
              autoComplete="off"
              multiline={2}
            />
          </div>
          <div className="tidysync-polish-actions">
            <label className="tidysync-check">
              <input
                type="checkbox"
                checked={aiPolishDescriptions}
                onChange={(e) => setAiPolishDescriptions(e.target.checked)}
              />
              Polish descriptions on import
            </label>
            <label className="tidysync-check">
              <input
                type="checkbox"
                checked={aiPolishTitles}
                onChange={(e) => setAiPolishTitles(e.target.checked)}
              />
              Polish titles on import
            </label>
            <Button onClick={previewPolish} loading={polishing} disabled={polishing}>
              Preview polish (1 credit)
            </Button>
          </div>
          {polishSamples.length > 0 && (
            <div className="tidysync-polish-samples">
              {polishSamples.map((s) => (
                <div key={s.rowIndex} className="tidysync-polish-sample">
                  <Text as="p" variant="bodySm" fontWeight="semibold">Row {s.rowIndex + 1}</Text>
                  <div className="tidysync-diff-row">
                    <span className="tidysync-diff-before">{s.before}</span>
                    <span className="tidysync-diff-after">{s.after}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loadingMappings && (
        <div style={{ marginTop: 8 }}>
          <Text as="p" variant="bodySm" tone="subdued">
            Matching columns…
          </Text>
          <div className="tidysync-shimmer-bar" style={{ marginTop: 10 }} />
        </div>
      )}

      <InlineStack gap="200" wrap>
        {onRemap && (
          <Button onClick={runRemap} loading={remapping}>
            Re-run AI matching
          </Button>
        )}
        {templates.length > 0 && (
          <div style={{ minWidth: 220, flex: 1 }}>
            <Select
              label="Apply saved template"
              labelHidden
              placeholder="Apply saved template"
              options={[
                { label: "Apply saved template…", value: "" },
                ...templates.map((t) => ({ label: t.name, value: t.id })),
              ]}
              value=""
              onChange={applyTemplate}
            />
          </div>
        )}
      </InlineStack>

      <div className="tidysync-mapping-list">
        {!loadingMappings &&
          mappings.map((row, index) => {
          const tone = matchTone(row.confidence, row.suggested && Boolean(row.targetField));
          return (
            <div
              key={row.sourceColumn}
              className={`tidysync-mapping-row${row.targetField ? " is-matched" : " is-unmatched"}`}
            >
              <div className="tidysync-mapping-source">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  {row.sourceColumn}
                </Text>
                <InlineStack gap="200">
                  {row.targetField ? (
                    <Badge tone={tone}>
                      {`${
                        row.matchReason === "ai"
                          ? "AI"
                          : row.matchReason === "platform profile"
                            ? "Profile"
                            : row.matchReason === "manual"
                              ? "Manual"
                              : "Auto"
                      }`}
                    </Badge>
                  ) : (
                    <Badge>Unmatched</Badge>
                  )}
                  {row.confidence != null && row.confidence > 0 && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {Math.round(row.confidence * 100)}%
                    </Text>
                  )}
                </InlineStack>
              </div>
              <div className="tidysync-mapping-arrow">→</div>
              <div className="tidysync-mapping-target">
                <Select
                  label="Shopify field"
                  labelHidden
                  options={targetOptions}
                  value={row.targetField}
                  onChange={(v) => updateRow(index, v)}
                />
              </div>
            </div>
          );
        })}
      </div>

      <InlineStack gap="200" wrap>
        <div style={{ flex: 1, minWidth: 180 }}>
          <TextField
            label="Save as template name"
            value={templateName}
            onChange={setTemplateName}
            autoComplete="off"
          />
        </div>
        <div style={{ alignSelf: "end" }}>
          <Button onClick={saveTemplate} disabled={!templateName.trim()}>
            Save template
          </Button>
        </div>
      </InlineStack>

      <Button variant="primary" onClick={applyPreview} loading={loading} fullWidth>
        Preview import changes
      </Button>
    </BlockStack>
  );
}
