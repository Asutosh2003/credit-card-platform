import Spinner from './Spinner';

export default function PageLoader({ message = 'Loading workspace…' }) {
  return (
    <div className="page-loader">
      <div className="page-loader-card">
        <Spinner size={32} />
        <strong>{message}</strong>
        <div className="page-loader-bar">
          <div className="page-loader-bar-fill" />
        </div>
      </div>
    </div>
  );
}
