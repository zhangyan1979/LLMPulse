import { contextBridge, ipcRenderer } from "electron";
import type {
  AccountInput,
  AppSettings,
  LlmPulseApi,
  QuickTestEvent
} from "../shared/types";

const api: LlmPulseApi = {
  getBootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  saveAccount: (input: AccountInput) => ipcRenderer.invoke("account:save", input),
  deleteAccount: (accountId: string) => ipcRenderer.invoke("account:delete", accountId),
  detectModels: (accountId: string) => ipcRenderer.invoke("account:detect", accountId),
  testModel: (accountId: string, modelId: string) =>
    ipcRenderer.invoke("account:test", accountId, modelId),
  updateSettings: (patch: Partial<AppSettings>) =>
    ipcRenderer.invoke("settings:update", patch),
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowHide: () => ipcRenderer.invoke("window:hide"),
  windowToggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  showDataFolder: () => ipcRenderer.invoke("app:show-data-folder"),
  quitApp: () => ipcRenderer.invoke("app:quit"),
  onQuickTestResult: (callback: (event: QuickTestEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: QuickTestEvent) => {
      callback(payload);
    };
    ipcRenderer.on("quick-test-result", listener);
    return () => ipcRenderer.removeListener("quick-test-result", listener);
  },
  onSettingsChanged: (callback: (settings: AppSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: AppSettings) => {
      callback(settings);
    };
    ipcRenderer.on("settings-changed", listener);
    return () => ipcRenderer.removeListener("settings-changed", listener);
  },
  onShowAddAccount: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("ui:show-add-account", listener);
    return () => ipcRenderer.removeListener("ui:show-add-account", listener);
  }
};

contextBridge.exposeInMainWorld("llmPulse", api);
