export default function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <header className="page-header row">
      <div className="page-header-text">
        {Icon ? (
          <span className="page-header-icon">
            <Icon size={22} aria-hidden="true" />
          </span>
        ) : null}
        <div>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}
