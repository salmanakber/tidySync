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
  { label: "variants.weight", value: "variants.weight" },
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
  const targetOptions = targetsForResource(resourceType);

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
      await gqlRequest(
        MUTATIONS.updateMappings,
        {
          jobId,
          mappings: mappings.map(({ sourceColumn, targetField }) => ({
            sourceColumn,
            targetField,
          })),
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
