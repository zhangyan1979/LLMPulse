import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  History,
  Pencil,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Trash2,
  Zap
} from "lucide-react";
import type {
  Account,
  AccountInput,
  AppSettings,
  ProviderPreset,
  TestResult
} from "../shared/types";
import { isLikelyChatModel } from "../shared/models";
import { api, errorMessage, unwrap } from "./lib/api";
import {
  classNames,
  formatLatency,
  hostLabel,
  isModelsFresh,
  pickDefaultModel,
  relativeTime,
  truncate
} from "./lib/format";
import { AddAccountModal } from "./components/AddAccountModal";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { EmptyWorkspace } from "./components/EmptyWorkspace";
import { ModelPicker } from "./components/ModelPicker";
import { ResultPanel, type CheckState } from "./components/ResultPanel";
import { SettingsModal } from "./components/SettingsModal";
import { Sidebar } from "./components/Sidebar";
import { Titlebar } from "./components/Titlebar";
import {
  LogoMark,
  ProviderAvatar,
  SectionLabel,
  Spinner,
  StatusDot,
  Toast,
  type ToastData
} from "./components/ui";

type ModalState =
  | { type: "add" }
  | { type: "edit"; accountId: string }
  | { type: "settings" }
  | { type: "delete"; accountId: string }
  | null;

