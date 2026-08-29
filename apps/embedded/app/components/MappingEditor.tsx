"use client";

import { useState } from "react";
import {
  BlockStack,
  Select,
  Text,
  Button,
  IndexTable,
  TextField,
} from "@shopify/polaris";
import { gqlRequest, MUTATIONS } from "../lib/graphql";

interface MappingRow {
  sourceColumn: string;
  targetField: string;
  suggested?: boolean;
}

const PRODUCT_TARGETS = [
  { label: "— Skip —", value: "" },
  { label: "title", value: "title" },
  { label: "descriptionHtml", value: "descriptionHtml" },
  { label: "vendor", value: "vendor" },
  { label: "productType", value: "productType" },
  { label: "tags", value: "tags" },
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

export function MappingEditor({
  shop,
  jobId,
  platformKey,
  resourceType = "products",
  initialMappings,
  templates = [],
  onComplete,
}: {
  shop: string;
  jobId: string;
  platformKey: string;
  resourceType?: string;
  initialMappings: MappingRow[];
  templates?: Array<{ id: string; name: string; mappings: MappingRow[] }>;
  onComplete: () => void;
}) {
  const [mappings, setMappings] = useState<MappingRow[]>(initialMappings);
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const targetOptions = targetsForResource(resourceType);

  const updateRow = (index: number, targetField: string) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, targetField } : m)),
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
        return match ? { ...row, targetField: match.targetField } : row;
      }),
    );
  };

  const applyPreview = async () => {
    setLoading(true);
    try {
      await gqlRequest(MUTATIONS.updateMappings, { jobId, mappings }, shop);
      onComplete();
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

  return (
    <BlockStack gap="400">
      {templates.length > 0 && (
        <Select
          label="Apply saved template"
          options={[
            { label: "— None —", value: "" },
            ...templates.map((t) => ({ label: t.name, value: t.id })),
          ]}
          value=""
          onChange={applyTemplate}
        />
      )}
      <IndexTable
        resourceName={{ singular: "column", plural: "columns" }}
        itemCount={mappings.length}
        headings={[
          { title: "Source column" },
          { title: "Shopify field" },
          { title: "AI suggested" },
        ]}
        selectable={false}
      >
        {mappings.map((row, index) => (
          <IndexTable.Row id={row.sourceColumn} key={row.sourceColumn} position={index}>
            <IndexTable.Cell>{row.sourceColumn}</IndexTable.Cell>
            <IndexTable.Cell>
              <Select
                label=""
                labelHidden
                options={targetOptions}
                value={row.targetField}
                onChange={(v) => updateRow(index, v)}
              />
            </IndexTable.Cell>
            <IndexTable.Cell>{row.suggested ? "Yes" : "—"}</IndexTable.Cell>
          </IndexTable.Row>
        ))}
      </IndexTable>
      <TextField
        label="Save as template name"
        value={templateName}
        onChange={setTemplateName}
        autoComplete="off"
      />
      <Button onClick={saveTemplate} disabled={!templateName.trim()}>
        Save mapping template
      </Button>
      <Button variant="primary" onClick={applyPreview} loading={loading}>
        Preview import changes
      </Button>
    </BlockStack>
  );
}
