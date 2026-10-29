import { isLikelyChatModel } from "../../shared/models";
import type { DetectedModel } from "../../shared/types";

export const MODEL_CACHE_MS = 15 * 60 * 1000;

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function hostLabel(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    const pathname = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${parsed.host}${pathname}`;
  } catch {
    return baseUrl;
  }
}

export function formatLatency(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1_000).toFixed(2)} s`;
}

export function relativeTime(iso: string | null, now = Date.now()): string {
  if (!iso) return "not yet";
  const value = new Date(iso).getTime();
  if (!Number.isFinite(value)) return "not yet";
  const seconds = Math.max(0, Math.round((now - value) / 1_000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function isModelsFresh(iso: string | null): boolean {
  if (!iso) return false;
  const value = new Date(iso).getTime();
  return Number.isFinite(value) && Date.now() - value < MODEL_CACHE_MS;
}

const PREFERRED_MODEL_PATTERNS = [
  /^gpt-5(?!.*(mini|nano|audio|realtime))/i,
  /^gpt-4\.1(?!.*mini)/i,
  /^gpt-4o(?!.*mini)/i,
  /claude-(sonnet|opus)/i,
  /gemini-.*(flash|pro)/i,
  /deepseek-chat/i,
  /mistral-large/i,
  /llama-3\.[13]-70b/i,
  /grok-[34]/i,
  /command-r/i,
  /qwen.*(max|plus)/i
];

/**
 * Pick a sensible first model instead of whatever happens to sort first.
 * Falls back to the first chat-shaped model in the provider's list.
 */
export function pickDefaultModel(models: DetectedModel[]): string | null {
  if (models.length === 0) return null;
  const chatModels = models.filter((model) => isLikelyChatModel(model.id));
  for (const pattern of PREFERRED_MODEL_PATTERNS) {
    const match = chatModels.find((model) => pattern.test(model.id));
    if (match) return match.id;
  }
  return (chatModels[0] ?? models[0]).id;
}

export function truncate(value: string, max = 90): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  const numeric = Number.parseInt(full, 16);
  if (!Number.isFinite(numeric)) return `rgba(148, 163, 184, ${alpha})`;
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
