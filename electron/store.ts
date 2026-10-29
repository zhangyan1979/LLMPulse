import { app, safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getPreset, PRESET_BY_ID } from "../shared/presets";
import type {
  Account,
  AccountInput,
  AppSettings,
  DetectedModel
} from "../shared/types";

const STORE_VERSION = 1;

interface PersistedAccount {
  id: string;
  name: string;
  presetId: string;
  baseUrl: string;
  apiKeyCipher: string | null;
  models: DetectedModel[];
  modelsUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PersistedData {
  version: number;
  accounts: PersistedAccount[];
  settings: AppSettings;
}

const DEFAULT_SETTINGS: AppSettings = {
  activeAccountId: null,
  activeModelId: null,
  launchAtLogin: false,
  notifications: true
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength = 500): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeBaseUrl(raw: string): string {
  const value = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid API base URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("The API base URL must use http:// or https://.");
  }
  if (!parsed.hostname) {
    throw new Error("The API base URL needs a hostname.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("The API base URL should not include query parameters or a fragment.");
  }
  return value;
}

function validateAccountInput(input: AccountInput): {
  name: string;
  presetId: string;
  baseUrl: string;
} {
  if (!isRecord(input)) {
    throw new Error("Invalid account details.");
  }
  const name = cleanString(input.name, 80);
  if (!name) {
    throw new Error("Give this account a name.");
  }
  const presetId = cleanString(input.presetId, 40);
  if (!PRESET_BY_ID.has(presetId)) {
    throw new Error("Choose a provider.");
  }
  const baseUrl = normalizeBaseUrl(cleanString(input.baseUrl, 500));
  return { name, presetId, baseUrl };
}

function uniqueModels(models: DetectedModel[]): DetectedModel[] {
  const seen = new Set<string>();
  const result: DetectedModel[] = [];
  for (const model of models) {
    if (!model || typeof model.id !== "string") continue;
    const id = model.id.trim().slice(0, 300);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      ...(model.label ? { label: model.label.slice(0, 200) } : {}),
      ...(model.createdAt ? { createdAt: model.createdAt.slice(0, 80) } : {})
    });
  }
  return result;
}

export class AppStore {
  private readonly filePath: string;
  private data: PersistedData = {
    version: STORE_VERSION,
    accounts: [],
    settings: { ...DEFAULT_SETTINGS }
  };
  private writeChain: Promise<void> = Promise.resolve();

  constructor() {
    this.filePath = path.join(app.getPath("userData"), "llmpulse.json");
  }

  get dataPath(): string {
    return app.getPath("userData");
  }

