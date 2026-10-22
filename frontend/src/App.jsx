import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import PageLoader from './components/ui/PageLoader';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import UsersList from './pages/UsersList';
import UserDashboard from './pages/UserDashboard';
import UserForm from './pages/UserForm';
import RolesPage from './pages/RolesPage';
import AdministrationPage from './pages/AdministrationPage';
import AuditPage from './pages/AuditPage';
import ConnectorsPage from './pages/ConnectorsPage';
import ProvisionRequestsPage from './pages/ProvisionRequestsPage';
import ProfilePage from './pages/ProfilePage';

function Protected({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true, state: { reason: 'session' } });
    }
  }, [loading, user, navigate]);

  if (loading) return <PageLoader message="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ reason: 'session' }} />;
  if (adminOnly && !user.isSystemAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route
        path="/"
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="users"
          element={
            <Protected adminOnly>
              <UsersList />
            </Protected>
          }
        />
        <Route
          path="users/new"
          element={
            <Protected adminOnly>
              <UserForm />
            </Protected>
          }
        />
        <Route
          path="users/:id/edit"
          element={
            <Protected adminOnly>
              <UserForm />
            </Protected>
          }
        />
        <Route
          path="users/:id"
          element={
            <Protected adminOnly>
              <UserDashboard />
            </Protected>
          }
        />
        <Route
          path="entitlements"
          element={
            <Protected adminOnly>
              <RolesPage />
            </Protected>
          }
        />
        <Route
          path="entitlements/:id"
          element={
            <Protected adminOnly>
              <RolesPage />
            </Protected>
          }
        />
        <Route
          path="administration"
          element={
            <Protected adminOnly>
              <AdministrationPage />
            </Protected>
          }
        />
        <Route
          path="connectors"
          element={
            <Protected adminOnly>
              <ConnectorsPage />
            </Protected>
          }
        />
        <Route
          path="provision"
          element={
            <Protected adminOnly>
              <ProvisionRequestsPage />
            </Protected>
          }
        />
        <Route
          path="audit"
          element={
            <Protected adminOnly>
              <AuditPage />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
