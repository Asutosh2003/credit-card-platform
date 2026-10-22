import Spinner from './Spinner';

export default function LoadingButton({
  loading = false,
  children,
  className = 'btn primary',
  disabled,
  ...props
}) {
  return (
    <button type="button" className={className} disabled={disabled || loading} {...props}>
      {loading ? (
        <>
          <Spinner size={16} />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