  async load(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) throw new Error("Store root is invalid.");
      this.data = this.sanitizePersisted(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        const backup = `${this.filePath}.corrupt-${Date.now()}`;
        try {
          await fs.copyFile(this.filePath, backup);
        } catch {
          // The original file may be unreadable; there is nothing else to preserve.
        }
        console.error("LLMPulse could not read its data file; starting with an empty store.");
      }
      this.data = {
        version: STORE_VERSION,
        accounts: [],
        settings: { ...DEFAULT_SETTINGS }
      };
    }
    this.ensureValidSelection();
  }

  getAccounts(): Account[] {
    return this.data.accounts.map((account) => this.toPublicAccount(account));
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  getPublicAccount(accountId: string): Account | null {
    const account = this.findAccount(accountId);
    return account ? this.toPublicAccount(account) : null;
  }

  hasApiKey(accountId: string): boolean {
    return Boolean(this.findAccount(accountId)?.apiKeyCipher);
  }

  async getApiKey(accountId: string): Promise<string | null> {
    const account = this.findAccount(accountId);
    if (!account?.apiKeyCipher) return null;
    const [version, payload] = account.apiKeyCipher.split(":", 2);
    if (version !== "v1" || !payload) {
      throw new Error("The saved API key is in an unknown format. Re-enter it.");
    }
    try {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw new Error("Secure storage is unavailable.");
      }
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(payload, "base64"));
      if (decrypted.shouldReEncrypt) {
        account.apiKeyCipher = await this.encryptApiKey(decrypted.result);
        await this.persist();
      }
      return decrypted.result;
    } catch {
      throw new Error("The saved API key could not be decrypted. Re-enter it.");
    }
  }

  async saveAccount(input: AccountInput): Promise<Account> {
    const { name, presetId, baseUrl } = validateAccountInput(input);
    const preset = getPreset(presetId);
    const now = new Date().toISOString();
    const existing = input.id ? this.findAccount(cleanString(input.id, 80)) : null;

    if (input.id && !existing) {
      throw new Error("That account no longer exists.");
    }

    let apiKeyCipher = existing?.apiKeyCipher ?? null;
    let credentialsChanged = false;

    if (input.removeApiKey) {
      credentialsChanged = Boolean(apiKeyCipher);
      apiKeyCipher = null;
    }

    const incomingKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
    if (incomingKey) {
      if (incomingKey.length > 10_000) {
        throw new Error("That API key is unusually long.");
      }
      apiKeyCipher = await this.encryptApiKey(incomingKey);
      credentialsChanged = true;
    }

    if (preset.requiresApiKey && !apiKeyCipher) {
      throw new Error(`${preset.name} needs an API key.`);
    }

    const endpointChanged = existing
      ? existing.baseUrl !== baseUrl || existing.presetId !== presetId
      : false;
    const resetModels = endpointChanged || credentialsChanged;

    if (existing) {
      existing.name = name;
      existing.presetId = presetId;
      existing.baseUrl = baseUrl;
      existing.apiKeyCipher = apiKeyCipher;
      existing.updatedAt = now;
      if (resetModels) {
        existing.models = [];
        existing.modelsUpdatedAt = null;
      }
      this.ensureValidSelection();
      await this.persist();
      return this.toPublicAccount(existing);
    }

    const account: PersistedAccount = {
      id: randomUUID(),
      name,
      presetId,
      baseUrl,
      apiKeyCipher,
      models: [],
      modelsUpdatedAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.data.accounts.push(account);
    if (!this.data.settings.activeAccountId) {
      this.data.settings.activeAccountId = account.id;
    }
    await this.persist();
    return this.toPublicAccount(account);
  }

  async setModels(
    accountId: string,
    models: DetectedModel[],
    fetchedAt: string
  ): Promise<Account> {
    const account = this.findAccount(accountId);
    if (!account) throw new Error("That account no longer exists.");
    account.models = uniqueModels(models);
    account.modelsUpdatedAt = fetchedAt;
    account.updatedAt = new Date().toISOString();
    this.ensureValidSelection();
    await this.persist();
    return this.toPublicAccount(account);
  }

  async deleteAccount(accountId: string): Promise<void> {
    const before = this.data.accounts.length;
    this.data.accounts = this.data.accounts.filter((account) => account.id !== accountId);
    if (this.data.accounts.length === before) {
      throw new Error("That account no longer exists.");
    }
    if (this.data.settings.activeAccountId === accountId) {
      this.data.settings.activeAccountId = this.data.accounts[0]?.id ?? null;
      this.data.settings.activeModelId = null;
    }
    await this.persist();
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...this.data.settings };
    if ("activeAccountId" in patch) {
      const id = patch.activeAccountId;
      if (id !== null && typeof id !== "string") {
        throw new Error("Invalid account selection.");
      }
      if (id && !this.findAccount(id)) {
        throw new Error("That account no longer exists.");
      }
      next.activeAccountId = id || null;
      if (next.activeAccountId !== this.data.settings.activeAccountId) {
        next.activeModelId = null;
      }
    }
    if ("activeModelId" in patch) {
      if (patch.activeModelId !== null && typeof patch.activeModelId !== "string") {
        throw new Error("Invalid model selection.");
      }
      next.activeModelId = patch.activeModelId?.slice(0, 300) || null;
    }
    if (typeof patch.launchAtLogin === "boolean") {
      next.launchAtLogin = patch.launchAtLogin;
    }
    if (typeof patch.notifications === "boolean") {
      next.notifications = patch.notifications;
    }
    this.data.settings = next;
    this.ensureValidSelection();
    await this.persist();
    return this.getSettings();
  }

  private ensureValidSelection(): void {
    const selected = this.data.accounts.find(
      (account) => account.id === this.data.settings.activeAccountId
    );
    if (!selected) {
      this.data.settings.activeAccountId = this.data.accounts[0]?.id ?? null;
      this.data.settings.activeModelId = null;
      return;
    }
    if (
      this.data.settings.activeModelId &&
      !selected.models.some((model) => model.id === this.data.settings.activeModelId)
    ) {
      this.data.settings.activeModelId = null;
    }
  }

  private findAccount(accountId: string): PersistedAccount | undefined {
    return this.data.accounts.find((account) => account.id === accountId);
  }

  private async encryptApiKey(apiKey: string): Promise<string> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new Error(
        "Windows secure credential storage is unavailable. LLMPulse will not save a key unprotected."
      );
    }
    const encrypted = await safeStorage.encryptStringAsync(apiKey);
    return `v1:${encrypted.toString("base64")}`;
  }

  private toPublicAccount(account: PersistedAccount): Account {
    const preset = getPreset(account.presetId);
    return {
      id: account.id,
      name: account.name,
      presetId: account.presetId,
      presetName: preset.name,
      kind: preset.kind,
      baseUrl: account.baseUrl,
      hasApiKey: Boolean(account.apiKeyCipher),
      models: account.models.map((model) => ({ ...model })),
      modelsUpdatedAt: account.modelsUpdatedAt,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    };
  }

  private sanitizePersisted(parsed: Record<string, unknown>): PersistedData {
    const rawAccounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const accounts: PersistedAccount[] = [];
    for (const raw of rawAccounts) {
      if (!isRecord(raw)) continue;
      const id = cleanString(raw.id, 80);
      const name = cleanString(raw.name, 80);
      const presetId = cleanString(raw.presetId, 40);
      if (!id || !name || !PRESET_BY_ID.has(presetId)) continue;
      let baseUrl: string;
      try {
        baseUrl = normalizeBaseUrl(cleanString(raw.baseUrl, 500));
      } catch {
        continue;
      }
      const rawModels = Array.isArray(raw.models) ? raw.models : [];
      const models: DetectedModel[] = [];
      for (const rawModel of rawModels) {
        if (!isRecord(rawModel)) continue;
        const modelId = cleanString(rawModel.id, 300);
        if (!modelId) continue;
        models.push({
          id: modelId,
          ...(cleanString(rawModel.label, 200)
            ? { label: cleanString(rawModel.label, 200) }
            : {}),
          ...(cleanString(rawModel.createdAt, 80)
            ? { createdAt: cleanString(rawModel.createdAt, 80) }
            : {})
        });
      }
      const now = new Date().toISOString();
      accounts.push({
        id,
        name,
        presetId,
        baseUrl,
        apiKeyCipher: cleanString(raw.apiKeyCipher, 100_000) || null,
        models: uniqueModels(models),
        modelsUpdatedAt: cleanString(raw.modelsUpdatedAt, 80) || null,
        createdAt: cleanString(raw.createdAt, 80) || now,
        updatedAt: cleanString(raw.updatedAt, 80) || now
      });
    }

    const rawSettings = isRecord(parsed.settings) ? parsed.settings : {};
    const settings: AppSettings = {
      activeAccountId:
        typeof rawSettings.activeAccountId === "string"
          ? rawSettings.activeAccountId
          : null,
      activeModelId:
        typeof rawSettings.activeModelId === "string" ? rawSettings.activeModelId : null,
      launchAtLogin: rawSettings.launchAtLogin === true,
      notifications: rawSettings.notifications !== false
    };
    return {
      version: STORE_VERSION,
      accounts,
      settings
    };
  }

  private async persist(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2);
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    const write = this.writeChain.catch(() => undefined).then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(tempPath, payload, { encoding: "utf8", mode: 0o600 });
      try {
        await fs.rename(tempPath, this.filePath);
      } catch {
        await fs.copyFile(tempPath, this.filePath);
        await fs.rm(tempPath, { force: true });
      }
    });
    this.writeChain = write;
    await write;
  }
}
