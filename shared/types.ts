export type ProviderKind = "openai" | "anthropic" | "gemini";

export interface ProviderPreset {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  description: string;
  docsUrl: string;
  requiresApiKey: boolean;
  local: boolean;
  color: string;
  glyph: string;
}

export interface DetectedModel {
  id: string;
  label?: string;
  createdAt?: string;
}

export interface Account {
  id: string;
  name: string;
  presetId: string;
  presetName: string;
  kind: ProviderKind;
  baseUrl: string;
  hasApiKey: boolean;
  models: DetectedModel[];
  modelsUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountInput {
  id?: string;
  name: string;
  presetId: string;
  baseUrl: string;
  apiKey?: string;
  removeApiKey?: boolean;
}

export interface AppSettings {
  activeAccountId: string | null;
  activeModelId: string | null;
  launchAtLogin: boolean;
  notifications: boolean;
}

export interface Bootstrap {
  accounts: Account[];
  presets: ProviderPreset[];
  settings: AppSettings;
  appVersion: string;
  platform: string;
  dataPath: string;
}

export interface DetectionResult {
  models: DetectedModel[];
  fetchedAt: string;
  latencyMs: number;
}

export interface TestResult {
  ok: boolean;
  accountId: string;
  accountName: string;
  modelId: string;
  statusCode: number | null;
  latencyMs: number;
  responseText: string | null;
  error: string | null;
  testedAt: string;
}

export interface QuickTestEvent {
  result: TestResult;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface LlmPulseApi {
  getBootstrap(): Promise<ApiResult<Bootstrap>>;
  saveAccount(input: AccountInput): Promise<ApiResult<Account>>;
  deleteAccount(accountId: string): Promise<ApiResult<{ deleted: boolean }>>;
  detectModels(accountId: string): Promise<ApiResult<DetectionResult>>;
  testModel(accountId: string, modelId: string): Promise<ApiResult<TestResult>>;
  updateSettings(patch: Partial<AppSettings>): Promise<ApiResult<AppSettings>>;
  windowMinimize(): Promise<void>;
  windowHide(): Promise<void>;
  windowToggleMaximize(): Promise<boolean>;
  openExternal(url: string): Promise<ApiResult<{ opened: boolean }>>;
  showDataFolder(): Promise<ApiResult<{ opened: boolean }>>;
  quitApp(): Promise<void>;
  onQuickTestResult(callback: (event: QuickTestEvent) => void): () => void;
  onSettingsChanged(callback: (settings: AppSettings) => void): () => void;
  onShowAddAccount(callback: () => void): () => void;
}
