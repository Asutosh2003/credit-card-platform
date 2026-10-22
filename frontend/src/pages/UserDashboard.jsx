import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  ChevronRight,
  Pencil,
  ShieldCheck,
  UserRound,
  Users,
  Activity,
  KeyRound,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import EmptyState from '../components/ui/EmptyState';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { StatSkeletonGrid } from '../components/ui/Skeleton';
import { TopProgress } from '../components/ui/TopProgress';

function StatCard({ hint, value, label, icon: Icon }) {
  return (
    <div className="stat">
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
    </div>
  );
}

function ManagerLink({ userId, name }) {
  if (!userId) return <span className="muted">—</span>;
  return (
    <Link className="manager-link" to={`/users/${encodeURIComponent(userId)}`}>
      {name || userId}
      <small>{userId}</small>
    </Link>
  );
}

export default function UserDashboard() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/api/users/${encodeURIComponent(id)}/dashboard`);
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="page page-wide">
        <TopProgress active />
        <PageHeader icon={UserRound} title="User dashboard" subtitle="Loading employee profile…" />
        <StatSkeletonGrid count={4} />
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="page">
        <PageHeader icon={UserRound} title="User dashboard" />
        <div className="alert error">{error || 'User not found'}</div>
        <Link className="btn ghost btn-icon-text" to="/users">
          <ArrowLeft size={16} /> Back to users
        </Link>
      </div>
    );
  }

  const user = data.user;
  const attrs = user.attributes || {};
  const name = attrs.display_name || user.userId;
  const recordKey = user.id;

  return (
    <div className="page page-wide">
      <TopProgress active={false} />
      <PageHeader
        icon={UserRound}
        title={name}
        subtitle={`User dashboard · ${user.userId}`}
        actions={
          <>
            <Link className="btn ghost btn-icon-text" to="/users">
              <ArrowLeft size={16} aria-hidden="true" />
              Users
            </Link>
            <Link className="btn primary btn-icon-text" to={`/users/${recordKey}/edit`}>
              <Pencil size={16} aria-hidden="true" />
              Edit user
            </Link>
          </>
        }
      />

      <section className="panel section-panel user-dash-hero">
        <div className="user-dash-identity">
          <span className="user-avatar large">
            {(attrs.first_name?.[0] || user.userId[0] || '?').toUpperCase()}
            {(attrs.last_name?.[0] || '').toUpperCase()}
          </span>
          <div>
            <h2>{name}</h2>
            <p className="muted">
              <code>{user.userId}</code>
              {attrs.email ? <> · {attrs.email}</> : null}
            </p>
            <div className="chip-row" style={{ marginTop: '0.55rem' }}>
              <StatusBadge status={attrs.status || user.status} />
              {attrs.department ? (
                <span className="role-chip">
                  <Building2 size={14} aria-hidden="true" />
                  {attrs.department}
                </span>
              ) : null}
              {attrs.job_title ? <span className="role-chip">{attrs.job_title}</span> : null}
              {user.isSystemAdmin ? <span className="role-chip">System Admin</span> : null}
            </div>
          </div>
        </div>
      </section>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard
          hint="Access"
          value={data.stats.entitlementCount}
          label="Entitlements"
          icon={ShieldCheck}
        />
        <StatCard
          hint="Team"
          value={data.stats.directReportCount}
          label="Direct reports"
          icon={Users}
        />
        <StatCard
          hint="Activity"
          value={data.stats.auditEvents30d}
          label="Audit events (30d)"
          icon={Activity}
        />
        <StatCard
          hint="Security"
          value={data.stats.mfaEnabled ? 'On' : 'Off'}
          label={`MFA · ${data.stats.failedLogins} failed logins`}
          icon={KeyRound}
        />
      </div>

      <div className="split user-dash-split">
        <section className="panel section-panel">
          <h2>
            <UserRound size={20} aria-hidden="true" />
            Account details
          </h2>
          <dl className="detail-list">
            <div>
              <dt>User ID</dt>
              <dd>
                <code>{user.userId}</code>
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{attrs.email || '—'}</dd>
            </div>
            <div>
              <dt>Employee ID</dt>
              <dd>{attrs.employee_id || '—'}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{attrs.department || '—'}</dd>
            </div>
            <div>
              <dt>Job title</dt>
              <dd>{attrs.job_title || '—'}</dd>
            </div>
            <div>
              <dt>User type</dt>
              <dd>{attrs.user_type || '—'}</dd>
            </div>
            <div>
              <dt>Manager</dt>
              <dd>
                <ManagerLink
                  userId={attrs.manager_id || data.manager?.userId}
                  name={attrs.manager_name || data.manager?.displayName}
                />
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{attrs.created_date ? new Date(attrs.created_date).toLocaleString() : '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="panel section-panel">
          <h2>
            <Users size={20} aria-hidden="true" />
            Reporting chain
          </h2>
          {data.reportingChain?.length ? (
            <ol className="hierarchy-trail vertical">
              <li>
                <span className="hierarchy-self">
                  <strong>{name}</strong>
                  <small>{user.userId}</small>
                </span>
              </li>
              {data.reportingChain.map((node) => (
                <li key={node.id}>
                  <Link className="manager-link" to={`/users/${encodeURIComponent(node.userId)}`}>
                    <strong>{node.displayName}</strong>
                    <small>
                      {node.userId}
                      {node.jobTitle ? ` · ${node.jobTitle}` : ''}
                    </small>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="Top of hierarchy"
              message="This user has no manager assigned."
              icon={Users}
            />
          )}

          <h2 style={{ marginTop: '1.25rem' }}>
            <ShieldCheck size={20} aria-hidden="true" />
            Entitlements
          </h2>
          {(user.roles || []).length === 0 ? (
            <p className="muted">No entitlements assigned.</p>
          ) : (
            <div className="chip-row">
              {user.roles.map((r) => (
                <span className="role-chip" key={r.id}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  {r.name}
                  <small>{r.code}</small>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="panel section-panel">
        <div className="panel-head">
          <h2>
            <Users size={20} aria-hidden="true" />
            Direct reports ({data.directReports.length})
          </h2>
        </div>
        {data.directReports.length === 0 ? (
          <EmptyState title="No direct reports" message="Nobody reports to this user." />
        ) : (
          <div className="table-wrap panel table-panel" style={{ boxShadow: 'none', border: 0, padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>User ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Job title</th>
                  <th>Status</th>
                  <th>Entitlements</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.directReports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link className="manager-link" to={`/users/${encodeURIComponent(r.userId)}`}>
                        <code className="cell-code">{r.userId}</code>
                      </Link>
                    </td>
                    <td>{r.displayName}</td>
                    <td>{r.department || '—'}</td>
                    <td>{r.jobTitle || '—'}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <span className="ent-count">{r.entitlementCount ?? 0}</span>
                    </td>
                    <td className="actions">
                      <Link to={`/users/${encodeURIComponent(r.userId)}`} className="btn-icon-text">
                        Open
                        <ChevronRight size={14} aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
