"use client";

import { useState } from "react";
import { ChevronDown, Zap, Brain, Activity, Hash } from "lucide-react";
import { formatCost, estimateCost, ChatModel } from "@/lib/chat-models";

// Types for message metadata from the API
export interface MessageMetadata {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  finishReason?: string;
  latencyMs?: number;
}

interface ConversationSummaryProps {
  messages: Array<{
    role: string;
    metadata?: MessageMetadata;
  }>;
  currentModel: string;
  modelPricing?: ChatModel["pricing"];
}

/**
 * Conversation Summary - Expandable panel showing cumulative stats
 * Displayed above the chat input area
 */
export function ConversationSummary({
  messages,
  currentModel,
  modelPricing,
}: ConversationSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate totals from assistant messages only (they have the metadata)
  const assistantMessages = messages.filter((m) => m.role === "assistant" && m.metadata);
  const totals = assistantMessages.reduce(
    (acc, msg) => {
      if (msg.metadata) {
        acc.promptTokens += msg.metadata.promptTokens || 0;
        acc.completionTokens += msg.metadata.completionTokens || 0;
        acc.totalTokens += msg.metadata.totalTokens || 0;
        acc.totalLatency += msg.metadata.latencyMs || 0;
        acc.messageCount++;
      }
      return acc;
    },
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, totalLatency: 0, messageCount: 0 }
  );

  // Calculate estimated cost
  const totalCost = estimateCost(totals.promptTokens, totals.completionTokens, modelPricing);
  const avgLatency = totals.messageCount > 0 ? Math.round(totals.totalLatency / totals.messageCount) : 0;

  // Don't show if no messages yet
  if (assistantMessages.length === 0) {
    return null;
  }

  // Get short model name for display
  const shortModelName = currentModel.split("/").pop() || currentModel;

  return (
    <div className="border-t border-[var(--divider)] bg-[var(--background)]">
      {/* Toggle Button - Always visible when there are messages */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-[var(--surface)]/50 transition-colors duration-[var(--motion-fast)]"
        aria-expanded={isExpanded}
        aria-controls="conversation-stats-content"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[var(--muted)]">
            <Zap size={14} />
            <span className="text-xs font-medium">
              {totals.totalTokens.toLocaleString()} tokens
            </span>
          </div>
          <span className="text-xs text-[var(--muted)]">•</span>
          <span className="text-xs text-[var(--muted)]">{shortModelName}</span>
        </div>
        <ChevronDown
          size={16}
          className={`text-[var(--muted)] transition-transform duration-[var(--motion-fast)] ${
            isExpanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expandable Content */}
      <div
        id="conversation-stats-content"
        className={`overflow-hidden transition-all duration-[var(--motion-base)] ease-out ${
          isExpanded ? "max-h-[400px]" : "max-h-0"
        }`}
      >
        <div className="px-4 pb-4 space-y-3">
          {/* Model Info Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider flex items-center gap-1.5">
                <Brain size={12} />
                Model
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Model ID" value={currentModel} truncate />
              <DetailRow label="Responses" value={String(totals.messageCount)} />
            </div>
          </div>

          {/* Token Usage Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider flex items-center gap-1.5">
                <Hash size={12} />
                Token Usage
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Prompt Tokens" value={totals.promptTokens.toLocaleString()} />
              <DetailRow label="Completion Tokens" value={totals.completionTokens.toLocaleString()} />
              <DetailRow label="Total Tokens" value={totals.totalTokens.toLocaleString()} highlight />
              {totalCost !== null && (
                <DetailRow label="Est. Cost" value={formatCost(totalCost)} />
              )}
            </div>
          </div>

          {/* Performance Section */}
          <div className="bg-[var(--surface)] rounded-[var(--radius-md)] overflow-hidden">
            <div className="px-3 py-2 border-b border-[var(--divider)]">
              <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wider flex items-center gap-1.5">
                <Activity size={12} />
                Performance
              </p>
            </div>
            <div className="divide-y divide-[var(--divider)]">
              <DetailRow label="Avg Latency" value={`${avgLatency.toLocaleString()}ms`} />
              <DetailRow
                label="Avg Tokens/sec"
                value={
                  avgLatency > 0
                    ? `${Math.round((totals.completionTokens / totals.messageCount) / (avgLatency / 1000))}`
                    : "N/A"
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageMetadataDisplayProps {
  metadata?: MessageMetadata;
  modelPricing?: ChatModel["pricing"];
}

/**
 * Per-Message Metadata Display - Small expandable section per message
 * Shows token count collapsed, full details when expanded
 */
export function MessageMetadataDisplay({ metadata, modelPricing }: MessageMetadataDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!metadata) return null;

  const cost = estimateCost(
    metadata.promptTokens || 0,
    metadata.completionTokens || 0,
    modelPricing
  );

  // Collapsed: just show token count as clickable text
  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="mt-1.5 text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors flex items-center gap-1"
      >
        <Zap size={10} />
        <span>{(metadata.totalTokens || 0).toLocaleString()} tokens</span>
        <span>•</span>
        <span>{metadata.latencyMs?.toLocaleString() || 0}ms</span>
      </button>
    );
  }

  // Expanded: show all details
  return (
    <div className="mt-2 bg-[var(--surface)] rounded-[var(--radius-sm)] overflow-hidden text-[10px]">
      <button
        onClick={() => setIsExpanded(false)}
        className="w-full px-2 py-1.5 flex items-center justify-between text-[var(--muted)] hover:text-[var(--foreground)] transition-colors border-b border-[var(--divider)]"
      >
        <span className="font-medium uppercase tracking-wider">Message Details</span>
        <ChevronDown size={12} className="rotate-180" />
      </button>
      <div className="px-2 py-1.5 space-y-1">
        <MetadataRow label="Model" value={metadata.model?.split("/").pop() || "Unknown"} />
        <MetadataRow label="Prompt" value={`${(metadata.promptTokens || 0).toLocaleString()} tokens`} />
        <MetadataRow label="Completion" value={`${(metadata.completionTokens || 0).toLocaleString()} tokens`} />
        <MetadataRow label="Total" value={`${(metadata.totalTokens || 0).toLocaleString()} tokens`} />
        <MetadataRow label="Latency" value={`${(metadata.latencyMs || 0).toLocaleString()}ms`} />
        <MetadataRow label="Finish" value={metadata.finishReason || "unknown"} />
        {cost !== null && <MetadataRow label="Cost" value={formatCost(cost)} />}
      </div>
    </div>
  );
}

// Helper component for detail rows in conversation summary
function DetailRow({
  label,
  value,
  highlight,
  truncate,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2 min-h-[36px]">
      <span className="text-xs text-[var(--muted)]">{label}</span>
      <span
        className={`text-xs ${highlight ? "font-semibold text-[var(--foreground)]" : "font-medium"} ${
          truncate ? "max-w-[180px] truncate" : ""
        }`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}

// Helper component for per-message metadata rows
function MetadataRow({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span
        className={`font-medium ${truncate ? "max-w-[120px] truncate" : ""}`}
        title={truncate ? value : undefined}
      >
        {value}
      </span>
    </div>
  );
}
