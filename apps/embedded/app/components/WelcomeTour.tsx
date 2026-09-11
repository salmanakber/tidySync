"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Text, BlockStack, InlineStack, Badge } from "@shopify/polaris";
import {
  ImportIcon,
  ExportIcon,
  MagicIcon,
  AutomationIcon,
  ProductIcon,
  CashDollarIcon,
} from "@shopify/polaris-icons";
import { Icon } from "@shopify/polaris";

export type WelcomePlanKind = "free" | "paid";

interface TourStep {
  id: string;
  title: string;
  body: string;
  tabIndex: number;
  icon: typeof ImportIcon;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "home",
    title: "Home",
    body: "Your command center — quick actions for import, export, AI edit, and store health.",
    tabIndex: 0,
    icon: ProductIcon,
  },
  {
    id: "import",
    title: "Import",
    body: "Upload CSV/XLSX or connect Google Sheets. Map columns, preview every change, then approve.",
    tabIndex: 3,
    icon: ImportIcon,
  },
  {
    id: "export",
    title: "Export",
    body: "Pull products and other resources into platform-ready files whenever you need a backup copy.",
    tabIndex: 4,
    icon: ExportIcon,
  },
  {
    id: "ai",
    title: "AI Edit",
    body: "Describe a catalog change in plain English — TidySync builds a plan and diff before anything goes live.",
    tabIndex: 6,
    icon: MagicIcon,
  },
  {
    id: "agent",
    title: "AI Agent",
    body: "Run multi-step missions like SEO polish or store fixes. Review the plan, then apply when ready.",
    tabIndex: 12,
    icon: AutomationIcon,
  },
  {
    id: "billing",
    title: "Billing",
    body: "Change plans or buy AI credits anytime. Paid upgrades and credit packs go through Shopify checkout.",
    tabIndex: 11,
    icon: CashDollarIcon,
  },
];

interface WelcomeTourProps {
  open: boolean;
  planKind: WelcomePlanKind;
  planName: string;
  onClose: () => void;
  onGoToTab: (index: number) => void;
}

const STORAGE_KEY = "tidysync_welcome_tour_v1";

export function shouldAutoStartWelcomeTour(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "done";
  } catch {
    return true;
  }
}

export function markWelcomeTourDone() {
  try {
    localStorage.setItem(STORAGE_KEY, "done");
  } catch {
    /* ignore */
  }
}

export function WelcomeTour({ open, planKind, planName, onClose, onGoToTab }: WelcomeTourProps) {
  const [phase, setPhase] = useState<"welcome" | "tour">("welcome");
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) {
      setPhase("welcome");
      setStep(0);
    }
  }, [open]);

  const finish = useCallback(() => {
    markWelcomeTourDone();
    onClose();
    onGoToTab(0);
  }, [onClose, onGoToTab]);

  const startTour = () => {
    setPhase("tour");
    setStep(0);
    onGoToTab(TOUR_STEPS[0].tabIndex);
  };

  const current = TOUR_STEPS[step];
  const isLast = step >= TOUR_STEPS.length - 1;

  if (!open) return null;

  if (phase === "welcome") {
    return (
      <Modal
        open
        onClose={finish}
        title="Welcome to TidySync"
        primaryAction={{
          content: "Take a quick tour",
          onAction: startTour,
        }}
        secondaryActions={[
          {
            content: "Explore on my own",
            onAction: finish,
          },
        ]}
      >
        <Modal.Section>
          <div className="tidysync-welcome-hero">
            <div className="tidysync-welcome-orb" aria-hidden="true" />
            <BlockStack gap="400">
              <InlineStack gap="200" blockAlign="center">
                <Badge tone="success">Setup complete</Badge>
                <Text as="span" variant="bodySm" tone="subdued">
                  {planKind === "free" ? "Free plan" : `${planName} plan`}
                </Text>
              </InlineStack>
              <Text as="h2" variant="headingLg">
                You&apos;re ready to tidy your catalog
              </Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                {planKind === "free"
                  ? "Import, export, and core tools are unlocked. Take a 30-second tour of the workspace — or jump straight in."
                  : `Thanks for choosing ${planName}. Premium tools are unlocked for your store. A short tour helps you find AI Edit, Agent, and more.`}
              </Text>
              <ul className="tidysync-welcome-perks">
                <li>Preview every change before it hits Shopify</li>
                <li>Use @mentions to target specific products</li>
                <li>Upgrade or buy AI credits anytime in Billing</li>
              </ul>
            </BlockStack>
          </div>
        </Modal.Section>
      </Modal>
    );
  }

  return (
    <div className="tidysync-tour-layer" role="dialog" aria-modal="true" aria-label="Feature tour">
      <div className="tidysync-tour-card">
        <div className="tidysync-tour-card-icon">
          <Icon source={current.icon} />
        </div>
        <div className="tidysync-tour-progress">
          Step {step + 1} of {TOUR_STEPS.length}
        </div>
        <Text as="h3" variant="headingMd">
          {current.title}
        </Text>
        <Text as="p" variant="bodyMd" tone="subdued">
          {current.body}
        </Text>
        <div className="tidysync-tour-actions">
          <Button
            onClick={() => {
              if (step === 0) {
                setPhase("welcome");
                return;
              }
              const prev = step - 1;
              setStep(prev);
              onGoToTab(TOUR_STEPS[prev].tabIndex);
            }}
          >
            Back
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (isLast) {
                finish();
                return;
              }
              const next = step + 1;
              setStep(next);
              onGoToTab(TOUR_STEPS[next].tabIndex);
            }}
          >
            {isLast ? "Finish tour" : "Next"}
          </Button>
        </div>
        <button type="button" className="tidysync-tour-skip" onClick={finish}>
          Skip tour
        </button>
      </div>
    </div>
  );
}
