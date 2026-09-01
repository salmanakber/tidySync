"use client";

import { Button } from "@shopify/polaris";

interface PlanUpgradePanelProps {
  title: string;
  message: string;
  upgradeLabel?: string;
  onUpgrade?: () => void;
}

export function PlanUpgradePanel({
  title,
  message,
  upgradeLabel = "View plans",
  onUpgrade,
}: PlanUpgradePanelProps) {
  return (
    <div className="tidysync-plan-gate">
      <div className="tidysync-plan-gate-inner">
        <span className="tidysync-plan-gate-badge">Plan upgrade</span>
        <h3 className="tidysync-plan-gate-title">{title}</h3>
        <p className="tidysync-plan-gate-message">{message}</p>
        {onUpgrade ? (
          <Button variant="primary" onClick={onUpgrade}>
            {upgradeLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
