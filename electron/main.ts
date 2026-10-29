import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  screen,
  shell,
  Tray,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions
} from "electron";
import path from "node:path";
import { AppStore } from "./store";
import {
  detectModels,
  setFetchImplementation,
  testModel,
  type ProviderAccount
} from "./providers";
import { PROVIDER_PRESETS } from "../shared/presets";
import type {
  Account,
  AccountInput,
  ApiResult,
  AppSettings,
  DetectionResult,
  QuickTestEvent,
  TestResult
} from "../shared/types";

const APP_NAME = "LLMPulse";
const APP_USER_MODEL_ID = "com.llmpulse.desktop";

app.setName(APP_NAME);
app.setAppUserModelId(APP_USER_MODEL_ID);
app.setPath("userData", path.join(app.getPath("appData"), APP_NAME));

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let store: AppStore;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let quickTestRunning = false;
let showOnReady = false;

const ok = <T>(data: T): ApiResult<T> => ({ ok: true, data });
const fail = (error: unknown): ApiResult<never> => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error)
});

function assetPath(fileName: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, fileName)
    : path.join(app.getAppPath(), "build", fileName);
}

function windowIsUsable(): boolean {
  return Boolean(mainWindow && !mainWindow.isDestroyed());
}

function windowAssetExists(fileName: string): boolean {
  try {
    return !nativeImage.createFromPath(assetPath(fileName)).isEmpty();
  } catch {
    return false;
  }
}

function positionWindow(): void {
  if (!windowIsUsable() || !mainWindow) return;
  const bounds = tray?.getBounds();
  const hasTrayBounds = Boolean(bounds && bounds.width > 0 && bounds.height > 0);
  const display = screen.getDisplayMatching(
    hasTrayBounds && bounds
      ? bounds
      : {
          x: screen.getPrimaryDisplay().workArea.x,
          y: screen.getPrimaryDisplay().workArea.y,
          width: 1,
          height: 1
        }
  );
  const workArea = display.workArea;
  const [width, height] = mainWindow.getSize();
  const margin = 12;

  let x: number;
  if (hasTrayBounds && bounds) {
    x = Math.round(bounds.x + bounds.width / 2 - width / 2);
  } else {
    x = workArea.x + workArea.width - width - margin;
  }
  let y = workArea.y + workArea.height - height - margin;

  x = Math.max(workArea.x + margin, Math.min(x, workArea.x + workArea.width - width - margin));
  y = Math.max(workArea.y + margin, Math.min(y, workArea.y + workArea.height - height - margin));

  mainWindow.setPosition(x, y, false);
}

function showWindow(): void {
  if (!windowIsUsable() || !mainWindow) {
    createWindow();
    return;
  }
  positionWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  rebuildTrayMenu();
}

function toggleWindow(): void {
  if (!windowIsUsable() || !mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }
  showWindow();
}

