import { sortModels } from "../shared/models";
import type {
  DetectedModel,
  DetectionResult,
  ProviderKind,
  TestResult
} from "../shared/types";

const DETECT_TIMEOUT_MS = 25_000;
const TEST_TIMEOUT_MS = 45_000;
const MODEL_LIMIT = 2_000;

type FetchImplementation = (input: string, init?: RequestInit) => Promise<Response>;

let fetchImplementation: FetchImplementation = (input, init) => fetch(input, init);

/**
 * Use Electron's proxy-aware net stack in production, while keeping the
 * provider layer testable under plain Node.
 */
export function setFetchImplementation(implementation: FetchImplementation): void {
  fetchImplementation = implementation;
}

export class ProviderError extends Error {
  readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null = null) {
    super(message);
    this.name = "ProviderError";
    this.statusCode = statusCode;
  }
}

export interface ProviderAccount {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string | null;
}

export interface ProviderHttpResponse {
  status: number;
  ok: boolean;
  data: unknown;
  rawText: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max = 240): string {
  const clean = stripMarkup(text);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function redactSecrets(text: string, apiKey: string | null): string {
  if (!apiKey) return text;
  return apiKey ? text.split(apiKey).join("[redacted]") : text;
}

function providerDetail(data: unknown, rawText: string): string {
  if (isRecord(data)) {
    const directMessage = getString(data.message);
    if (directMessage) return truncate(directMessage);
    const nestedError = data.error;
    if (typeof nestedError === "string") return truncate(nestedError);
    if (isRecord(nestedError)) {
      const nestedMessage = getString(nestedError.message);
      if (nestedMessage) return truncate(nestedMessage);
      const nestedCode = getString(nestedError.code);
      if (nestedCode) return truncate(nestedCode);
    }
    const detail = getString(data.detail);
    if (detail) return truncate(detail);
  }
  return truncate(rawText);
}

function httpErrorMessage(
  response: ProviderHttpResponse,
  action: "detect" | "test",
  apiKey: string | null
): string {
  const detail = redactSecrets(providerDetail(response.data, response.rawText), apiKey);
  const suffix = detail ? ` ${detail}` : "";
  switch (response.status) {
    case 400:
      return `The provider rejected the request.${suffix}`;
    case 401:
      return `Authentication failed (HTTP 401). Check that the API key is valid for this account.${suffix}`;
    case 403:
      return `Access denied (HTTP 403). This key may not have permission for that request.${suffix}`;
    case 404:
      return action === "detect"
        ? `The models endpoint was not found (HTTP 404). Check the API base URL; OpenAI-compatible URLs usually end in /v1.${suffix}`
        : `The model or endpoint was not found (HTTP 404). Refresh the model list and try again.${suffix}`;
    case 408:
    case 504:
      return `The provider timed out (HTTP ${response.status}). Try again.${suffix}`;
    case 429:
      return `The provider rate-limited this request (HTTP 429). Wait a moment and try again.${suffix}`;
    default:
      return `The provider returned HTTP ${response.status}.${suffix}`;
  }
}

function networkErrorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof Error) {
    if (error.name === "AbortError") return "The request timed out.";
    const cause = error.cause as { code?: string } | undefined;
    const code = cause?.code;
    const message = error.message;
    if (code === "ENOTFOUND" || /ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/i.test(message)) {
      return "Could not resolve the API host. Check the base URL and your connection.";
    }
    if (code === "ECONNREFUSED" || /ERR_CONNECTION_REFUSED/i.test(message)) {
      return "The connection was refused. Is the local model server running?";
    }
    if (code === "ECONNRESET") return "The connection was reset by the provider. Try again.";
    if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/i.test(message)) {
      return "The network connection was interrupted. Check your connection and try again.";
    }
    if (/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/i.test(message)) {
      return "The provider did not respond in time. Check the endpoint and network.";
    }
    if (
      code === "CERT_HAS_EXPIRED" ||
      code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
      /ERR_CERT_|ERR_SSL_PROTOCOL_ERROR/i.test(message)
    ) {
      return "The provider's TLS certificate could not be verified.";
    }
    if (message.toLowerCase().includes("redirect")) {
      return "The endpoint redirected to another URL. Use the final API base URL directly.";
    }
    return truncate(message.replace(/^net::/, ""), 260);
  }
  return "The request failed for an unknown reason.";
}

