import { useState } from "react";
import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";
import { errorMessage } from "../lib/api";
import { Modal } from "./ui";

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal onClose={onClose} labelledBy="confirm-title" className="confirm-modal" closable={!busy}>
      <div className="confirm-icon">
        <AlertTriangle size={21} />
      </div>
      <h2 id="confirm-title" className="modal-title">
        {title}
      </h2>
      <p className="confirm-description">{description}</p>
      {error && <div className="form-error">{error}</div>}
      <div className="confirm-actions">
        <button type="button" className="button button-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="button button-danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
            } catch (confirmError) {
              setError(errorMessage(confirmError));
              setBusy(false);
            }
          }}
        >
          {busy ? <LoaderCircle className="spinner" size={15} /> : <Trash2 size={15} />}
          {busy ? "Removing…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