type DetectionState = {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const EMPTY_SETTINGS: AppSettings = {
  activeAccountId: null,
  activeModelId: null,
  launchAtLogin: false,
  notifications: true
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [dataPath, setDataPath] = useState("");
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [detection, setDetection] = useState<DetectionState>({ status: "idle", error: null });
  const [check, setCheck] = useState<CheckState>({ status: "idle" });
  const [recent, setRecent] = useState<TestResult[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  const toastCounter = useRef(0);
  const detectionSeq = useRef(0);
  const checkSeq = useRef(0);
  const checkRunning = useRef(false);
  const activeAccountIdRef = useRef<string | null>(null);
  const selectedModelIdRef = useRef<string | null>(null);
  const accountsRef = useRef<Account[]>([]);
  const settingsRef = useRef<AppSettings>(EMPTY_SETTINGS);

  activeAccountIdRef.current = activeAccountId;
  selectedModelIdRef.current = selectedModelId;
  accountsRef.current = accounts;
  settingsRef.current = settings;

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  );
  const activePreset = useMemo(
    () =>
      activeAccount
        ? presets.find((preset) => preset.id === activeAccount.presetId) ?? presets[0] ?? null
        : null,
    [activeAccount, presets]
  );
  const chatCount = activeAccount
    ? activeAccount.models.filter((model) => isLikelyChatModel(model.id)).length
    : 0;

  const showToast = useCallback(
    (message: string, tone: ToastData["tone"] = "info") => {
      toastCounter.current += 1;
      setToast({ id: toastCounter.current, tone, message });
    },
    []
  );

  const dismissToast = useCallback(() => setToast(null), []);

  const pushRecent = useCallback((result: TestResult) => {
    setRecent((current) => [result, ...current].slice(0, 4));
  }, []);

  const persistSelection = useCallback(
    (accountId: string, modelId: string | null) => {
      void api
        .updateSettings({ activeAccountId: accountId, activeModelId: modelId })
        .then((result) => {
          if (result.ok) {
            setSettings(result.data);
          } else {
            showToast(result.error, "error");
          }
        })
        .catch((error: unknown) => showToast(errorMessage(error), "error"));
    },
    [showToast]
  );

  const runDetection = useCallback(
    async (accountId: string) => {
      const seq = ++detectionSeq.current;
      setDetection({ status: "loading", error: null });
      try {
        const result = unwrap(await api.detectModels(accountId));
        if (seq !== detectionSeq.current) return;
        setAccounts((current) =>
          current.map((account) =>
            account.id === accountId
              ? {
                  ...account,
                  models: result.models,
                  modelsUpdatedAt: result.fetchedAt
                }
              : account
          )
        );
        if (activeAccountIdRef.current !== accountId) return;
        if (result.models.length === 0) {
          setDetection({
            status: "error",
            error:
              "This account returned no models. Check that the key has model access and the base URL is correct."
          });
          return;
        }
        setDetection({ status: "ready", error: null });
        const current = selectedModelIdRef.current;
        const remembered =
          settingsRef.current.activeAccountId === accountId
            ? settingsRef.current.activeModelId
            : null;
        const preferred =
          (current && result.models.some((model) => model.id === current) ? current : null) ??
          (remembered && result.models.some((model) => model.id === remembered)
            ? remembered
            : null) ??
          pickDefaultModel(result.models);
        if (preferred) {
          setSelectedModelId(preferred);
          persistSelection(accountId, preferred);
          setCheck((currentCheck) =>
            currentCheck.status === "complete" && currentCheck.result.modelId !== preferred
              ? { status: "idle" }
              : currentCheck
          );
        } else if (settingsRef.current.activeAccountId !== accountId) {
          persistSelection(accountId, null);
        }
      } catch (error) {
        if (seq !== detectionSeq.current) return;
        if (activeAccountIdRef.current === accountId) {
          setDetection({ status: "error", error: errorMessage(error) });
        }
      }
    },
    [persistSelection]
  );

  useEffect(() => {
    let cancelled = false;
    setBooting(true);
    setBootError(null);

    void (async () => {
      try {
        const data = unwrap(await api.getBootstrap());
        if (cancelled) return;
        setAccounts(data.accounts);
        setPresets(data.presets);
        setSettings(data.settings);
        setAppVersion(data.appVersion);
        setDataPath(data.dataPath);

        const chosenAccount =
          data.accounts.find((account) => account.id === data.settings.activeAccountId) ??
          data.accounts[0] ??
          null;
        const remembered =
          chosenAccount && data.settings.activeAccountId === chosenAccount.id
            ? data.settings.activeModelId
            : null;
        const chosenModel =
          remembered && chosenAccount?.models.some((model) => model.id === remembered)
            ? remembered
            : pickDefaultModel(chosenAccount?.models ?? []);
        setActiveAccountId(chosenAccount?.id ?? null);
        setSelectedModelId(chosenModel);
      } catch (error) {
        if (!cancelled) setBootError(errorMessage(error));
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  useEffect(() => {
    if (booting) return;
    if (!activeAccountId) {
      setSelectedModelId(null);
      setDetection({ status: "idle", error: null });
      return;
    }
    const account = accountsRef.current.find((item) => item.id === activeAccountId);
    if (!account) return;

    checkSeq.current += 1;
    checkRunning.current = false;
    setCheck({ status: "idle" });

    const current = selectedModelIdRef.current;
    const remembered =
      settingsRef.current.activeAccountId === account.id
        ? settingsRef.current.activeModelId
        : null;
    const preferred =
      (current && account.models.some((model) => model.id === current) ? current : null) ??
      (remembered && account.models.some((model) => model.id === remembered)
        ? remembered
        : null) ??
      pickDefaultModel(account.models);
    setSelectedModelId(preferred);

    if (account.models.length > 0 && isModelsFresh(account.modelsUpdatedAt)) {
      setDetection({ status: "ready", error: null });
      if (
        settingsRef.current.activeAccountId !== account.id ||
        settingsRef.current.activeModelId !== preferred
      ) {
        persistSelection(account.id, preferred);
      }
    } else {
      void runDetection(account.id);
    }
  }, [activeAccountId, booting, persistSelection, runDetection]);

  useEffect(() => {
    const disposeQuick = api.onQuickTestResult(({ result }) => {
      pushRecent(result);
      if (result.accountId !== activeAccountIdRef.current) {
        showToast(
          `Tray check for ${result.accountName}: ${result.ok ? "responding" : "failed"}`,
          result.ok ? "success" : "error"
        );
        return;
      }
      checkSeq.current += 1;
      checkRunning.current = false;
      const account = accountsRef.current.find((item) => item.id === result.accountId);
      if (account?.models.some((model) => model.id === result.modelId)) {
        setSelectedModelId(result.modelId);
      }
      setCheck({ status: "complete", result });
    });

    const disposeSettings = api.onSettingsChanged((incoming) => {
      setSettings((current) => ({
        ...current,
        launchAtLogin: incoming.launchAtLogin,
        notifications: incoming.notifications
      }));
    });

    const disposeAdd = api.onShowAddAccount(() => setModal({ type: "add" }));

    return () => {
      disposeQuick();
      disposeSettings();
      disposeAdd();
    };
  }, [pushRecent, showToast]);

  const runCheck = useCallback(async () => {
    const accountId = activeAccountIdRef.current;
    const modelId = selectedModelIdRef.current;
    if (!accountId || !modelId || checkRunning.current) return;
    const account = accountsRef.current.find((item) => item.id === accountId);
    if (!account) return;
    const seq = ++checkSeq.current;
    checkRunning.current = true;
    setCheck({ status: "running", startedAt: Date.now(), modelId });
    try {
      const result = unwrap(await api.testModel(accountId, modelId));
      if (seq !== checkSeq.current) return;
      checkRunning.current = false;
      setCheck({ status: "complete", result });
      pushRecent(result);
    } catch (error) {
      if (seq !== checkSeq.current) return;
      checkRunning.current = false;
      setCheck({ status: "idle" });
      showToast(errorMessage(error), "error");
    }
  }, [pushRecent, showToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      if (modal) return;
      event.preventDefault();
      void runCheck();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modal, runCheck]);

  const handleSelectAccount = (accountId: string) => {
    if (accountId === activeAccountId) return;
    detectionSeq.current += 1;
    checkSeq.current += 1;
    checkRunning.current = false;
    setActiveAccountId(accountId);
    setSelectedModelId(null);
    setDetection({ status: "idle", error: null });
    setCheck({ status: "idle" });
    persistSelection(accountId, null);
  };

  const handleModelChange = (modelId: string) => {
    if (!activeAccount || modelId === selectedModelId) return;
    checkSeq.current += 1;
    checkRunning.current = false;
    setSelectedModelId(modelId);
    setCheck({ status: "idle" });
    persistSelection(activeAccount.id, modelId);
  };

  const handleSaveAccount = async (input: AccountInput) => {
    const account = unwrap(await api.saveAccount(input));
    const editingActiveAccount = activeAccountIdRef.current === account.id;
    if (editingActiveAccount) detectionSeq.current += 1;
    setAccounts((current) =>
      current.some((item) => item.id === account.id)
        ? current.map((item) => (item.id === account.id ? account : item))
        : [...current, account]
    );
    setSettings((current) => ({
      ...current,
      activeAccountId: account.id,
      activeModelId: null
    }));
    setActiveAccountId(account.id);
    setSelectedModelId(null);
    setCheck({ status: "idle" });
    setModal(null);
    persistSelection(account.id, null);
    showToast(
      input.id
        ? "Account updated. Refreshing its models…"
        : "Account connected. Discovering models…",
      "success"
    );
    if (editingActiveAccount) {
      setDetection({ status: "loading", error: null });
      void runDetection(account.id);
    }
  };

  const handleDeleteAccount = async () => {
    if (modal?.type !== "delete") return;
    const account = accountsRef.current.find((item) => item.id === modal.accountId);
    if (!account) {
      setModal(null);
      return;
    }
    unwrap(await api.deleteAccount(account.id));
    const remaining = accountsRef.current.filter((item) => item.id !== account.id);
    setAccounts(remaining);
    setRecent((current) => current.filter((result) => result.accountId !== account.id));
    if (account.id === activeAccountIdRef.current) {
      detectionSeq.current += 1;
      checkSeq.current += 1;
      checkRunning.current = false;
      const nextAccountId = remaining[0]?.id ?? null;
      setActiveAccountId(nextAccountId);
      setSelectedModelId(null);
      setDetection({ status: "idle", error: null });
      setCheck({ status: "idle" });
    }
    setModal(null);
    showToast(`Removed “${account.name}”.`, "info");
  };

  const handleSettingsUpdate = async (patch: Partial<AppSettings>) => {
    const updated = unwrap(await api.updateSettings(patch));
    setSettings(updated);
  };

  const handleRefreshModels = () => {
    if (activeAccount) void runDetection(activeAccount.id);
  };

  const handleRecentClick = (result: TestResult) => {
    if (!activeAccount || result.accountId !== activeAccount.id) return;
    if (!activeAccount.models.some((model) => model.id === result.modelId)) return;
    checkSeq.current += 1;
    checkRunning.current = false;
    setSelectedModelId(result.modelId);
    setCheck({ status: "complete", result });
    persistSelection(activeAccount.id, result.modelId);
  };

  if (booting) {
    return (
      <div className="app-shell">
        <Titlebar />
        <div className="boot-screen">
          <LogoMark className="logo-mark-boot" />
          <Spinner size={20} />
          <p>Opening the pulse…</p>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="app-shell">
        <Titlebar />
        <div className="boot-screen boot-screen-error">
          <span className="boot-error-icon">
            <AlertTriangle size={25} />
          </span>
          <h1>LLMPulse couldn’t open its workspace.</h1>
          <p>{bootError}</p>
          <div className="boot-actions">
            <button className="button button-primary" onClick={() => setBootAttempt((value) => value + 1)}>
              <RefreshCw size={15} /> Try again
            </button>
            <button className="button button-ghost" onClick={() => void api.quitApp()}>
              Quit
            </button>
          </div>
        </div>
      </div>
    );
  }

  const editingAccount =
    modal?.type === "edit"
      ? accounts.find((account) => account.id === modal.accountId) ?? null
      : null;
  const deletingAccount =
    modal?.type === "delete"
      ? accounts.find((account) => account.id === modal.accountId) ?? null
      : null;
  const recentForAccount = activeAccount
    ? recent.filter((result) => result.accountId === activeAccount.id)
    : [];
  const modelsLoading = detection.status === "loading";
  const canRunCheck = Boolean(activeAccount && selectedModelId) && check.status !== "running";

  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app-body">
        <Sidebar
          accounts={accounts}
          presets={presets}
          activeAccountId={activeAccountId}
          appVersion={appVersion}
          onSelectAccount={handleSelectAccount}
          onAddAccount={() => setModal({ type: "add" })}
          onOpenSettings={() => setModal({ type: "settings" })}
        />

        <main className="workspace">
          {!activeAccount || !activePreset ? (
            <EmptyWorkspace presets={presets} onAddAccount={() => setModal({ type: "add" })} />
          ) : (
            <div className="workspace-scroll">
              <header className="workspace-header">
                <div>
                  <SectionLabel icon={<span className="live-indicator" />}>active account</SectionLabel>
                  <div className="account-identity">
                    <ProviderAvatar preset={activePreset} size="lg" />
                    <div className="account-identity-copy">
                      <h1 className="account-title">{activeAccount.name}</h1>
                      <div className="account-meta">
                        <span>{activeAccount.presetName}</span>
                        <span className="meta-dot" />
                        <span className="mono account-endpoint">{hostLabel(activeAccount.baseUrl)}</span>
                        <span className="key-badge">
                          <ShieldCheck size={12} />
                          {activeAccount.hasApiKey ? "key encrypted" : "no key needed"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="header-actions">
                  <button
                    type="button"
                    className="icon-button header-action"
                    title="Edit account"
                    aria-label="Edit account"
                    onClick={() => setModal({ type: "edit", accountId: activeAccount.id })}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button header-action header-action-danger"
                    title="Remove account"
                    aria-label="Remove account"
                    onClick={() => setModal({ type: "delete", accountId: activeAccount.id })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </header>

              <section className="check-card">
                <div className="check-card-head">
                  <div>
                    <SectionLabel icon={<Zap size={12} />}>model check</SectionLabel>
                    <h2 className="check-title">What should we ping?</h2>
                  </div>
                  <div className="detect-status">
                    {modelsLoading ? (
                      <>
                        <Spinner size={13} />
                        <span>Detecting models…</span>
                      </>
                    ) : (
                      <>
                        <StatusDot tone={detection.status === "error" ? "danger" : "success"} />
                        <span>
                          {activeAccount.models.length} detected
                          <span className="detect-separator">·</span>
                          {relativeTime(activeAccount.modelsUpdatedAt)}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      className="refresh-button"
                      onClick={handleRefreshModels}
                      disabled={modelsLoading}
                      title="Refresh models"
                      aria-label="Refresh models"
                    >
                      <RefreshCw size={14} className={classNames(modelsLoading && "spin")} />
                    </button>
                  </div>
                </div>

                <div className="check-controls">
                  <ModelPicker
                    models={activeAccount.models}
                    value={selectedModelId}
                    onChange={handleModelChange}
                    onRefresh={handleRefreshModels}
                    loading={modelsLoading}
                    updatedAt={activeAccount.modelsUpdatedAt}
                    disabled={!activeAccount}
                  />
                  <button
                    type="button"
                    className="button button-primary check-button"
                    onClick={() => void runCheck()}
                    disabled={!canRunCheck}
                  >
                    {check.status === "running" ? <Spinner size={16} /> : <Play size={15} />}
                    <span>{check.status === "running" ? "Checking…" : "Run check"}</span>
                    {check.status !== "running" && (
                      <span className="check-shortcut">
                        <kbd className="kbd">Ctrl</kbd>
                        <kbd className="kbd">↵</kbd>
                      </span>
                    )}
                  </button>
                </div>

                <div className="check-foot">
                  <span>
                    <Terminal size={13} />
                    Sends “Reply with exactly OK.” One request, no conversation history.
                  </span>
                  <span className="check-foot-count">
                    {chatCount > 0 ? `${chatCount} chat-ready` : "waiting for models"}
                  </span>
                </div>

                {detection.status === "error" && (
                  <div className="detect-error" role="alert">
                    <AlertCircle size={15} />
                    <span>{detection.error}</span>
                    <button type="button" onClick={handleRefreshModels} disabled={modelsLoading}>
                      Retry
                    </button>
                  </div>
                )}
              </section>

              <ResultPanel state={check} />

              {recentForAccount.length > 0 && (
                <div className="recent-checks">
                  <span className="recent-heading">
                    <History size={13} /> recent
                  </span>
                  <div className="recent-list">
                    {recentForAccount.slice(0, 3).map((result, index) => (
                      <button
                        type="button"
                        className={classNames(
                          "recent-check",
                          result.ok ? "recent-check-ok" : "recent-check-failed"
                        )}
                        key={`${result.testedAt}-${index}`}
                        onClick={() => handleRecentClick(result)}
                        title={`Show the result for ${result.modelId}`}
                      >
                        <span className="recent-check-icon">
                          {result.ok ? <Check size={11} /> : <AlertTriangle size={11} />}
                        </span>
                        <span className="recent-check-model">{truncate(result.modelId, 28)}</span>
                        <span className="recent-check-time">{formatLatency(result.latencyMs)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />

      {modal?.type === "add" && (
        <AddAccountModal
          presets={presets}
          account={null}
          onClose={() => setModal(null)}
          onSubmit={handleSaveAccount}
        />
      )}
      {modal?.type === "edit" && editingAccount && (
        <AddAccountModal
          presets={presets}
          account={editingAccount}
          onClose={() => setModal(null)}
          onSubmit={handleSaveAccount}
        />
      )}
      {modal?.type === "settings" && (
        <SettingsModal
          settings={settings}
          appVersion={appVersion}
          dataPath={dataPath}
          onClose={() => setModal(null)}
          onUpdate={handleSettingsUpdate}
          onQuit={() => void api.quitApp()}
        />
      )}
      {modal?.type === "delete" && deletingAccount && (
        <ConfirmDialog
          title="Remove this account?"
          description={`“${deletingAccount.name}” and its encrypted API key will be removed from this PC. Cached models and this account’s local history will be discarded.`}
          confirmLabel="Remove account"
          onClose={() => setModal(null)}
          onConfirm={handleDeleteAccount}
        />
      )}
    </div>
  );
}