async function request(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<ProviderHttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(url, {
      ...options,
      redirect: "error",
      signal: controller.signal
    });
    const rawText = await response.text();
    let data: unknown = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }
    return {
      status: response.status,
      ok: response.ok,
      data,
      rawText
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError(
        `The request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
      );
    }
    throw new ProviderError(networkErrorMessage(error));
  } finally {
    clearTimeout(timer);
  }
}

function baseHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "LLMPulse/1.0"
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function anthropicHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "anthropic-version": "2023-06-01",
    "User-Agent": "LLMPulse/1.0"
  };
  if (apiKey) headers["x-api-key"] = apiKey;
  return headers;
}

function geminiHeaders(apiKey: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "LLMPulse/1.0"
  };
  if (apiKey) headers["x-goog-api-key"] = apiKey;
  return headers;
}

function trimBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function anthropicRoot(baseUrl: string): string {
  const base = trimBase(baseUrl);
  return /\/v1$/i.test(base) ? base : `${base}/v1`;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseOpenAiModels(data: unknown): DetectedModel[] {
  if (!isRecord(data)) return [];
  const rows = asArray(data.data).length ? asArray(data.data) : asArray(data.models);
  const models: DetectedModel[] = [];
  for (const row of rows) {
    if (typeof row === "string") {
      models.push({ id: row });
      continue;
    }
    if (!isRecord(row)) continue;
    const id = getString(row.id);
    if (!id) continue;
    const created =
      typeof row.created === "number" ? new Date(row.created * 1000).toISOString() : undefined;
    models.push({
      id,
      ...(getString(row.display_name) ? { label: getString(row.display_name)! } : {}),
      ...(created ? { createdAt: created } : {})
    });
  }
  return models;
}

function parseAnthropicModels(data: unknown): DetectedModel[] {
  if (!isRecord(data)) return [];
  const models: DetectedModel[] = [];
  for (const row of asArray(data.data)) {
    if (!isRecord(row)) continue;
    const id = getString(row.id);
    if (!id) continue;
    models.push({
      id,
      ...(getString(row.display_name) ? { label: getString(row.display_name)! } : {}),
      ...(getString(row.created_at) ? { createdAt: getString(row.created_at)! } : {})
    });
  }
  return models;
}

function parseGeminiModels(data: unknown): DetectedModel[] {
  if (!isRecord(data)) return [];
  const models: DetectedModel[] = [];
  for (const row of asArray(data.models)) {
    if (!isRecord(row)) continue;
    const rawName = getString(row.name);
    if (!rawName) continue;
    const methods = asArray(row.supportedGenerationMethods).filter(
      (value): value is string => typeof value === "string"
    );
    if (methods.length > 0 && !methods.includes("generateContent")) continue;
    const id = rawName.replace(/^models\//, "");
    models.push({
      id,
      ...(getString(row.displayName) ? { label: getString(row.displayName)! } : {}),
      ...(getString(row.createTime) ? { createdAt: getString(row.createTime)! } : {})
    });
  }
  return models;
}

async function detectOpenAi(account: ProviderAccount): Promise<DetectedModel[]> {
  const response = await request(
    `${trimBase(account.baseUrl)}/models`,
    { method: "GET", headers: baseHeaders(account.apiKey) },
    DETECT_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new ProviderError(
      httpErrorMessage(response, "detect", account.apiKey),
      response.status
    );
  }
  return parseOpenAiModels(response.data);
}

async function detectAnthropic(account: ProviderAccount): Promise<DetectedModel[]> {
  const root = anthropicRoot(account.baseUrl);
  const models: DetectedModel[] = [];
  let afterId: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ limit: "1000" });
    if (afterId) query.set("after_id", afterId);
    const response = await request(
      `${root}/models?${query.toString()}`,
      { method: "GET", headers: anthropicHeaders(account.apiKey) },
      DETECT_TIMEOUT_MS
    );
    if (!response.ok) {
      throw new ProviderError(
        httpErrorMessage(response, "detect", account.apiKey),
        response.status
      );
    }
    models.push(...parseAnthropicModels(response.data));
    if (models.length >= MODEL_LIMIT) break;
    if (!isRecord(response.data) || response.data.has_more !== true) break;
    afterId = getString(response.data.last_id);
    if (!afterId) break;
  }
  return models;
}

async function detectGemini(account: ProviderAccount): Promise<DetectedModel[]> {
  const base = trimBase(account.baseUrl);
  const models: DetectedModel[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const query = new URLSearchParams({ pageSize: "1000" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await request(
      `${base}/models?${query.toString()}`,
      { method: "GET", headers: geminiHeaders(account.apiKey) },
      DETECT_TIMEOUT_MS
    );
    if (!response.ok) {
      throw new ProviderError(
        httpErrorMessage(response, "detect", account.apiKey),
        response.status
      );
    }
    models.push(...parseGeminiModels(response.data));
    if (models.length >= MODEL_LIMIT) break;
    pageToken = isRecord(response.data) ? getString(response.data.nextPageToken) : null;
    if (!pageToken) break;
  }
  return models;
}

export async function detectModels(account: ProviderAccount): Promise<DetectionResult> {
  const startedAt = Date.now();
  let models: DetectedModel[];
  if (account.kind === "anthropic") {
    models = await detectAnthropic(account);
  } else if (account.kind === "gemini") {
    models = await detectGemini(account);
  } else {
    models = await detectOpenAi(account);
  }
  const deduped = new Map<string, DetectedModel>();
  for (const model of models) {
    if (!deduped.has(model.id)) deduped.set(model.id, model);
  }
  const sorted = sortModels([...deduped.values()]);
  return {
    models: sorted,
    fetchedAt: new Date().toISOString(),
    latencyMs: Date.now() - startedAt
  };
}

function extractTextParts(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const parts: string[] = [];
  for (const part of value) {
    if (typeof part === "string") {
      parts.push(part);
    } else if (isRecord(part)) {
      const text = getString(part.text);
      if (text) parts.push(text);
    }
  }
  return parts.join("\n").trim();
}

function extractOpenAiText(data: unknown): string {
  if (!isRecord(data)) return "";
  const choices = asArray(data.choices);
  const first = choices[0];
  if (!isRecord(first)) return "";
  const message = isRecord(first.message) ? first.message : null;
  if (message) {
    const content = message.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    const partsText = extractTextParts(content);
    if (partsText) return partsText;
    const reasoning = getString(message.reasoning_content) ?? getString(message.reasoning);
    if (reasoning) return reasoning.trim();
  }
  const text = getString(first.text);
  return text ? text.trim() : "";
}

function extractAnthropicText(data: unknown): string {
  if (!isRecord(data)) return "";
  const parts = asArray(data.content)
    .map((part) => (isRecord(part) && part.type === "text" ? getString(part.text) : null))
    .filter((value): value is string => Boolean(value));
  return parts.join("\n").trim();
}

function extractGeminiText(data: unknown): string {
  if (!isRecord(data)) return "";
  const candidates = asArray(data.candidates);
  const first = candidates[0];
  if (!isRecord(first)) return "";
  const content = isRecord(first.content) ? first.content : null;
  if (!content) return "";
  return extractTextParts(content.parts);
}

function cleanResponseText(text: string): string {
  const collapsed = text.replace(/\r\n/g, "\n").trim();
  return collapsed.length > 1_400 ? `${collapsed.slice(0, 1_399)}…` : collapsed;
}

async function testOpenAi(account: ProviderAccount, modelId: string): Promise<{
  text: string;
  status: number;
}> {
  const response = await request(
    `${trimBase(account.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        ...baseHeaders(account.apiKey),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Reply with exactly OK and nothing else." }],
        stream: false
      })
    },
    TEST_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new ProviderError(httpErrorMessage(response, "test", account.apiKey), response.status);
  }
  return { text: cleanResponseText(extractOpenAiText(response.data)), status: response.status };
}

