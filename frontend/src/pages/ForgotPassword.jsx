import { useState } from 'react';
import { ArrowLeft, KeyRound, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import PasswordInput from '../components/PasswordInput';
import Spinner from '../components/ui/Spinner';
import { TopProgress } from '../components/ui/TopProgress';

export default function ForgotPassword() {
  const [userId, setUserId] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const requestToken = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const data = await api.post('/api/auth/forgot-password', { userId: userId.trim() });
      setMessage(data.message);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api.post('/api/auth/reset-password', {
        userId: userId.trim(),
        token: token.trim(),
        newPassword,
      });
      setMessage('Password updated. You can sign in now.');
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <TopProgress active={busy} />
      <div className="login-panel">
        <div className="login-brand">
          <span className="brand-mark large">WLH</span>
          <h1>Forgot password</h1>
          <p>Demo reset: token is printed in the API server console.</p>
        </div>
        {error ? <div className="alert error">{error}</div> : null}
        {message ? <div className="alert ok">{message}</div> : null}
        {step === 1 ? (
          <form className="login-form" onSubmit={requestToken}>
            <label htmlFor="userId">User ID, email, or full name</label>
            <div className="input-icon-wrap">
              <Mail size={18} className="input-icon" aria-hidden="true" />
              <input id="userId" value={userId} onChange={(e) => setUserId(e.target.value)} required />
            </div>
            <button className="btn primary btn-block btn-icon-text" type="submit" disabled={busy}>
              {busy ? <Spinner size={18} /> : <KeyRound size={18} aria-hidden="true" />}
              Request reset
            </button>
          </form>
        ) : null}
        {step === 2 ? (
          <form className="login-form" onSubmit={resetPassword}>
            <label htmlFor="token">Reset token</label>
            <input id="token" value={token} onChange={(e) => setToken(e.target.value)} required />
            <label htmlFor="newPassword">New password</label>
            <PasswordInput
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={4}
              autoComplete="new-password"
              required
            />
            <button className="btn primary btn-block btn-icon-text" type="submit" disabled={busy}>
              {busy ? <Spinner size={18} /> : null}
              Set new password
            </button>
          </form>
        ) : null}
        {step === 3 ? (
          <Link className="btn primary btn-block btn-icon-text" to="/login">
            Back to login
          </Link>
        ) : (
          <Link className="forgot-link btn-icon-text" to="/login">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to login
          </Link>
        )}
      </div>
    </div>
  );
}
