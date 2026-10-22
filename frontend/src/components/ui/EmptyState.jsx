import { Inbox } from 'lucide-react';

export default function EmptyState({ title = 'Nothing here yet', message, icon: Icon = Inbox }) {
  return (
    <div className="empty-state rich">
      <div className="empty-state-icon">
        <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <strong>{title}</strong>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
