"use client";

import { Button, Icon } from "@shopify/polaris";
import {
  AutomationIcon,
  CalendarIcon,
  CashDollarIcon,
  DatabaseIcon,
  LockIcon,
  ProductIcon,
} from "@shopify/polaris-icons";

export type PlanGateFeature = "agent" | "schedules" | "audit" | "backups" | "catalog" | "generic";

interface PlanUpgradePanelProps {
  title: string;
  message: string;
  upgradeLabel?: string;
  onUpgrade?: () => void;
  feature?: PlanGateFeature;
  perks?: string[];
  currentPlan?: string;
}

const FEATURE_META: Record<
  PlanGateFeature,
  { icon: typeof LockIcon; label: string; accent: string }
> = {
  agent: { icon: AutomationIcon, label: "AI Agent", accent: "is-agent" },
  schedules: { icon: CalendarIcon, label: "Automation", accent: "is-schedule" },
  audit: { icon: DatabaseIcon, label: "Audit log", accent: "is-audit" },
  backups: { icon: DatabaseIcon, label: "Backups", accent: "is-backup" },
  catalog: { icon: ProductIcon, label: "Catalog limit", accent: "is-catalog" },
  generic: { icon: LockIcon, label: "Premium feature", accent: "is-generic" },
};

const DEFAULT_PERKS: Record<PlanGateFeature, string[]> = {
  agent: ["10+ agent runs / month", "Multi-step catalog missions", "Background job orchestration"],
  schedules: ["Daily exports", "Weekly health scans", "Google Sheets auto-sync"],
  audit: ["Full activity history", "Compliance CSV export", "Support-ready event trail"],
  backups: ["More saved snapshots", "Longer retention", "Restore with filters"],
  catalog: ["Higher product ceiling", "Larger imports", "Room to grow your catalog"],
  generic: ["More AI credits", "Higher limits", "Priority automation"],
};

export function PlanUpgradePanel({
  title,
  message,
  upgradeLabel = "View plans",
  onUpgrade,
  feature = "generic",
  perks,
  currentPlan,
}: PlanUpgradePanelProps) {
  const meta = FEATURE_META[feature];
  const perkList = perks ?? DEFAULT_PERKS[feature];

  return (
    <div className={`tidysync-plan-gate tidysync-plan-gate--${meta.accent}`}>
      <div className="tidysync-plan-gate-aura" aria-hidden="true" />
      <div className="tidysync-plan-gate-grid">
        <div className="tidysync-plan-gate-visual">
          <div className="tidysync-plan-gate-icon-ring">
            <Icon source={meta.icon} />
          </div>
          <div className="tidysync-plan-gate-lock">
            <Icon source={LockIcon} />
          </div>
        </div>

        <div className="tidysync-plan-gate-body">
          <div className="tidysync-plan-gate-head">
            <span className="tidysync-plan-gate-badge">{meta.label}</span>
            {currentPlan ? (
              <span className="tidysync-plan-gate-plan">Current: {currentPlan}</span>
            ) : null}
          </div>
          <h3 className="tidysync-plan-gate-title">{title}</h3>
          <p className="tidysync-plan-gate-message">{message}</p>

          <ul className="tidysync-plan-gate-perks">
            {perkList.map((perk) => (
              <li key={perk}>
                <span className="tidysync-plan-gate-perk-dot" />
                {perk}
              </li>
            ))}
          </ul>

          {onUpgrade ? (
            <div className="tidysync-plan-gate-actions">
              <Button variant="primary" onClick={onUpgrade}>
                {upgradeLabel}
              </Button>
              <button type="button" className="tidysync-plan-gate-link" onClick={onUpgrade}>
                <Icon source={CashDollarIcon} />
                Compare all plans
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
