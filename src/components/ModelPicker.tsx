import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  MessageSquareText,
  RefreshCw,
  Search,
  Shapes
} from "lucide-react";
import { isLikelyChatModel, modelLabel } from "../../shared/models";
import type { DetectedModel } from "../../shared/types";
import { classNames, relativeTime } from "../lib/format";
import { Spinner } from "./ui";

export function ModelPicker({
  models,
  value,
  onChange,
  onRefresh,
  loading,
  updatedAt,
  disabled
}: {
  models: DetectedModel[];
  value: string | null;
  onChange: (modelId: string) => void;
  onRefresh: () => void;
  loading: boolean;
  updatedAt: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const chatCount = models.filter((model) => isLikelyChatModel(model.id)).length;
  const otherCount = models.length - chatCount;
  const baseModels = showAll || chatCount === 0 ? models : models.filter((model) => isLikelyChatModel(model.id));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleModels = normalizedQuery
    ? baseModels.filter((model) =>
        `${model.id} ${model.label ?? ""}`.toLowerCase().includes(normalizedQuery)
      )
    : baseModels;
  const selectedModel = models.find((model) => model.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHighlighted(0);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, showAll]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const select = (modelId: string) => {
    onChange(modelId);
    close();
  };

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={classNames("model-trigger", open && "model-trigger-open")}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled || (models.length === 0 && !loading)}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="model-trigger-icon">
          <MessageSquareText size={17} />
        </span>
        <span className="model-trigger-copy">
          <span className={classNames("model-trigger-value", !selectedModel && "is-placeholder")}>
            {selectedModel ? selectedModel.id : models.length === 0 ? "No models available" : "Select a model"}
          </span>
          <span className="model-trigger-meta">
            {selectedModel
              ? selectedModel.label && selectedModel.label !== selectedModel.id
                ? selectedModel.label
                : `${models.length} detected models`
              : models.length > 0
                ? `${chatCount} chat models ready`
                : loading
                  ? "Discovering models…"
                  : "Refresh to discover models"}
          </span>
        </span>
        {loading ? <Spinner size={17} /> : <ChevronDown size={17} className="model-trigger-chevron" />}
      </button>

      {open && (
        <div className="model-popover">
          <div className="model-search">
            <Search size={15} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  close();
                } else if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlighted((index) => Math.min(index + 1, visibleModels.length - 1));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlighted((index) => Math.max(index - 1, 0));
                } else if (event.key === "Enter" && visibleModels[highlighted]) {
                  event.preventDefault();
                  select(visibleModels[highlighted].id);
                }
              }}
              placeholder="Search models…"
              aria-label="Search models"
              spellCheck={false}
            />
            <span className="model-search-count">{visibleModels.length}</span>
          </div>

          <div className="model-filter-row">
            <span>{chatCount > 0 ? `${chatCount} chat models` : `${models.length} models`}</span>
            {otherCount > 0 && (
              <button type="button" onClick={() => setShowAll((current) => !current)}>
                {showAll ? "Chat models only" : `Show all ${models.length}`}
              </button>
            )}
          </div>

          <div className="model-list" role="listbox" aria-label="Available models">
            {visibleModels.map((model, index) => {
              const isSelected = model.id === value;
              const isChat = isLikelyChatModel(model.id);
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={model.id}
                  ref={(element) => {
                    optionRefs.current[index] = element;
                  }}
                  className={classNames(
                    "model-option",
                    highlighted === index && "model-option-highlighted",
                    isSelected && "model-option-selected"
                  )}
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => select(model.id)}
                >
                  <span className={classNames("model-option-icon", !isChat && "model-option-icon-other")}>
                    {isChat ? <MessageSquareText size={14} /> : <Shapes size={14} />}
                  </span>
                  <span className="model-option-copy">
                    <span className="model-option-id">{model.id}</span>
                    {model.label && model.label !== model.id && (
                      <span className="model-option-label">{modelLabel(model)}</span>
                    )}
                  </span>
                  {!isChat && <span className="model-option-tag">other</span>}
                  {isSelected && <Check size={15} className="model-option-check" />}
                </button>
              );
            })}
            {visibleModels.length === 0 && (
              <div className="model-no-results">
                {normalizedQuery ? (
                  <>
                    <Search size={17} />
                    <span>No models match “{query.trim()}”.</span>
                  </>
                ) : (
                  <>
                    <Shapes size={17} />
                    <span>This account returned no usable models.</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="model-footer">
            <span>Detected {relativeTime(updatedAt)}</span>
            <button
              type="button"
              onClick={() => {
                onRefresh();
                close();
              }}
              disabled={loading}
            >
              {loading ? <Spinner size={13} /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
