import type { ProviderPreset } from "./types";

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    description: "GPT and reasoning models",
    docsUrl: "https://platform.openai.com/api-keys",
    requiresApiKey: true,
    local: false,
    color: "#10a37f",
    glyph: "AI"
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    description: "Claude models",
    docsUrl: "https://console.anthropic.com/settings/keys",
    requiresApiKey: true,
    local: false,
    color: "#d97757",
    glyph: "A"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    description: "Gemini via AI Studio",
    docsUrl: "https://aistudio.google.com/app/apikey",
    requiresApiKey: true,
    local: false,
    color: "#4285f4",
    glyph: "G"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    description: "DeepSeek chat models",
    docsUrl: "https://platform.deepseek.com/api_keys",
    requiresApiKey: true,
    local: false,
    color: "#4d6bfe",
    glyph: "D"
  },
  {
    id: "groq",
    name: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    description: "Fast hosted inference",
    docsUrl: "https://console.groq.com/keys",
    requiresApiKey: true,
    local: false,
    color: "#f55036",
    glyph: "GQ"
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    description: "Many models, one key",
    docsUrl: "https://openrouter.ai/keys",
    requiresApiKey: true,
    local: false,
    color: "#8b5cf6",
    glyph: "R"
  },
  {
    id: "mistral",
    name: "Mistral AI",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    description: "Mistral and Codestral",
    docsUrl: "https://console.mistral.ai/api-keys",
    requiresApiKey: true,
    local: false,
    color: "#fa520f",
    glyph: "M"
  },
  {
    id: "xai",
    name: "xAI",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    description: "Grok models",
    docsUrl: "https://console.x.ai",
    requiresApiKey: true,
    local: false,
    color: "#cbd5e1",
    glyph: "x"
  },
  {
    id: "ollama",
    name: "Ollama",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    description: "Local models on this PC",
    docsUrl: "https://ollama.com",
    requiresApiKey: false,
    local: true,
    color: "#e7e5e4",
    glyph: "O"
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    kind: "openai",
    baseUrl: "http://localhost:1234/v1",
    description: "Local OpenAI-compatible server",
    docsUrl: "https://lmstudio.ai/docs/app/api",
    requiresApiKey: false,
    local: true,
    color: "#a78bfa",
    glyph: "LM"
  },
  {
    id: "custom",
    name: "Custom endpoint",
    kind: "openai",
    baseUrl: "https://",
    description: "Any OpenAI-compatible API",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    requiresApiKey: false,
    local: false,
    color: "#94a3b8",
    glyph: "+"
  }
];

export const PRESET_BY_ID = new Map(PROVIDER_PRESETS.map((preset) => [preset.id, preset]));

export function getPreset(presetId: string): ProviderPreset {
  return PRESET_BY_ID.get(presetId) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}
