import { ArrowUpRight, Plus, Settings } from "lucide-react";
import type { Account, ProviderPreset } from "../../shared/types";
import { classNames, relativeTime } from "../lib/format";
import { ProviderAvatar, SectionLabel, StatusDot } from "./ui";

export function Sidebar({
  accounts,
  presets,
  activeAccountId,
  appVersion,
  onSelectAccount,
  onAddAccount,
  onOpenSettings
}: {
  accounts: Account[];
  presets: ProviderPreset[];
  activeAccountId: string | null;
  appVersion: string;
  onSelectAccount: (accountId: string) => void;
  onAddAccount: () => void;
  onOpenSettings: () => void;
}) {
  const presetMap = new Map(presets.map((preset) => [preset.id, preset]));

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-heading">
          <SectionLabel>accounts</SectionLabel>
          <span className="sidebar-count">{accounts.length}</span>
          <button
            type="button"
            className="icon-button sidebar-add"
            onClick={onAddAccount}
            title="Add account"
            aria-label="Add account"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="account-list">
          {accounts.map((account) => {
            const preset = presetMap.get(account.presetId) ?? presets[0];
            const selected = account.id === activeAccountId;
            return (
              <button
                type="button"
                key={account.id}
                className={classNames("account-card", selected && "account-card-active")}
                onClick={() => onSelectAccount(account.id)}
                aria-pressed={selected}
              >
                <ProviderAvatar preset={preset} size="md" />
                <span className="account-card-copy">
                  <span className="account-card-name">{account.name}</span>
                  <span className="account-card-meta">
                    {account.presetName}
                    <span className="account-card-separator">·</span>
                    {account.models.length > 0
                      ? `${account.models.length} models`
                      : "not detected"}
                  </span>
                  {selected && (
                    <span className="account-card-age">
                      {account.models.length > 0
                        ? `synced ${relativeTime(account.modelsUpdatedAt)}`
                        : "ready to discover"}
                    </span>
                  )}
                </span>
                <span className="account-card-indicator">
                  {selected ? (
                    <span className="account-card-active-dot" />
                  ) : (
                    <ArrowUpRight size={14} />
                  )}
                </span>
              </button>
            );
          })}

          {accounts.length === 0 && (
            <button type="button" className="sidebar-empty" onClick={onAddAccount}>
              <span className="sidebar-empty-icon">
                <Plus size={18} />
              </span>
              <span>
                <strong>Add your first account</strong>
                <small>Connect a provider to begin.</small>
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="sidebar-bottom">
        <button type="button" className="settings-button" onClick={onOpenSettings}>
          <Settings size={16} />
          <span>Settings</span>
          <span className="settings-version">v{appVersion}</span>
        </button>
        <div className="tray-note">
          <StatusDot tone="success" />
          <span>Close hides to the tray. Your keys stay local.</span>
        </div>
      </div>
    </aside>
  );
}
