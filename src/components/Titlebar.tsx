import { Minus, X } from "lucide-react";
import { api } from "../lib/api";
import { LogoMark } from "./ui";

export function Titlebar() {
  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest(".window-controls")) return;
        void api.windowToggleMaximize();
      }}
    >
      <div className="titlebar-brand">
        <LogoMark className="logo-mark-small" />
        <span className="titlebar-name">
          LLM<span>Pulse</span>
        </span>
        <span className="titlebar-divider" aria-hidden="true" />
        <span className="titlebar-caption">model checks, without the ceremony</span>
      </div>
      <div className="titlebar-drag" />
      <div className="titlebar-status">
        <span className="titlebar-status-dot" />
        <span>Tray resident</span>
      </div>
      <div className="window-controls">
        <button
          type="button"
          className="window-button"
          aria-label="Minimize"
          title="Minimize"
          onClick={() => void api.windowMinimize()}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="window-button window-button-close"
          aria-label="Hide to tray"
          title="Hide to tray"
          onClick={() => void api.windowHide()}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
