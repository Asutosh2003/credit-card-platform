import {
  Cable,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings2,
  Shield,
  SlidersHorizontal,
  UserCircle2,
  Users,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { RouteProgress } from './ui/TopProgress';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, admin: false },
  { to: '/users', label: 'Users', icon: Users, admin: true },
  { to: '/entitlements', label: 'Entitlements', icon: Shield, admin: true },
  { to: '/administration', label: 'Administration', icon: Settings2, admin: true },
  { to: '/connectors', label: 'Connectors', icon: Cable, admin: true },
  { to: '/provision', label: 'Provision', icon: ClipboardList, admin: true },
  { to: '/audit', label: 'Audit', icon: ScrollText, admin: true },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal, admin: true },
  { to: '/profile', label: 'My Profile', icon: UserCircle2, admin: false },
];

function initials(user) {
  const attrs = user?.attributes || {};
  const first = attrs.first_name?.[0] || '';
  const last = attrs.last_name?.[0] || '';
  if (first || last) return `${first}${last}`.toUpperCase();
  return (user?.userId || '?').slice(0, 2).toUpperCase();
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = Boolean(user?.isSystemAdmin);
  const displayName =
    user?.attributes?.display_name ||
    [user?.attributes?.first_name, user?.attributes?.last_name].filter(Boolean).join(' ') ||
    user?.userId;

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <RouteProgress />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">WLH</span>
          <div>
            <strong>Wisibility</strong>
            <small>Loan Hub</small>
          </div>
        </div>
        <nav className="nav">
          {NAV.filter((item) => !item.admin || isAdmin).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="nav-link">
              <Icon size={18} strokeWidth={2} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <span className="user-avatar">{initials(user)}</span>
            <div>
              <span>{displayName}</span>
              <small>{isAdmin ? 'System Admin' : 'Employee'}</small>
            </div>
          </div>
          <button type="button" className="btn ghost btn-icon-text" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" />
            Logout
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
