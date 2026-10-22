import { useEffect, useState } from 'react';
import {
  Activity,
  Building2,
  Layers3,
  LayoutDashboard,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import { StatSkeletonGrid } from '../components/ui/Skeleton';
import { TopProgress } from '../components/ui/TopProgress';
import StatusBadge from '../components/ui/StatusBadge';

function StatCard({ hint, value, label, to, icon: Icon }) {
  const inner = (
    <>
      <div className="stat-top">
        {Icon ? (
          <span className="stat-icon">
            <Icon size={18} aria-hidden="true" />
          </span>
        ) : null}
        <span>{hint}</span>
      </div>
      <strong className={typeof value === 'number' ? '' : 'stat-value'}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </strong>
      <small>{label}</small>
    </>
  );
  if (to) {
    return (
      <Link className="stat stat-link" to={to}>
        {inner}
      </Link>
    );
  }
  return <div className="stat">{inner}</div>;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = Boolean(user?.isSystemAdmin);
  const attrs = user?.attributes || {};
  const name =
    [attrs.first_name, attrs.last_name].filter(Boolean).join(' ') ||
    attrs.display_name ||
    user?.userId ||
    'Employee';
  const roles = user?.roles || [];

  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isAdmin);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.get('/api/dashboard/stats');
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) {
          if (err.status === 401) {
            await logout();
            return;
          }
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  return (
    <div className="page">
      <TopProgress active={loading} />
      <PageHeader
        icon={LayoutDashboard}
        title={isAdmin ? 'Admin Dashboard' : 'Lending Workbench'}
        subtitle={
          isAdmin
            ? `Welcome, ${name}. Live counts from Wisibility Loan Hub.`
            : `Welcome, ${name}. Your entitlements and account summary.`
        }
      />

      {error ? <div className="alert error">{error}</div> : null}

      {isAdmin ? (
        <>
          {loading || !stats ? (
            <>
              <section className="panel section-panel">
                <h2>Loading overview…</h2>
                <StatSkeletonGrid count={4} />
              </section>
              <StatSkeletonGrid count={4} />
            </>
          ) : (
            <>
              <section className="panel section-panel">
                <h2>
                  <Users size={20} aria-hidden="true" />
                  Users
                </h2>
                <div className="stat-grid">
                  <StatCard hint="Directory" value={stats.users.total} label="Total users" to="/users" icon={Users} />
                  <StatCard
                    hint="Account status"
                    value={stats.users.byStatus.Active || 0}
                    label="Active"
                    to="/users"
                    icon={UserCheck}
                  />
                  <StatCard hint="Account status" value={stats.users.byStatus.Inactive || 0} label="Inactive" />
                  <StatCard
                    hint="Gaps"
                    value={stats.users.noManager}
                    label="No manager"
                    to="/users?filter=no_manager"
                  />
                  <StatCard
                    hint="Gaps"
                    value={stats.users.noEntitlement}
                    label="No entitlements"
                    to="/users?filter=no_entitlement"
                  />
                  <StatCard hint="Admins" value={stats.users.systemAdmins} label="System admins" />
                </div>
              </section>

              <section className="panel section-panel">
                <h2>
                  <ShieldCheck size={20} aria-hidden="true" />
                  Entitlements
                </h2>
                <div className="stat-grid">
                  <StatCard
                    hint="Catalog"
                    value={stats.entitlements.total}
                    label="Total entitlements"
                    to="/entitlements"
                    icon={ShieldCheck}
                  />
                  <StatCard hint="Coverage" value={stats.entitlements.assigned} label="Assigned to ≥1 user" />
                  <StatCard
                    hint="Gaps"
                    value={stats.entitlements.unassigned}
                    label="Unassigned"
                    to="/entitlements"
                  />
                  <StatCard
                    hint="Data quality"
                    value={stats.entitlements.missingOwner}
                    label="Missing owner"
                    to="/entitlements"
                  />
                </div>
              </section>

              <section className="panel section-panel">
                <h2>
                  <Layers3 size={20} aria-hidden="true" />
                  Platform
                </h2>
                <div className="stat-grid">
                  <StatCard
                    hint="Schema"
                    value={stats.schema.userColumns}
                    label="User columns"
                    to="/administration"
                    icon={Building2}
                  />
                  <StatCard
                    hint="Schema"
                    value={stats.schema.entitlementColumns}
                    label="Entitlement columns"
                    to="/administration"
                  />
                  <StatCard
                    hint="Activity"
                    value={stats.audit.last24Hours}
                    label="Audit events (24h)"
                    to="/audit"
                    icon={Activity}
                  />
                </div>
              </section>
            </>
          )}
        </>
      ) : (
        <>
          <section className="panel section-panel">
            <h2>
              <ShieldCheck size={20} aria-hidden="true" />
              Your entitlements
            </h2>
            {roles.length === 0 ? (
              <EmptyState
                title="No entitlements yet"
                message="Ask an administrator to assign access for your role."
              />
            ) : (
              <div className="chip-row">
                {roles.map((r) => (
                  <span className="role-chip" key={r.id}>
                    <ShieldCheck size={14} aria-hidden="true" />
                    {r.name}
                    <small>{r.code}</small>
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="stat-grid">
            <StatCard
              hint="Account"
              value={<StatusBadge status={attrs.status || user?.status} />}
              label="Status"
            />
            <StatCard hint="Access" value={roles.length} label="Entitlements" icon={ShieldCheck} />
            <StatCard hint="Org" value={attrs.department || '—'} label="Department" icon={Building2} />
            <StatCard hint="Reporting" value={attrs.manager_name || 'None'} label="Manager" />
          </div>
        </>
      )}
    </div>
  );
}