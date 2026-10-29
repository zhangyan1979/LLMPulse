import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  ShieldCheck
} from "lucide-react";
import type { Account, AccountInput, ProviderPreset } from "../../shared/types";
import { api, errorMessage } from "../lib/api";
import { classNames } from "../lib/format";
import {
  Modal,
  ModalCloseButton,
  ProviderAvatar,
  SectionLabel
} from "./ui";

export function AddAccountModal({
  presets,
  account,
  onClose,
  onSubmit
}: {
  presets: ProviderPreset[];
  account: Account | null;
  onClose: () => void;
  onSubmit: (input: AccountInput) => Promise<void>;
}) {
  const initialPreset =
    presets.find((preset) => preset.id === account?.presetId) ??
    presets.find((preset) => preset.id === "openai") ??
    presets[0];
  const [presetId, setPresetId] = useState(initialPreset?.id ?? "openai");
  const [name, setName] = useState(account?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(account?.baseUrl ?? initialPreset?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [removeApiKey, setRemoveApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const preset = useMemo(
    () => presets.find((item) => item.id === presetId) ?? presets[0],
    [presetId, presets]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => nameRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, []);

  const choosePreset = (next: ProviderPreset) => {
    setPresetId(next.id);
    setBaseUrl(next.baseUrl);
    setError(null);
    if (!name.trim() && next.id !== "custom") {
      setName(`My ${next.name}`);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setError(null);
    if (!name.trim()) {
      setError("Give this account a name.");
      nameRef.current?.focus();
      return;
    }
    if (!baseUrl.trim()) {
      setError("Enter the API base URL.");
      return;
    }
    if (preset.requiresApiKey && !apiKey.trim() && !account?.hasApiKey) {
      setError(`${preset.name} needs an API key.`);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        ...(account ? { id: account.id } : {}),
        name: name.trim(),
        presetId: preset.id,
        baseUrl: baseUrl.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(removeApiKey ? { removeApiKey: true } : {})
      });
    } catch (submitError) {
      setError(errorMessage(submitError));
      setSaving(false);
    }
  };

  const openDocs = () => {
    if (preset.docsUrl) void api.openExternal(preset.docsUrl);
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="account-modal-title"
      className="account-modal"
      closable={!saving}
    >
      <form onSubmit={handleSubmit}>
        <div className="modal-header">
          <div>
            <SectionLabel>{account ? "edit connection" : "new connection"}</SectionLabel>
            <h2 id="account-modal-title" className="modal-title">
              {account ? "Account settings" : "Connect an account"}
            </h2>
            <p className="modal-subtitle">
              LLMPulse calls the provider directly from this desktop app. Your key is
              encrypted before it is written to disk.
            </p>
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>

        <div className="modal-body account-modal-body">
          <div className="form-block">
            <span className="field-label">Provider</span>
            <div className="preset-grid">
              {presets.map((item) => {
                const selected = item.id === presetId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={classNames("preset-card", selected && "preset-card-selected")}
                    onClick={() => choosePreset(item)}
                    aria-pressed={selected}
                  >
                    <ProviderAvatar preset={item} size="sm" />
                    <span className="preset-copy">
                      <span className="preset-name">{item.name}</span>
                      <span className="preset-description">{item.description}</span>
                    </span>
                    {selected && (
                      <span className="preset-check">
                        <Check size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-row">
            <label className="field">
              <span className="field-label">Account name</span>
              <input
                ref={nameRef}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={`My ${preset.name}`}
                maxLength={80}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span className="field-label">API base URL</span>
              <div className="input-with-icon">
                <span className="input-prefix">URL</span>
                <input
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  placeholder="https://api.example.com/v1"
                  className="mono input-with-prefix"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </label>
          </div>

          <div className="field">
            <div className="field-label-row">
              <span className="field-label">
                API key{" "}
                {!preset.requiresApiKey && <span className="optional-tag">optional</span>}
              </span>
              {preset.docsUrl && (
                <button type="button" className="text-link" onClick={openDocs}>
                  Get a key <ExternalLink size={12} />
                </button>
              )}
            </div>
            <div className="input-with-icon">
              <KeyRound size={15} className="input-icon" />
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  if (event.target.value) setRemoveApiKey(false);
                }}
                placeholder={
                  account?.hasApiKey && !removeApiKey
                    ? "••••••••  leave blank to keep saved key"
                    : preset.requiresApiKey
                      ? "Paste your API key"
                      : "Not required for local servers"
                }
                className="input-with-leading mono"
                autoComplete="new-password"
                spellCheck={false}
                disabled={removeApiKey}
              />
              <button
                type="button"
                className="input-action"
                onClick={() => setShowKey((current) => !current)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
                disabled={removeApiKey}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <div className="field-hint-row">
              <span className="field-hint">
                <ShieldCheck size={13} />
                Encrypted with Windows DPAPI on this device.
              </span>
              {account?.hasApiKey && (
                <button
                  type="button"
                  className="text-link text-link-danger"
                  onClick={() => {
                    setRemoveApiKey((current) => !current);
                    setApiKey("");
                  }}
                >
                  {removeApiKey ? "Keep existing key" : "Remove saved key"}
                </button>
              )}
            </div>
          </div>

          {preset.local && (
            <div className="inline-note">
              <span className="inline-note-dot" />
              <span>
                {preset.name} expects a server running at this address. Start it before
                discovering models.
              </span>
            </div>
          )}

          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <span className="modal-footer-note">Models are discovered after saving.</span>
          <div className="modal-footer-actions">
            <button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={saving}>
              {saving ? <LoaderCircle className="spinner" size={15} /> : <KeyRound size={15} />}
              {saving ? "Saving…" : account ? "Save changes" : "Connect account"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
