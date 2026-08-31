"use client";

import { useState } from "react";
import { Icon } from "@shopify/polaris";
import {
  ImportIcon,
  ExportIcon,
  MagicIcon,
  ProductIcon,
  ClockIcon,
  CalendarIcon,
  CashDollarIcon,
  AlertTriangleIcon,
  AutomationIcon,
  DatabaseIcon,
  CaretDownIcon,
} from "@shopify/polaris-icons";

export interface WorkspaceTab {
  id: string;
  content: string;
  badge?: string;
}

interface NavGroup {
  label: string;
  ids: string[];
  defaultOpen?: boolean;
}

interface WorkspaceNavProps {
  tabs: WorkspaceTab[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

const TAB_ICONS: Record<string, typeof ImportIcon> = {
  home: ProductIcon,
  jobs: ClockIcon,
  migrate: ImportIcon,
  import: ImportIcon,
  export: ExportIcon,
  duplicates: ProductIcon,
  ai: MagicIcon,
  seo: ProductIcon,
  health: AlertTriangleIcon,
  audit: DatabaseIcon,
  schedules: CalendarIcon,
  settings: CashDollarIcon,
  agent: AutomationIcon,
  backups: DatabaseIcon,
};

const NAV_GROUPS: NavGroup[] = [
  { label: "Overview", ids: ["home", "jobs"], defaultOpen: true },
  { label: "Catalog", ids: ["migrate", "import", "export", "duplicates"], defaultOpen: true },
  { label: "Intelligence", ids: ["agent", "ai", "seo"], defaultOpen: true },
  { label: "Vault & health", ids: ["backups", "health"], defaultOpen: false },
  { label: "Admin", ids: ["schedules", "audit", "settings"], defaultOpen: false },
];

export function WorkspaceNav({ tabs, activeIndex, onSelect }: WorkspaceNavProps) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const g of NAV_GROUPS) {
      init[g.label] = g.defaultOpen ?? true;
    }
    return init;
  });

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <aside className="tidysync-sidebar" aria-label="Workspace navigation">
      <div className="tidysync-sidebar-brand">
        <span className="tidysync-sidebar-mark" />
        <div>
          <span className="tidysync-sidebar-title">TidySync</span>
          <span className="tidysync-sidebar-sub">Catalog workspace</span>
        </div>
      </div>

      <nav className="tidysync-sidebar-nav">
        {NAV_GROUPS.map((group) => {
          const items = group.ids
            .map((id) => {
              const index = tabs.findIndex((t) => t.id === id);
              if (index < 0) return null;
              return { index, tab: tabs[index], icon: TAB_ICONS[id] ?? ProductIcon };
            })
            .filter((x): x is NonNullable<typeof x> => x != null);

          if (items.length === 0) return null;

          const isOpen = openGroups[group.label];
          const hasActive = items.some((i) => i.index === activeIndex);

          return (
            <div key={group.label} className={`tidysync-sidebar-group${hasActive ? " has-active" : ""}`}>
              <button
                type="button"
                className="tidysync-sidebar-group-toggle"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={isOpen}
              >
                <span>{group.label}</span>
                <Icon source={CaretDownIcon} />
              </button>
              {isOpen && (
                <ul className="tidysync-sidebar-list">
                  {items.map(({ index, tab, icon }) => (
                    <li key={tab.id}>
                      <button
                        type="button"
                        className={`tidysync-sidebar-link${activeIndex === index ? " is-active" : ""}`}
                        onClick={() => onSelect(index)}
                      >
                        <Icon source={icon} />
                        <span>{tab.content}</span>
                        {tab.badge && <span className="tidysync-sidebar-badge">{tab.badge}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
