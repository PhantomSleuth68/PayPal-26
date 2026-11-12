'use client';

import React, { useState } from 'react';
import {
  PipelineStageResult,
  PipelineExecutionResult,
} from '../core/orchestrator';
import {
  Search,
  Bot,
  ShieldCheck,
  ShieldAlert,
  Scale,
  Cpu,
  CreditCard,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ExternalLink,
} from 'lucide-react';

interface Props {
  result: PipelineExecutionResult | null;
  isRunning?: boolean;
}

export function PipelineVisualizer({ result, isRunning }: Props) {
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  if (!result && !isRunning) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-12 text-center text-gray-500 bg-gray-900/30">
        <Bot className="w-12 h-12 mx-auto text-gray-600 mb-3" />
        <p className="text-sm font-medium">Ready for shopping requests.</p>
        <p className="text-xs text-gray-600 mt-1">
          Type an instruction above or click a demo scenario to see the autonomous agent pipeline execute with deterministic guardrails.
        </p>
      </div>
    );
  }

  const stages = result?.stages || [];

  const getStageIcon = (stageName: string) => {
    switch (stageName) {
      case 'search':
        return <Search className="w-4 h-4" />;
      case 'shopper':
        return <Bot className="w-4 h-4" />;
      case 'injection_check':
        return <ShieldCheck className="w-4 h-4" />;
      case 'auditor':
        return <Scale className="w-4 h-4" />;
      case 'policy_engine':
        return <Cpu className="w-4 h-4" />;
      case 'execution':
        return <CreditCard className="w-4 h-4" />;
      default:
        return <Bot className="w-4 h-4" />;
    }
  };

  const getStatusBadge = (status: PipelineStageResult['status']) => {
    switch (status) {
      case 'passed':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            <span>Passed</span>
          </span>
        );
      case 'escalated':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertCircle className="w-3 h-3" />
            <span>Needs Human</span>
          </span>
        );
      case 'blocked':
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-500/10 text-red-400 border border-red-500/20">
            <XCircle className="w-3 h-3" />
            <span>Blocked</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-700 text-gray-300">
            <Clock className="w-3 h-3 animate-spin" />
            <span>Running</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Overall Verdict Banner */}
      {result && (
        <div
          className={`p-4 rounded-xl border flex items-start justify-between ${
            result.decision === 'AUTO_APPROVE'
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              : result.decision === 'NEEDS_HUMAN'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                : 'bg-red-950/40 border-red-500/40 text-red-200'
          }`}
        >
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/30">
                Final Engine Decision
              </span>
              <span className="font-extrabold text-base">
                {result.decision === 'AUTO_APPROVE'
                  ? 'AUTO_APPROVE (Executed via PayPal Sandbox)'
                  : result.decision === 'NEEDS_HUMAN'
                    ? 'NEEDS_HUMAN (Escalated to Approval Queue)'
                    : 'BLOCK (Hard Policy Rejection)'}
              </span>
            </div>
            <p className="text-xs mt-1.5 opacity-90">
              {result.evaluationResult?.summary || result.error || 'Pipeline execution completed.'}
            </p>
            {result.orderId && (
              <div className="mt-2 text-xs font-mono text-gray-300 flex items-center space-x-2">
                <span>PayPal Sandbox Order:</span>
                <span className="font-bold text-white bg-black/40 px-2 py-0.5 rounded">{result.orderId}</span>
                {result.captureId && (
                  <>
                    <span>• Capture ID:</span>
                    <span className="font-bold text-emerald-400 bg-black/40 px-2 py-0.5 rounded">{result.captureId}</span>
                  </>
                )}
                {result.approvalUrl && !result.captureId && (
                  <a
                    href={result.approvalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 text-blue-400 hover:text-blue-300 underline ml-2"
                  >
                    <span>Authorize in PayPal Sandbox</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Red Alert Banner if Injection Detected */}
      {result?.injectionResult?.injectionDetected && (
        <div className="bg-red-950/90 border-2 border-red-500 rounded-xl p-4 text-red-100 flex items-start space-x-3 shadow-lg shadow-red-950/50">
          <ShieldAlert className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <h4 className="font-bold text-sm text-red-200">
              ADVERSARIAL INJECTION SHIELD TRIGGERED - TRANSACTION HALTED
            </h4>
            <p className="text-xs text-red-300 mt-1">
              Malicious instruction-like syntax was detected in the candidate merchant listing. The engine strictly blocked this proposal, flagged the seller, and recorded the incident in the audit log.
            </p>
            <div className="mt-2 bg-black/50 p-2.5 rounded-lg border border-red-800/80 text-[11px] font-mono text-red-300 space-y-1">
              <span className="font-bold text-red-400">Captured Attack Signatures:</span>
              {result.injectionResult.evidence.map((ev, i) => (
                <div key={i} className="pl-2 border-l border-red-500">
                  {ev}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Stage Cards */}
      <div className="space-y-2.5">
        {stages.map((stage, idx) => {
          const isExpanded = expandedStage === stage.stage;
          return (
            <div
              key={stage.stage}
              className="rounded-xl border border-gray-800 bg-gray-900/60 overflow-hidden transition-all hover:border-gray-700"
            >
              <div
                onClick={() => setExpandedStage(isExpanded ? null : stage.stage)}
                className="p-3.5 flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center text-gray-300">
                    {getStageIcon(stage.stage)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-mono text-gray-500">Stage {idx + 1}</span>
                      <h4 className="text-xs font-bold text-gray-200">{stage.name}</h4>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{stage.summary}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {stage.durationMs !== undefined && (
                    <span className="text-[11px] font-mono text-gray-500">{stage.durationMs}ms</span>
                  )}
                  {getStatusBadge(stage.status)}
                  <button className="text-gray-400 hover:text-gray-200">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Expandable Details Drawer */}
              {isExpanded && (
                <div className="p-3.5 border-t border-gray-800 bg-black/40 text-xs text-gray-300 space-y-2">
                  <div className="font-semibold text-gray-400">Diagnostic Details & Traces:</div>
                  <pre className="p-3 rounded-lg bg-gray-950 border border-gray-800/80 text-[11px] font-mono overflow-x-auto text-gray-300">
                    {JSON.stringify(stage.details || { summary: stage.summary }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
