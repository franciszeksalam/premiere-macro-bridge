interface Props {
  message: string;
  detail?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function Confirm({ message, detail, confirmLabel = "Delete", onCancel, onConfirm }: Props) {
  return (
    <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 360 }}>
        <div className="body">
          <div style={{ fontWeight: 600 }}>{message}</div>
          {detail && <span className="note">{detail}</span>}
        </div>
        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
