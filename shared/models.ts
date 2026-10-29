import type { DetectedModel } from "./types";

const NON_CHAT_PATTERN =
  /(embedding|embed-|whisper|tts|dall-e|moderation|rerank|bge-|clip-|transcribe|speech|audio|voice|realtime|image|sora|video|ocr|stable-diffusion|flux|guard|safety|similarity|classif|deplot|computer-use|omni-moderation)/i;

/**
 * Model lists from providers also contain embeddings, image, speech and other
 * non-chat models. Keep them available, but put chat-shaped models first.
 */
export function isLikelyChatModel(modelId: string): boolean {
  return !NON_CHAT_PATTERN.test(modelId);
}

export function sortModels(models: DetectedModel[]): DetectedModel[] {
  return [...models].sort((a, b) => {
    const aChat = isLikelyChatModel(a.id);
    const bChat = isLikelyChatModel(b.id);
    if (aChat !== bChat) return aChat ? -1 : 1;
    return a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" });
  });
}

export function modelLabel(model: DetectedModel): string {
  if (model.label && model.label !== model.id) return model.label;
  return model.id;
}
