import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Check,
  Clock3,
  CornerDownLeft,
  Gauge,
  ShieldCheck
} from "lucide-react";
import type { TestResult } from "../../shared/types";
import { classNames, formatClock, formatLatency, truncate } from "../lib/format";
import { SectionLabel, Spinner } from "./ui";

export type CheckState =
  | { status: "idle" }
  | { status: "running"; startedAt: number; modelId: string }
  | { status: "complete"; result: TestResult };

function useElapsed(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }
    setElapsed(Date.now() - startedAt);
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return elapsed;
}

function PulseTrace({ animated }: { animated: boolean }) {
  return (
    <div className={classNames("pulse-trace", animated && "pulse-trace-animated")} aria-hidden="true">
      <svg viewBox="0 0 700 110" preserveAspectRatio="none">
        <path
          className="pulse-trace-glow"
          d="M0 58 H126 L146 58 L162 23 L185 86 L207 43 L224 58 H358 L376 58 L394 32 L416 76 L438 58 H700"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="pulse-trace-line"
          d="M0 58 H126 L146 58 L162 23 L185 86 L207 43 L224 58 H358 L376 58 L394 32 L416 76 L438 58 H700"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function ResultPanel({ state }: { state: CheckState }) {
  const runningStartedAt = state.status === "running" ? state.startedAt : null;
  const elapsed = useElapsed(runningStartedAt);

  if (state.status === "idle") {
    return (
      <section className="result-panel result-idle">
        <div className="result-main">
          <div className="result-status-row">
            <span className="result-icon result-icon-idle">
              <Activity size={22} />
            </span>
            <div>
              <SectionLabel>last check</SectionLabel>
              <h2 className="result-title">Ready when you are.</h2>
              <p className="result-description">
                Pick a detected model and send a one-line prompt. LLMPulse reports the
                round-trip time and the reply.
              </p>
            </div>
          </div>
        </div>
        <PulseTrace animated={false} />
        <div className="result-idle-hint">
          <CornerDownLeft size={14} />
          <span>
            Press <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">Enter</kbd> to run a check
          </span>
        </div>
      </section>
    );
  }

  if (state.status === "running") {
    return (
      <section className="result-panel result-running">
        <div className="result-main">
          <div className="result-status-row">
            <span className="result-icon result-icon-running">
              <Spinner size={23} />
            </span>
            <div className="result-running-copy">
              <SectionLabel>check in progress</SectionLabel>
              <h2 className="result-title">
                Waiting on <span className="mono">{truncate(state.modelId, 44)}</span>
              </h2>
              <p className="result-description">
                Sent a tiny prompt. This can take a little longer for reasoning models.
              </p>
            </div>
            <div className="running-clock">
              <span>{(elapsed / 1_000).toFixed(1)}</span>
              <small>sec</small>
            </div>
          </div>
        </div>
        <PulseTrace animated />
        <div className="result-idle-hint">
          <Clock3 size={14} />
          <span>The request will time out after 45 seconds.</span>
        </div>
      </section>
    );
  }

  const result = state.result;
  const success = result.ok;
  return (
    <section className={classNames("result-panel", success ? "result-success" : "result-failure")}>
      <div className="result-main">
        <div className="result-status-row result-status-row-complete">
          <span className={classNames("result-icon", success ? "result-icon-success" : "result-icon-failure")}>
            {success ? <Check size={24} /> : <AlertTriangle size={23} />}
          </span>
          <div>
            <SectionLabel>last check</SectionLabel>
            <h2 className="result-title">
              {success ? "The model is responding." : "The model didn’t answer."}
            </h2>
            <p className="result-description">
              {success
                ? "Round trip completed and returned text."
                : "The request did not complete successfully."}
            </p>
          </div>
          <div className="result-metrics">
            <div className="metric">
              <Gauge size={14} />
              <span className="metric-label">latency</span>
              <strong>{formatLatency(result.latencyMs)}</strong>
            </div>
            <div className="metric">
              <ShieldCheck size={14} />
              <span className="metric-label">http</span>
              <strong>{result.statusCode ?? "—"}</strong>
            </div>
          </div>
        </div>

        <div className={classNames("result-output", !success && "result-output-error")}>
          <div className="result-output-head">
            <span>{success ? "response" : "what happened"}</span>
            <span className="result-output-model mono">{result.modelId}</span>
          </div>
          {success ? (
            <pre className="result-response">{result.responseText || "(empty response)"}</pre>
          ) : (
            <p className="result-error-text">{result.error ?? "The request failed."}</p>
          )}
        </div>
      </div>

      <div className="result-footer">
        <span>Checked at {formatClock(result.testedAt)}</span>
        <span className="result-footer-dot" />
        <span>{result.accountName}</span>
        <span className="result-footer-spacer" />
        <span className={classNames("result-verdict", success ? "is-success" : "is-failure")}>
          {success ? "healthy" : "needs attention"}
        </span>
      </div>
    </section>
  );
}
