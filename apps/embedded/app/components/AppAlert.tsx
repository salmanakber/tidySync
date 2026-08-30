"use client";

import { Banner } from "@shopify/polaris";
import type { AppAlertModel } from "../lib/graphql-errors";

export type { AppAlertModel };

interface AppAlertProps extends Omit<AppAlertModel, "id"> {
  onDismiss?: () => void;
}

export function AppAlert({
  tone,
  title,
  message,
  primaryAction,
  secondaryAction,
  onDismiss,
}: AppAlertProps) {
  return (
    <Banner
      tone={tone}
      title={title}
      onDismiss={onDismiss}
      action={primaryAction}
      secondaryAction={secondaryAction}
    >
      {message}
    </Banner>
  );
}

interface AppAlertStackProps {
  alerts: AppAlertModel[];
  onDismiss?: (id: string) => void;
}

export function AppAlertStack({ alerts, onDismiss }: AppAlertStackProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="tidysync-alert-stack">
      {alerts.map((alert) => (
        <AppAlert
          key={alert.id}
          tone={alert.tone}
          title={alert.title}
          message={alert.message}
          primaryAction={alert.primaryAction}
          secondaryAction={alert.secondaryAction}
          onDismiss={onDismiss ? () => onDismiss(alert.id) : undefined}
        />
      ))}
    </div>
  );
}
