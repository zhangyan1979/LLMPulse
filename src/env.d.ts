import type { LlmPulseApi } from "../shared/types";

declare global {
  interface Window {
    llmPulse: LlmPulseApi;
  }
}

export {};
