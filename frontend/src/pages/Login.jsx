import { useEffect, useState } from 'react';
import { ArrowRight, LockKeyhole, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';
import PageLoader from '../components/ui/PageLoader';
import Spinner from '../components/ui/Spinner';
import { TopProgress } from '../components/ui/TopProgress';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sessionNotice, setSessionNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (location.state?.reason === 'session') {
      setSessionNotice('Your session expired. Please sign in again.');
    }
  }, [location.state]);

  if (loading) {
    return <PageLoader message="Preparing sign-in…" />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(userId.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <TopProgress active={submitting} />
      <div className="login-panel">
        <div className="login-brand">
          <span className="brand-mark large">WLH</span>
          <h1>Wisibility Loan Hub</h1>
          <p>Secure employee access for credit and lending operations</p>
        </div>
        <form className="login-form" onSubmit={onSubmit}>
          {sessionNotice ? <div className="alert ok">{sessionNotice}</div> : null}
          {error ? <div className="alert error">{error}</div> : null}
          <label htmlFor="userId">User ID, email, or full name</label>
          <div className="input-icon-wrap">
            <UserRound size={18} className="input-icon" aria-hidden="true" />
            <input
              id="userId"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              autoComplete="username"
              placeholder="demo.user001"
              required
            />
          </div>
          <label htmlFor="password">Password</label>
          <div className="input-icon-wrap">
            <LockKeyhole size={18} className="input-icon" aria-hidden="true" />
            <PasswordInput
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn primary btn-block btn-icon-text" type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Spinner size={18} />
                Signing in…
              </>
            ) : (
              <>
                Sign in
                <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </button>
          <p className="muted login-hint">
            Admin: <code>admin</code> with your configured admin password · Demo: <code>demo.user001</code> with your configured demo password
          </p>
          <Link className="forgot-link" to="/forgot-password">
            Forgot password?
          </Link>
        </form>
      </div>
    </div>
  );
}
