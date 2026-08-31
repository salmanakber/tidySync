"use client";

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
} from "@shopify/polaris-icons";

export interface WorkspaceTab {
  id: string;
  content: string;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: Array<{ index: number; tab: WorkspaceTab; icon: typeof ImportIcon }>;
}

interface WorkspaceNavProps {
  tabs: WorkspaceTab[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

const TAB_ICONS: Record<string, typeof ImportIcon> = {
  home: ProductIcon,
  jobs: ClockIcon,
  import: ImportIcon,
  export: ExportIcon,
  ai: MagicIcon,
  seo: ProductIcon,
  health: AlertTriangleIcon,
  audit: DatabaseIcon,
  schedules: CalendarIcon,
  settings: CashDollarIcon,
  agent: AutomationIcon,
  backups: DatabaseIcon,
};

const NAV_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: "Overview", ids: ["home", "jobs"] },
  { label: "Catalog", ids: ["import", "export"] },
  { label: "Intelligence", ids: ["ai", "seo", "agent"] },
  { label: "Vault & health", ids: ["backups", "health"] },
  { label: "Admin", ids: ["audit", "schedules", "settings"] },
];

export function WorkspaceNav({ tabs, activeIndex, onSelect }: WorkspaceNavProps) {
  const groups: NavGroup[] = NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.ids
      .map((id) => {
        const index = tabs.findIndex((t) => t.id === id);
        if (index < 0) return null;
        return {
          index,
          tab: tabs[index],
          icon: TAB_ICONS[id] ?? ProductIcon,
        };
      })
      .filter((x): x is NavGroup["items"][number] => x != null),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="tidysync-sidebar" aria-label="Workspace navigation">
      <div className="tidysync-sidebar-brand">
        <span className="tidysync-sidebar-mark" />
        <div>
          <span className="tidysync-sidebar-title">Workspace</span>
          <span className="tidysync-sidebar-sub">TidySync control center</span>
        </div>
      </div>

      <nav className="tidysync-sidebar-nav">
        {groups.map((group) => (
          <div key={group.label} className="tidysync-sidebar-group">
            <span className="tidysync-sidebar-group-label">{group.label}</span>
            <ul className="tidysync-sidebar-list">
              {group.items.map(({ index, tab, icon }) => {
                const active = activeIndex === index;
                const isPremium = tab.id === "agent" || tab.id === "backups";
                return (
                  <li key={tab.id}>
                    <button
                      type="button"
                      className={`tidysync-sidebar-link${active ? " is-active" : ""}${isPremium ? " is-premium" : ""}`}
                      onClick={() => onSelect(index)}
                      aria-current={active ? "page" : undefined}
                    >
                      <span className="tidysync-sidebar-link-icon">
                        <Icon source={icon} />
                      </span>
                      <span className="tidysync-sidebar-link-text">{tab.content}</span>
                      {tab.id === "agent" && (
                        <span className="tidysync-sidebar-pill">AI</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