function createWindow(): void {
  if (windowIsUsable()) {
    showWindow();
    return;
  }

  const display = screen.getPrimaryDisplay();
  const width = Math.max(860, Math.min(1040, display.workArea.width - 40));
  const height = Math.max(600, Math.min(720, display.workArea.height - 40));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 860,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: "#080b11",
    title: APP_NAME,
    icon: windowAssetExists("icon.png") ? assetPath("icon.png") : undefined,
    roundedCorners: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: !app.isPackaged
    }
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);

  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("show", () => rebuildTrayMenu());
  mainWindow.on("hide", () => rebuildTrayMenu());

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`LLMPulse renderer failed to load (${code}): ${description}`);
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl && !app.isPackaged) {
    void mainWindow.loadURL(devServerUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => {
    if (showOnReady) {
      showWindow();
      showOnReady = false;
    }
  });
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function iconForTray(): Electron.NativeImage {
  const ico = assetPath("tray.ico");
  const image = nativeImage.createFromPath(ico);
  if (!image.isEmpty()) return image;
  const png = nativeImage.createFromPath(assetPath("icon.png"));
  if (!png.isEmpty()) return png.resize({ width: 16, height: 16 });
  return nativeImage.createEmpty();
}

function activeAccount(): Account | null {
  const settings = store.getSettings();
  return settings.activeAccountId ? store.getPublicAccount(settings.activeAccountId) : null;
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  const settings = store.getSettings();
  const account = activeAccount();
  const modelId = settings.activeModelId;
  const hasSelection = Boolean(account && modelId);
  const tooltipModel = modelId ? ` — ${modelId.slice(0, 48)}` : "";
  tray.setToolTip(
    account ? `${APP_NAME}${tooltipModel}` : `${APP_NAME} — click to open`
  );

  const template: MenuItemConstructorOptions[] = [
    {
      label: mainWindow?.isVisible() ? "Focus LLMPulse" : "Open LLMPulse",
      click: () => showWindow()
    },
    {
      label: quickTestRunning ? "Checking model…" : "Check active model",
      enabled: hasSelection && !quickTestRunning,
      click: () => void runQuickTest()
    },
    {
      label: "Add account…",
      click: () => {
        showWindow();
        mainWindow?.webContents.send("ui:show-add-account");
      }
    },
    { type: "separator" },
    {
      label: "Launch at sign-in",
      type: "checkbox",
      checked: settings.launchAtLogin,
      click: (item) => {
        void store
          .updateSettings({ launchAtLogin: item.checked })
          .then(() => {
            applyLoginItemSetting();
            broadcastSettings();
            rebuildTrayMenu();
          })
          .catch((error) => {
            console.error("Could not update launch-at-login setting:", error);
          });
      }
    },
    {
      label: "Desktop notifications",
      type: "checkbox",
      checked: settings.notifications,
      click: (item) => {
        void store
          .updateSettings({ notifications: item.checked })
          .then(() => {
            broadcastSettings();
            rebuildTrayMenu();
          })
          .catch((error) => {
            console.error("Could not update notification setting:", error);
          });
      }
    },
    { type: "separator" },
    {
      label: "Quit LLMPulse",
      accelerator: "CmdOrCtrl+Q",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];

  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray(): void {
  tray = new Tray(iconForTray());
  tray.setToolTip(`${APP_NAME} — click to open`);
  tray.on("click", () => toggleWindow());
  tray.on("double-click", () => showWindow());
  rebuildTrayMenu();
}

function applyLoginItemSetting(): void {
  if (!app.isPackaged) return;
  const settings = store.getSettings();
  try {
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      path: process.execPath,
      args: ["--hidden"]
    });
  } catch (error) {
    console.error("Could not apply launch-at-login setting:", error);
  }
}

function broadcastSettings(): void {
  if (!windowIsUsable() || !mainWindow) return;
  mainWindow.webContents.send("settings-changed", store.getSettings());
}

function broadcastQuickResult(result: TestResult): void {
  if (!windowIsUsable() || !mainWindow) return;
  const payload: QuickTestEvent = { result };
  mainWindow.webContents.send("quick-test-result", payload);
}

function quickTestFailure(account: Account, modelId: string, error: string): TestResult {
  return {
    ok: false,
    accountId: account.id,
    accountName: account.name,
    modelId,
    statusCode: null,
    latencyMs: 0,
    responseText: null,
    error,
    testedAt: new Date().toISOString()
  };
}

async function toProviderAccount(account: Account): Promise<ProviderAccount> {
  return {
    id: account.id,
    name: account.name,
    kind: account.kind,
    baseUrl: account.baseUrl,
    apiKey: await store.getApiKey(account.id)
  };
}

function showNotification(result: TestResult): boolean {
  if (!Notification.isSupported()) return false;
  const title = result.ok ? "Model is responding" : "Model check failed";
  const parts = result.ok
    ? `${result.modelId} · ${result.latencyMs} ms`
    : `${result.modelId} · ${result.error ?? "Unknown error"}`;
  const body = parts.length > 180 ? `${parts.slice(0, 179)}…` : parts;
  const notification = new Notification({
    title,
    body,
    icon: windowAssetExists("icon.png") ? assetPath("icon.png") : undefined,
    silent: false
  });
  notification.on("click", () => showWindow());
  notification.show();
  return true;
}

async function runQuickTest(): Promise<void> {
  if (quickTestRunning) {
    showWindow();
    return;
  }
  const settings = store.getSettings();
  if (!settings.activeAccountId || !settings.activeModelId) {
    showWindow();
    return;
  }
  const account = store.getPublicAccount(settings.activeAccountId);
  if (!account) {
    showWindow();
    return;
  }
  const modelId = settings.activeModelId;
  quickTestRunning = true;
  rebuildTrayMenu();
  let result: TestResult;
  try {
    result = await testModel(await toProviderAccount(account), modelId);
  } catch (error) {
    result = quickTestFailure(
      account,
      modelId,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    quickTestRunning = false;
  }
  broadcastQuickResult(result);
  const shouldNotify =
    settings.notifications && (!mainWindow?.isVisible() || !mainWindow?.isFocused());
  const notified = shouldNotify ? showNotification(result) : false;
  if (!notified && !mainWindow?.isVisible()) {
    showWindow();
  }
  rebuildTrayMenu();
}

function requireTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error("Untrusted IPC sender.");
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("app:bootstrap", (event) => {
    requireTrustedSender(event);
    return ok({
      accounts: store.getAccounts(),
      presets: PROVIDER_PRESETS,
      settings: store.getSettings(),
      appVersion: app.getVersion(),
      platform: process.platform,
      dataPath: store.dataPath
    });
  });

  ipcMain.handle("account:save", async (event, input: AccountInput) => {
    requireTrustedSender(event);
    try {
      const account = await store.saveAccount(input);
      rebuildTrayMenu();
      return ok(account);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("account:delete", async (event, accountId: string) => {
    requireTrustedSender(event);
    try {
      await store.deleteAccount(accountId);
      broadcastSettings();
      rebuildTrayMenu();
      return ok({ deleted: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(
    "account:detect",
    async (event, accountId: string): Promise<ApiResult<DetectionResult>> => {
      requireTrustedSender(event);
      try {
        const account = store.getPublicAccount(accountId);
        if (!account) throw new Error("That account no longer exists.");
        const detection = await detectModels(await toProviderAccount(account));
        const updated = await store.setModels(accountId, detection.models, detection.fetchedAt);
        broadcastSettings();
        rebuildTrayMenu();
        return ok({
          models: updated.models,
          fetchedAt: detection.fetchedAt,
          latencyMs: detection.latencyMs
        });
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    "account:test",
    async (event, accountId: string, modelId: string): Promise<ApiResult<TestResult>> => {
      requireTrustedSender(event);
      try {
        const account = store.getPublicAccount(accountId);
        if (!account) throw new Error("That account no longer exists.");
        if (typeof modelId !== "string" || !modelId.trim() || modelId.length > 300) {
          throw new Error("Choose a model to test.");
        }
        const result = await testModel(await toProviderAccount(account), modelId.trim());
        return ok(result);
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle("settings:update", async (event, patch: Partial<AppSettings>) => {
    requireTrustedSender(event);
    try {
      const before = store.getSettings();
      const settings = await store.updateSettings(patch ?? {});
      if (settings.launchAtLogin !== before.launchAtLogin) {
        applyLoginItemSetting();
      }
      broadcastSettings();
      rebuildTrayMenu();
      return ok(settings);
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("window:minimize", (event) => {
    requireTrustedSender(event);
    mainWindow?.minimize();
  });

  ipcMain.handle("window:hide", (event) => {
    requireTrustedSender(event);
    mainWindow?.hide();
  });

  ipcMain.handle("window:toggle-maximize", (event) => {
    requireTrustedSender(event);
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }
    mainWindow.maximize();
    return true;
  });

  ipcMain.handle("app:open-external", async (event, url: string) => {
    requireTrustedSender(event);
    try {
      if (typeof url !== "string" || !isSafeExternalUrl(url)) {
        throw new Error("That link is not allowed.");
      }
      await shell.openExternal(url);
      return ok({ opened: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("app:show-data-folder", async (event) => {
    requireTrustedSender(event);
    try {
      const errorMessage = await shell.openPath(store.dataPath);
      if (errorMessage) throw new Error(errorMessage);
      return ok({ opened: true });
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle("app:quit", (event) => {
    requireTrustedSender(event);
    isQuitting = true;
    app.quit();
  });
}

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null);
  setFetchImplementation((input, init) => net.fetch(input, init));
  store = new AppStore();
  await store.load();
  applyLoginItemSetting();
  registerIpcHandlers();
  createTray();

  const hasAccounts = store.getAccounts().length > 0;
  showOnReady = !hasAccounts || process.argv.includes("--show");
  createWindow();
}

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    showWindow();
  });

  app.whenReady().then(bootstrap).catch((error) => {
    console.error("LLMPulse failed to start:", error);
    app.quit();
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("window-all-closed", () => {
    // LLMPulse is a tray app; it stays alive with no visible window.
  });

  app.on("activate", () => {
    showWindow();
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (event) => event.preventDefault());
  });
}
