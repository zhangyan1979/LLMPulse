import { ArrowRight, MousePointer2, ShieldCheck, Zap } from "lucide-react";
import type { ProviderPreset } from "../../shared/types";
import { LogoMark, ProviderAvatar, SectionLabel } from "./ui";

export function EmptyWorkspace({
  presets,
  onAddAccount
}: {
  presets: ProviderPreset[];
  onAddAccount: () => void;
}) {
  const featured = presets.filter((preset) =>
    ["openai", "anthropic", "gemini", "deepseek", "groq", "ollama"].includes(preset.id)
  );

  return (
    <div className="empty-workspace">
      <div className="empty-hero">
        <div>
          <SectionLabel icon={<Zap size={12} />}>tray-first model checks</SectionLabel>
          <h1 className="empty-title">
            Know your models are alive
            <span> before you ship.</span>
          </h1>
          <p className="empty-subtitle">
            Connect the LLM accounts you already use. LLMPulse discovers their models and
            checks any one of them with a single click — then slips back into the tray.
          </p>
          <div className="empty-actions">
            <button type="button" className="button button-primary button-large" onClick={onAddAccount}>
              Connect your first account
              <ArrowRight size={16} />
            </button>
            <span className="empty-action-hint">
              <MousePointer2 size={14} />
              No dashboard babysitting required
            </span>
          </div>
          <div className="empty-providers">
            <span>Works with</span>
            <div className="provider-rail">
              {featured.map((preset) => (
                <span key={preset.id} className="provider-rail-item">
                  <ProviderAvatar preset={preset} size="sm" />
                  {preset.name}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="empty-visual" aria-hidden="true">
          <div className="visual-glow" />
          <div className="visual-orbit visual-orbit-one" />
          <div className="visual-orbit visual-orbit-two" />
          <div className="mock-check">
            <div className="mock-check-top">
              <LogoMark className="logo-mark-mini" />
              <span className="mock-live">
                <span /> live check
              </span>
              <span className="mock-time">10:42</span>
            </div>
            <div className="mock-model-name">claude-sonnet-4-5</div>
            <div className="mock-model-meta">anthropic · personal account</div>
            <svg className="mock-trace" viewBox="0 0 420 92" preserveAspectRatio="none">
              <path
                d="M0 50 H84 L100 50 L114 18 L134 78 L152 37 L168 50 H282 L300 50 L316 26 L338 72 L356 50 H420"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mock-result-row">
              <span className="mock-ok">responding</span>
              <span className="mock-latency">842 ms</span>
            </div>
          </div>
          <div className="visual-chip visual-chip-top">
            <span className="visual-chip-dot" />
            6 providers
          </div>
          <div className="visual-chip visual-chip-bottom">
            <ShieldCheck size={13} />
            DPAPI encrypted
          </div>
        </div>
      </div>

      <div className="empty-steps">
        <div className="empty-step">
          <span className="empty-step-number">01</span>
          <div>
            <strong>Connect an account</strong>
            <p>Use an API key for a hosted provider, or a local server URL.</p>
          </div>
        </div>
        <div className="empty-step">
          <span className="empty-step-number">02</span>
          <div>
            <strong>Models appear automatically</strong>
            <p>LLMPulse pulls the account’s model list over its native API.</p>
          </div>
        </div>
        <div className="empty-step">
          <span className="empty-step-number">03</span>
          <div>
            <strong>Check, then hide</strong>
            <p>Run a tiny prompt, read the latency, and close back to the tray.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