async function testAnthropic(account: ProviderAccount, modelId: string): Promise<{
  text: string;
  status: number;
}> {
  const response = await request(
    `${anthropicRoot(account.baseUrl)}/messages`,
    {
      method: "POST",
      headers: {
        ...anthropicHeaders(account.apiKey),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 64,
        messages: [{ role: "user", content: "Reply with exactly OK and nothing else." }]
      })
    },
    TEST_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new ProviderError(httpErrorMessage(response, "test", account.apiKey), response.status);
  }
  return { text: cleanResponseText(extractAnthropicText(response.data)), status: response.status };
}

async function testGemini(account: ProviderAccount, modelId: string): Promise<{
  text: string;
  status: number;
}> {
  const id = modelId.replace(/^models\//, "");
  const response = await request(
    `${trimBase(account.baseUrl)}/models/${encodeURIComponent(id)}:generateContent`,
    {
      method: "POST",
      headers: {
        ...geminiHeaders(account.apiKey),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with exactly OK and nothing else." }] }],
        generationConfig: { maxOutputTokens: 1_024, temperature: 0 }
      })
    },
    TEST_TIMEOUT_MS
  );
  if (!response.ok) {
    throw new ProviderError(httpErrorMessage(response, "test", account.apiKey), response.status);
  }
  return { text: cleanResponseText(extractGeminiText(response.data)), status: response.status };
}

export async function testModel(
  account: ProviderAccount,
  modelId: string
): Promise<TestResult> {
  const startedAt = Date.now();
  const baseResult: Omit<TestResult, "ok" | "statusCode" | "responseText" | "error"> = {
    accountId: account.id,
    accountName: account.name,
    modelId,
    latencyMs: 0,
    testedAt: new Date().toISOString()
  };
  try {
    let outcome: { text: string; status: number };
    if (account.kind === "anthropic") {
      outcome = await testAnthropic(account, modelId);
    } else if (account.kind === "gemini") {
      outcome = await testGemini(account, modelId);
    } else {
      outcome = await testOpenAi(account, modelId);
    }
    const latencyMs = Date.now() - startedAt;
    if (!outcome.text) {
      return {
        ...baseResult,
        latencyMs,
        testedAt: new Date().toISOString(),
        ok: false,
        statusCode: outcome.status,
        responseText: null,
        error: "The provider accepted the request but returned no text. The model may be unavailable."
      };
    }
    return {
      ...baseResult,
      latencyMs,
      testedAt: new Date().toISOString(),
      ok: true,
      statusCode: outcome.status,
      responseText: outcome.text,
      error: null
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const message =
      error instanceof ProviderError
        ? error.message
        : networkErrorMessage(error);
    return {
      ...baseResult,
      latencyMs,
      testedAt: new Date().toISOString(),
      ok: false,
      statusCode: error instanceof ProviderError ? error.statusCode : null,
      responseText: null,
      error: redactSecrets(message, account.apiKey)
    };
  }
}
