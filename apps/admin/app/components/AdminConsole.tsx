"use client";

import { useEffect, useState, useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/graphql";

async function adminGql<T>(
  query: string,
  variables?: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-tidysync-admin-token"] = token;

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

interface Tenant {
  id: string;
  shopDomain: string;
  shopName?: string;
  status: string;
  billingStatus?: string;
  billingBypass?: boolean;
  installApproved?: boolean;
  adminNotes?: string;
  installedAt?: string;
  productCount: number;
  skuCount?: number;
  aiCreditsUsed: number;
  extraAiCredits?: number;
  plan?: { name: string; slug?: string; maxProducts?: number; aiCreditsPerMonth?: number; aiCreditsRemaining?: number };
}

interface TenantDetail {
  tenant: Tenant;
  jobStats: { total: number; running: number; failed: number; completed: number };
  recentJobs: Job[];
  billingCharges: Array<{ id: string; type: string; status: string; amountCents: number; createdAt: string }>;
  aiOperationsCount: number;
  auditLogCount: number;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  maxProducts: number;
  aiCreditsPerMonth: number;
  priceMonthlyCents: number;
  isFree: boolean;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  tenant?: { shopDomain: string };
}

interface Job {
  id: string;
  type: string;
  status: string;
  rowCount: number;
  successCount: number;
  failedCount: number;
  errorSummary?: string;
  createdAt: string;
}

interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  description?: string;
}

interface AuditLog {
  id: string;
  action: string;
  createdAt: string;
  tenant?: { shopDomain: string };
}

type Tab = "overview" | "tenants" | "tenant-detail" | "jobs" | "billing" | "flags" | "apikeys" | "health" | "audit";

export function AdminConsole() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [health, setHealth] = useState<Record<string, unknown>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null);
  const [tenantNotes, setTenantNotes] = useState("");
  const [grantCredits, setGrantCredits] = useState("10");
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("tidysync_admin_token");
    if (saved) setToken(saved);
  }, []);

  const loadData = async (authToken: string) => {
    try {
      const [tenantsData, jobsData, statsData, flagsData, auditData, plansData, healthData, keysData] =
        await Promise.all([
        adminGql<{ adminTenants: Tenant[] }>(
          `query { adminTenants(limit: 100) {
            id shopDomain shopName status billingStatus billingBypass installApproved adminNotes installedAt
            productCount skuCount aiCreditsUsed extraAiCredits
            plan { name slug maxProducts aiCreditsPerMonth aiCreditsRemaining }
          } }`,
          {},
          authToken,
        ),
        adminGql<{ adminJobs: Job[] }>(
          `query { adminJobs(limit: 200) { id type status rowCount successCount failedCount errorSummary createdAt } }`,
          {},
          authToken,
        ),
        adminGql<{ adminJobStats: Record<string, number> }>(`query { adminJobStats }`, {}, authToken),
        adminGql<{ adminFeatureFlags: FeatureFlag[] }>(
          `query { adminFeatureFlags { id key enabled description } }`,
          {},
          authToken,
        ),
        adminGql<{ adminAuditLogs: AuditLog[] }>(
          `query { adminAuditLogs(limit: 100) { id action createdAt tenant { shopDomain } } }`,
          {},
          authToken,
        ),
        adminGql<{ adminPlans: Plan[] }>(
          `query { adminPlans { id name slug maxProducts aiCreditsPerMonth priceMonthlyCents isFree } }`,
          {},
          authToken,
        ),
        adminGql<{ adminSystemHealth: Record<string, unknown> }>(`query { adminSystemHealth }`, {}, authToken),
        adminGql<{ adminApiKeys: ApiKey[] }>(
          `query { adminApiKeys { id name keyPrefix scopes createdAt tenant { shopDomain } } }`,
          {},
          authToken,
        ),
      ]);
      setTenants(tenantsData.adminTenants);
      setJobs(jobsData.adminJobs);
      setStats(statsData.adminJobStats);
      setFlags(flagsData.adminFeatureFlags);
      setAuditLogs(auditData.adminAuditLogs);
      setPlans(plansData.adminPlans);
      setHealth(healthData.adminSystemHealth);
      setApiKeys(keysData.adminApiKeys);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  };

  useEffect(() => {
    if (token) loadData(token);
  }, [token]);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminGql<{
        adminLogin: { token: string; user: { email: string } };
      }>(
        `mutation($email: String!, $password: String!) {
          adminLogin(email: $email, password: $password) { token user { email } }
        }`,
        { email, password },
      );
      localStorage.setItem("tidysync_admin_token", data.adminLogin.token);
      setToken(data.adminLogin.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const filteredTenants = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.shopDomain.toLowerCase().includes(q) || t.shopName?.toLowerCase().includes(q));
  }, [tenants, search]);

  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (jobFilter) list = list.filter((j) => j.status === jobFilter);
    const q = search.toLowerCase();
    if (q) list = list.filter((j) => j.type.toLowerCase().includes(q) || j.id.includes(q));
    return list;
  }, [jobs, search, jobFilter]);

  const statusBadge = (status: string) => {
    const cls =
      status === "COMPLETED" || status === "ACTIVE"
        ? "badge-success"
        : status === "FAILED" || status === "SUSPENDED"
          ? "badge-critical"
          : status === "RUNNING"
            ? "badge-info"
            : "badge-attention";
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  const retryJob = async (jobId: string) => {
    if (!token) return;
    await adminGql(
      `mutation($jobId: ID!) { adminRetryJob(jobId: $jobId) { id status } }`,
      { jobId },
      token,
    );
    await loadData(token);
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    if (!token) return;
    await adminGql(
      `mutation($key: String!, $enabled: Boolean!) { adminUpdateFeatureFlag(key: $key, enabled: $enabled) { id enabled } }`,
      { key, enabled },
      token,
    );
    await loadData(token);
  };

  const updateTenantPlan = async (tenantId: string, planSlug: string) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $planSlug: String!) { adminUpdateTenantPlan(tenantId: $tenantId, planSlug: $planSlug) { id } }`,
      { tenantId, planSlug },
      token,
    );
    await loadData(token);
  };

  const updateTenantStatus = async (tenantId: string, status: string) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $status: String!) { adminUpdateTenantStatus(tenantId: $tenantId, status: $status) { id } }`,
      { tenantId, status },
      token,
    );
    await loadData(token);
  };

  const loadTenantDetail = async (tenantId: string, authToken: string) => {
    const data = await adminGql<{ adminTenantDetail: TenantDetail }>(
      `query($tenantId: ID!) {
        adminTenantDetail(tenantId: $tenantId) {
          tenant {
            id shopDomain shopName status billingStatus billingBypass installApproved adminNotes installedAt
            productCount skuCount aiCreditsUsed extraAiCredits
            plan { name slug maxProducts aiCreditsPerMonth aiCreditsRemaining }
          }
          jobStats { total running failed completed }
          recentJobs { id type status rowCount successCount failedCount createdAt errorSummary }
          billingCharges { id type status amountCents createdAt }
          aiOperationsCount
          auditLogCount
        }
      }`,
      { tenantId },
      authToken,
    );
    setTenantDetail(data.adminTenantDetail);
    setTenantNotes(data.adminTenantDetail.tenant.adminNotes ?? "");
    setSelectedTenantId(tenantId);
    setTab("tenant-detail");
  };

  const updateBillingBypass = async (tenantId: string, billingBypass: boolean) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $billingBypass: Boolean!) {
        adminUpdateTenantBillingBypass(tenantId: $tenantId, billingBypass: $billingBypass) { id billingBypass }
      }`,
      { tenantId, billingBypass },
      token,
    );
    await loadData(token);
    if (selectedTenantId === tenantId) await loadTenantDetail(tenantId, token);
  };

  const updateInstallApproved = async (tenantId: string, installApproved: boolean) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $installApproved: Boolean!) {
        adminUpdateTenantInstallApproved(tenantId: $tenantId, installApproved: $installApproved) { id installApproved }
      }`,
      { tenantId, installApproved },
      token,
    );
    await loadData(token);
    if (selectedTenantId === tenantId) await loadTenantDetail(tenantId, token);
  };

  const saveTenantNotes = async (tenantId: string) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $notes: String) {
        adminUpdateTenantNotes(tenantId: $tenantId, notes: $notes) { id adminNotes }
      }`,
      { tenantId, notes: tenantNotes },
      token,
    );
    await loadTenantDetail(tenantId, token);
  };

  const grantTenantCredits = async (tenantId: string, credits: number) => {
    if (!token) return;
    await adminGql(
      `mutation($tenantId: ID!, $credits: Int!) { adminGrantCredits(tenantId: $tenantId, credits: $credits) { id } }`,
      { tenantId, credits },
      token,
    );
    await loadData(token);
  };

  const createApiKey = async () => {
    if (!token || !selectedTenantId || !newApiKeyName.trim()) return;
    const data = await adminGql<{
      adminCreateApiKey: { rawKey: string; keyPrefix: string };
    }>(
      `mutation($tenantId: ID!, $name: String!, $scopes: [String!]) {
        adminCreateApiKey(tenantId: $tenantId, name: $name, scopes: $scopes) { rawKey keyPrefix }
      }`,
      { tenantId: selectedTenantId, name: newApiKeyName, scopes: ["export", "jobs"] },
      token,
    );
    setCreatedApiKey(data.adminCreateApiKey.rawKey);
    setNewApiKeyName("");
    await loadData(token);
  };

  const revokeApiKey = async (id: string) => {
    if (!token) return;
    await adminGql(`mutation($id: ID!) { adminRevokeApiKey(id: $id) }`, { id }, token);
    await loadData(token);
  };

  if (!token) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <div className="login-logo-icon">TS</div>
            <div>
              <h1 className="login-title">TidySync</h1>
            </div>
          </div>
          <p className="login-subtitle">Internal operations console</p>
          {error && <div className="login-error">{error}</div>}
          <div className="login-form">
            <input
              className="input"
              placeholder="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn" onClick={handleLogin} disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "tenants", label: "Tenants" },
    { id: "jobs", label: "Jobs" },
    { id: "billing", label: "Billing" },
    { id: "flags", label: "Feature flags" },
    { id: "apikeys", label: "API keys" },
    { id: "health", label: "System health" },
    { id: "audit", label: "Audit log" },
  ];

  const activeTabLabel = tabs.find((t) => t.id === tab)?.label ?? "Overview";

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <h1>TidySync</h1>
          <span>Operations console</span>
        </div>
        <nav className="sidebar-nav">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`nav-item${tab === t.id ? " active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button
            type="button"
            className="nav-item"
            onClick={() => {
              localStorage.removeItem("tidysync_admin_token");
              setToken(null);
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <h2 className="topbar-title">{activeTabLabel}</h2>
          <div className="topbar-actions">
            <button type="button" className="btn btn-secondary" onClick={() => token && loadData(token)}>
              Refresh
            </button>
          </div>
        </header>

        <div className="admin-content">
          {error && <div className="login-error" style={{ marginBottom: 16 }}>{error}</div>}

          {(tab === "tenants" || tab === "jobs") && (
            <div className="toolbar">
              <input
                className="input"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {tab === "jobs" && (
                <select className="input" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)} style={{ maxWidth: 160 }}>
                  <option value="">All statuses</option>
                  <option value="RUNNING">Running</option>
                  <option value="FAILED">Failed</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="QUEUED">Queued</option>
                </select>
              )}
            </div>
          )}

          {tab === "overview" && (
            <div className="stats-grid">
              <div className="stat-card accent">
                <div className="stat-label">Total jobs</div>
                <div className="stat-value">{stats.total ?? 0}</div>
              </div>
              <div className="stat-card success">
                <div className="stat-label">Completed</div>
                <div className="stat-value">{stats.completed ?? 0}</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-label">Running</div>
                <div className="stat-value">{stats.running ?? 0}</div>
              </div>
              <div className="stat-card critical">
                <div className="stat-label">Failed</div>
                <div className="stat-value">{stats.failed ?? 0}</div>
              </div>
            </div>
          )}

      {tab === "tenants" && (
        <div className="card">
          <h2 className="card-title">Tenants ({filteredTenants.length})</h2>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Status</th>
                <th>Products</th>
                <th>AI credits</th>
                <th>Plan</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTenants.map((t) => (
                <tr key={t.id}>
                  <td>{t.shopDomain}</td>
                  <td>{statusBadge(t.status)}</td>
                  <td>{t.productCount}</td>
                  <td>{t.aiCreditsUsed}{t.extraAiCredits ? ` +${t.extraAiCredits}` : ""}</td>
                  <td>{t.plan?.name ?? "—"}</td>
                  <td>
                    <div className="flex-row">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => token && loadTenantDetail(t.id, token)}>
                      Details
                    </button>
                    <select
                      className="input"
                      value={t.plan?.slug ?? ""}
                      onChange={(e) => updateTenantPlan(t.id, e.target.value)}
                      style={{ maxWidth: 120 }}
                    >
                      {plans.map((p) => (
                        <option key={p.slug} value={p.slug}>{p.name}</option>
                      ))}
                    </select>
                    {t.status === "ACTIVE" ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateTenantStatus(t.id, "SUSPENDED")}>Suspend</button>
                    ) : (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateTenantStatus(t.id, "ACTIVE")}>Activate</button>
                    )}
                    {t.billingBypass && <span className="badge badge-success">Test mode</span>}
                    {t.installApproved === false && <span className="badge badge-attention">Pending</span>}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateBillingBypass(t.id, !t.billingBypass)}
                    >
                      {t.billingBypass ? "Disable test" : "Enable test"}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => grantTenantCredits(t.id, 10)}>+10 credits</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "tenant-detail" && tenantDetail && (
        <div className="tenant-detail-layout">
          <div className="card">
            <div className="flex-row" style={{ marginBottom: 16 }}>
              <h2 className="card-title" style={{ margin: 0 }}>
                {tenantDetail.tenant.shopDomain}
              </h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTab("tenants")}>
                Back to tenants
              </button>
            </div>
            <div className="stats-grid">
              <div className="stat-card accent">
                <div className="stat-label">Products</div>
                <div className="stat-value">{tenantDetail.tenant.productCount.toLocaleString()}</div>
              </div>
              <div className="stat-card success">
                <div className="stat-label">Jobs completed</div>
                <div className="stat-value">{tenantDetail.jobStats.completed}</div>
              </div>
              <div className="stat-card warning">
                <div className="stat-label">Jobs running</div>
                <div className="stat-value">{tenantDetail.jobStats.running}</div>
              </div>
              <div className="stat-card critical">
                <div className="stat-label">Jobs failed</div>
                <div className="stat-value">{tenantDetail.jobStats.failed}</div>
              </div>
            </div>
            <div className="detail-meta-grid">
              <div>
                <div className="stat-label">Plan</div>
                <strong>{tenantDetail.tenant.plan?.name ?? "—"}</strong>
              </div>
              <div>
                <div className="stat-label">Billing</div>
                <strong>{tenantDetail.tenant.billingStatus ?? "—"}</strong>
              </div>
              <div>
                <div className="stat-label">AI credits used</div>
                <strong>{tenantDetail.tenant.aiCreditsUsed}</strong>
              </div>
              <div>
                <div className="stat-label">AI operations</div>
                <strong>{tenantDetail.aiOperationsCount}</strong>
              </div>
              <div>
                <div className="stat-label">Audit events</div>
                <strong>{tenantDetail.auditLogCount}</strong>
              </div>
              <div>
                <div className="stat-label">Installed</div>
                <strong>{tenantDetail.tenant.installedAt ? new Date(tenantDetail.tenant.installedAt).toLocaleDateString() : "—"}</strong>
              </div>
            </div>
            <div className="flex-row" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn"
                onClick={() => updateBillingBypass(tenantDetail.tenant.id, !tenantDetail.tenant.billingBypass)}
              >
                {tenantDetail.tenant.billingBypass ? "Disable testing mode" : "Enable testing mode (skip Shopify billing)"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => updateInstallApproved(tenantDetail.tenant.id, !tenantDetail.tenant.installApproved)}
              >
                {tenantDetail.tenant.installApproved ? "Revoke store access" : "Approve store"}
              </button>
              <select
                className="input"
                value={tenantDetail.tenant.plan?.slug ?? ""}
                onChange={(e) => updateTenantPlan(tenantDetail.tenant.id, e.target.value)}
                style={{ maxWidth: 160 }}
              >
                {plans.map((p) => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 16 }}>
              <label className="stat-label">Admin notes</label>
              <textarea
                className="input"
                rows={3}
                value={tenantNotes}
                onChange={(e) => setTenantNotes(e.target.value)}
                placeholder="Internal notes about this store…"
              />
              <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => saveTenantNotes(tenantDetail.tenant.id)}>
                Save notes
              </button>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Recent jobs</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Rows</th>
                    <th>Success</th>
                    <th>Failed</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantDetail.recentJobs.map((j) => (
                    <tr key={j.id}>
                      <td>{j.type}</td>
                      <td>{statusBadge(j.status)}</td>
                      <td>{j.rowCount}</td>
                      <td>{j.successCount}</td>
                      <td>{j.failedCount}</td>
                      <td>{new Date(j.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Billing charges</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantDetail.billingCharges.length === 0 ? (
                    <tr><td colSpan={4}>No charges yet</td></tr>
                  ) : (
                    tenantDetail.billingCharges.map((c) => (
                      <tr key={c.id}>
                        <td>{c.type}</td>
                        <td>{statusBadge(c.status)}</td>
                        <td>${(c.amountCents / 100).toFixed(2)}</td>
                        <td>{new Date(c.createdAt).toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "jobs" && (
        <div className="card">
          <h2 className="card-title">Jobs ({filteredJobs.length})</h2>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Error</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.type}</td>
                  <td>{statusBadge(j.status)}</td>
                  <td>{j.rowCount}</td>
                  <td>{j.successCount}</td>
                  <td>{j.failedCount}</td>
                  <td style={{ color: "var(--critical)", maxWidth: 200 }}>{j.errorSummary ?? "—"}</td>
                  <td>{new Date(j.createdAt).toLocaleString()}</td>
                  <td>
                    {j.status === "FAILED" && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => retryJob(j.id)}>Retry</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "billing" && (
        <div className="card">
          <h2 className="card-title">Billing & testing</h2>
          <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
            Global Shopify test charges:{" "}
            <strong>{health.shopifyBillingTest ? "ON (test mode)" : "OFF (live charges)"}</strong>
            — set <code>SHOPIFY_BILLING_TEST=true</code> in server <code>.env</code> for dev stores.
          </p>
          <p style={{ color: "var(--text-secondary)", marginBottom: 16 }}>
            Per-store <strong>testing mode</strong> skips Shopify subscription checks and activates billing locally.
            Use the tenant list or store detail page to toggle it.
          </p>
          <h3 className="card-title">Plans</h3>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Products</th>
                <th>AI credits/mo</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.maxProducts.toLocaleString()}</td>
                  <td>{p.aiCreditsPerMonth}</td>
                  <td>{p.isFree ? "Free" : `$${(p.priceMonthlyCents / 100).toFixed(0)}/mo`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <h3 className="card-title" style={{ marginTop: 24 }}>Grant credits</h3>
          <div className="flex-row">
            <select className="input" value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
              <option value="">Select tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.shopDomain}</option>
              ))}
            </select>
            <input className="input" value={grantCredits} onChange={(e) => setGrantCredits(e.target.value)} style={{ maxWidth: 80 }} />
            <button
              type="button"
              className="btn"
              onClick={() => selectedTenantId && grantTenantCredits(selectedTenantId, Number(grantCredits) || 10)}
            >
              Grant credits
            </button>
          </div>
        </div>
      )}

      {tab === "apikeys" && (
        <div className="card">
          <h2 className="card-title">API keys</h2>
          {createdApiKey && (
            <div className="alert-success">
              New key (copy now — shown once): <code>{createdApiKey}</code>
            </div>
          )}
          <div className="flex-row" style={{ marginBottom: 16 }}>
            <select className="input" value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)}>
              <option value="">Select tenant</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.shopDomain}</option>
              ))}
            </select>
            <input className="input" placeholder="Key name" value={newApiKeyName} onChange={(e) => setNewApiKeyName(e.target.value)} />
            <button type="button" className="btn" onClick={createApiKey}>Create key</button>
          </div>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shop</th>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scopes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((k) => (
                <tr key={k.id}>
                  <td>{k.tenant?.shopDomain ?? "—"}</td>
                  <td>{k.name}</td>
                  <td>{k.keyPrefix}…</td>
                  <td>{k.scopes.join(", ")}</td>
                  <td><button type="button" className="btn btn-danger btn-sm" onClick={() => revokeApiKey(k.id)}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "health" && (
        <div className="card">
          <h2 className="card-title">System health</h2>
          <pre className="health-pre">{JSON.stringify(health, null, 2)}</pre>
        </div>
      )}

      {tab === "flags" && (
        <div className="card">
          <h2 className="card-title">Feature flags</h2>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Key</th>
                <th>Description</th>
                <th>Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.id}>
                  <td>{f.key}</td>
                  <td>{f.description ?? "—"}</td>
                  <td>{statusBadge(f.enabled ? "ACTIVE" : "SUSPENDED")}</td>
                  <td>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleFlag(f.key, !f.enabled)}>
                      {f.enabled ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="card">
          <h2 className="card-title">Audit log</h2>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Shop</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.tenant?.shopDomain ?? "—"}</td>
                  <td>{log.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
