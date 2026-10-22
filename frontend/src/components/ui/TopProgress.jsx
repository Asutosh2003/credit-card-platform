import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export function TopProgress({ active = false }) {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setProgress(14);
      timerRef.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.random() * 12));
      }, 260);
      return () => clearInterval(timerRef.current);
    }

    if (visible) {
      clearInterval(timerRef.current);
      setProgress(100);
      const hide = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 420);
      return () => clearTimeout(hide);
    }
  }, [active, visible]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="top-progress"
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="top-progress-bar" style={{ width: `${progress}%` }} />
    </div>
  );
}

export function RouteProgress() {
  const location = useLocation();
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(true);
    const done = setTimeout(() => setActive(false), 520);
    return () => clearTimeout(done);
  }, [location.pathname]);

  return <TopProgress active={active} />;
}
