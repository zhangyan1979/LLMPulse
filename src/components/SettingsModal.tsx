import { useState } from "react";
import {
  Bell,
  Database,
  FolderOpen,
  Keyboard,
  LogOut,
  Power,
  ShieldCheck
} from "lucide-react";
import type { AppSettings } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { Modal, ModalCloseButton, SectionLabel, Toggle } from "./ui";

export function SettingsModal({
  settings,
  appVersion,
  dataPath,
  onClose,
  onUpdate,
  onQuit
}: {
  settings: AppSettings;
  appVersion: string;
  dataPath: string;
  onClose: () => void;
  onUpdate: (patch: Partial<AppSettings>) => Promise<void>;
  onQuit: () => void;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = async (key: string, patch: Partial<AppSettings>) => {
    setBusyKey(key);
    setError(null);
    try {
      await onUpdate(patch);
    } catch (updateError) {
      setError(errorMessage(updateError));
    } finally {
      setBusyKey(null);
    }
  };

  const openDataFolder = async () => {
    const result = await api.showDataFolder();
    if (!result.ok) setError(result.error);
  };

  return (
    <Modal onClose={onClose} labelledBy="settings-modal-title" className="settings-modal">
      <div className="modal-header">
        <div>
          <SectionLabel>preferences</SectionLabel>
          <h2 id="settings-modal-title" className="modal-title">
            Settings
          </h2>
          <p className="modal-subtitle">
            Keep LLMPulse in the tray and make checks feel instant.
          </p>
        </div>
        <ModalCloseButton onClose={onClose} />
      </div>

      <div className="modal-body settings-body">
        <div className="settings-group">
          <span className="settings-group-label">Startup & behavior</span>
          <div className="setting-row">
            <span className="setting-icon">
              <Power size={17} />
            </span>
            <span className="setting-copy">
              <strong>Launch at Windows sign-in</strong>
              <small>Start quietly in the tray, ready for a check.</small>
            </span>
            <Toggle
              label="Launch at Windows sign-in"
              checked={settings.launchAtLogin}
              disabled={busyKey === "launchAtLogin"}
              onChange={(value) => void update("launchAtLogin", { launchAtLogin: value })}
            />
          </div>
          <div className="setting-row">
            <span className="setting-icon">
              <Bell size={17} />
            </span>
            <span className="setting-copy">
              <strong>Desktop notifications</strong>
              <small>Show a Windows toast after checks started from the tray.</small>
            </span>
            <Toggle
              label="Desktop notifications"
              checked={settings.notifications}
              disabled={busyKey === "notifications"}
              onChange={(value) => void update("notifications", { notifications: value })}
            />
          </div>
        </div>

        <div className="settings-group">
          <span className="settings-group-label">Security & data</span>
          <div className="security-card">
            <span className="security-icon">
              <ShieldCheck size={19} />
            </span>
            <div className="security-copy">
              <strong>Keys are protected with Windows DPAPI</strong>
              <p>
                Stored API keys are encrypted per Windows user and are never sent back to
                the UI. Provider calls originate from the Electron main process.
              </p>
            </div>
          </div>
          <div className="data-path-row">
            <Database size={15} />
            <span className="data-path mono" title={dataPath}>
              {dataPath}
            </span>
            <button type="button" className="text-link" onClick={() => void openDataFolder()}>
              <FolderOpen size={13} /> Open
            </button>
          </div>
        </div>

        <div className="settings-group">
          <span className="settings-group-label">Keyboard</span>
          <div className="shortcut-row">
            <span className="setting-icon">
              <Keyboard size={17} />
            </span>
            <span className="setting-copy">
              <strong>Run the active model check</strong>
              <small>When the dashboard is focused.</small>
            </span>
            <span className="shortcut-keys">
              <kbd className="kbd">Ctrl</kbd>
              <kbd className="kbd">Enter</kbd>
            </span>
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="about-row">
          <div>
            <span className="about-name">LLMPulse</span>
            <span className="about-version">Version {appVersion}</span>
          </div>
          <button type="button" className="button button-danger-ghost" onClick={onQuit}>
            <LogOut size={14} /> Quit app
          </button>
        </div>
      </div>
    </Modal>
  );
}
