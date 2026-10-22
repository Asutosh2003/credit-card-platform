import { Loader2 } from 'lucide-react';

export default function Spinner({ size = 20, className = '' }) {
  return (
    <Loader2
      size={size}
      className={`spinner-icon ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
