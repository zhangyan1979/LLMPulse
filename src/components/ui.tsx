import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Info, LoaderCircle, X } from "lucide-react";
import type { ProviderPreset } from "../../shared/types";
import { classNames, hexToRgba } from "../lib/format";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span className={classNames("logo-mark", className)} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path
          d="M3.5 12.5h3.8l2.1-6 3.4 12 2.4-6.8h5.3"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

type AvatarPreset = Pick<ProviderPreset, "name" | "color" | "glyph">;

export function ProviderAvatar({
  preset,
  size = "md"
}: {
  preset: AvatarPreset;
  size?: "sm" | "md" | "lg";
}) {
  const style = {
    "--provider-color": preset.color,
    "--provider-tint": hexToRgba(preset.color, 0.14),
    "--provider-border": hexToRgba(preset.color, 0.28)
  } as CSSProperties;
  return (
    <span
      className={classNames("provider-avatar", `provider-avatar-${size}`)}
      style={style}
      title={preset.name}
      aria-hidden="true"
    >
      {preset.glyph}
    </span>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <LoaderCircle
      className={classNames("spinner", className)}
      size={size}
      strokeWidth={2.2}
      aria-hidden="true"
    />
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={classNames("toggle", checked && "toggle-on")}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function StatusDot({ tone = "muted" }: { tone?: "success" | "warning" | "danger" | "muted" }) {
  return <span className={classNames("status-dot", `status-dot-${tone}`)} aria-hidden="true" />;
}

const ModalCloseGuard = createContext(false);

export function Modal({
  children,
  onClose,
  labelledBy,
  className,
  closable = true
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  closable?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closableRef = useRef(closable);
  const generatedTitleId = useId();
  const titleId = labelledBy || generatedTitleId;
  onCloseRef.current = onClose;
  closableRef.current = closable;

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const first = panel?.querySelector<HTMLElement>(focusableSelector);
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closableRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null
      );
      if (focusable.length === 0) return;
      const firstElement = focusable[0];
      const lastElement = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <ModalCloseGuard.Provider value={closable}>
      <div
        className="modal-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && closable) onClose();
        }}
      >
        <div
          className={classNames("modal-panel", className)}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          ref={panelRef}
        >
          {children}
        </div>
      </div>
    </ModalCloseGuard.Provider>,
    document.body
  );
}

export function ModalCloseButton({ onClose }: { onClose: () => void }) {
  const closable = useContext(ModalCloseGuard);
  return (
    <button
      type="button"
      className="icon-button modal-close"
      onClick={onClose}
      disabled={!closable}
      aria-label="Close dialog"
    >
      <X size={18} />
    </button>
  );
}

export interface ToastData {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}

export function Toast({
  toast,
  onDismiss
}: {
  toast: ToastData | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 4_500);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  const Icon = toast.tone === "success" ? Check : toast.tone === "error" ? AlertCircle : Info;
  return (
    <div className={classNames("toast", `toast-${toast.tone}`)} role="status">
      <span className="toast-icon">
        <Icon size={16} />
      </span>
      <span className="toast-message">{toast.message}</span>
      <button type="button" className="toast-dismiss" onClick={onDismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export function SectionLabel({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="section-label">
      {icon}
      <span>{children}</span>
    </div>
  );
}
