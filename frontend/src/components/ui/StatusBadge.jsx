import { CheckCircle2, PauseCircle } from 'lucide-react';

const STATUS_MAP = {
  active: { label: 'Active', tone: 'success', Icon: CheckCircle2 },
  inactive: { label: 'Inactive', tone: 'muted', Icon: PauseCircle },
  // Legacy system flag — treat as Inactive for display
  disabled: { label: 'Inactive', tone: 'muted', Icon: PauseCircle },
};

export default function StatusBadge({ status }) {
  const key = String(status || '').toLowerCase();
  const meta = STATUS_MAP[key] || { label: status || '—', tone: 'muted', Icon: PauseCircle };
  const { label, tone, Icon } = meta;

  return (
    <span className={`status-badge tone-${tone}`}>
      <Icon size={14} aria-hidden="true" />
      {label}
    </span>
  );
}
