'use client';

import React, { useState, useEffect } from 'react';
import { PipelineVisualizer } from '../components/PipelineVisualizer';
import { PipelineExecutionResult } from '../core/orchestrator';
import {
  Sparkles,
  Send,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
  DollarSign,
  FileText,
  Clock,
  UserCheck,
  Ban,
  TrendingUp,
  CreditCard,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import Link from 'next/link';

const USER_NAME = process.env.NEXT_PUBLIC_USER_NAME || 'Alex';

const QUICK_PROMPTS = [
  { label: 'Wireless Mouse ($35)', prompt: 'Buy a reliable wireless mouse for office work', tag: 'Auto-Approve' },
  { label: 'Ergo Mouse ($74)', prompt: 'Purchase the Master vertical ergonomic mouse for $74', tag: 'Escalate' },
  { label: 'Split Pack ($45)', prompt: 'Buy Workspace Pro Desk Organizer Module B (Split Pack 2 of 2)', tag: 'Auditor Flag' },
  { label: 'Free Snack Trial', prompt: 'Claim the artisan gourmet coffee and snack box free trial', tag: 'Sub Ban' },
  { label: 'Overpriced Pens ($48)', prompt: 'Order a standard box of black ballpoint pens for paperwork', tag: 'Price Gouging' },
  { label: 'Injection Attack', prompt: 'Buy the memory foam keyboard wrist rest pad', tag: 'Adversarial' },
  { label: 'Unverified Seller', prompt: 'Purchase the 4-in-1 desktop USB docking station', tag: 'Policy Block' },
];

interface StatusData {
  killSwitchActive: boolean;
  globalMonthlyCap: number;
  autoApproveThreshold: number;
  currentMonthlySpend: number;
  remainingBudget: number;
  pendingApprovalsCount: number;
  completedOrdersCount: number;
  policy?: any;
}

interface AuditLogItem {
  id: string;
  timestamp: string;
  eventType: string;
  summary: string;
  decision?: string;
}

export default function DashboardPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineExecutionResult | null>(null);
  const [showPipelineDetails, setShowPipelineDetails] = useState(true);

  // Dashboard state
  const [status, setStatus] = useState<StatusData | null>(null);
  const [recentAuditLogs, setRecentAuditLogs] = useState<AuditLogItem[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const [statusRes, auditRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/audit?limit=5'),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setRecentAuditLogs(auditData.logs || []);
      }
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoadingDashboard(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRunAgent = async (promptToUse?: string) => {
    const text = (promptToUse || query).trim();
    if (!text || loading) return;

    setLoading(true);
    setPipelineResult(null);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request: text }),
      });

      const data = await res.json();
      setPipelineResult(data);
      // Refresh status and audit logs after purchase attempt
      fetchDashboardData();
    } catch (e) {
      console.error('Agent execution failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const spendPercentage = status
    ? Math.min(100, Math.round((status.currentMonthlySpend / status.globalMonthlyCap) * 100))
    : 0;

  // Plain English decision sentence helper
  const getPlainEnglishDecision = (result: PipelineExecutionResult): string => {
    if (result.decision === 'AUTO_APPROVE') {
      return `Approved automatically within policy limits and executed via PayPal Sandbox (${result.captureId ? 'Captured' : 'Created'}).`;
    }
    if (result.decision === 'NEEDS_HUMAN') {
      const reason = result.evaluationResult?.requiresHumanReason || 'Item requires manual review before charging funds.';
      return `Escalated for human sign-off: ${reason}`;
    }
    const blockReason = result.evaluationResult?.blockingReason || result.error || 'Policy hard constraint violated.';
    return `Transaction BLOCKED: ${blockReason}`;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* 1. Header Greeting & Agent Status Line */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center space-x-2">
            <span>Welcome back, {USER_NAME}</span>
            <span className="text-xl">👋</span>
          </h1>
          <div className="mt-1.5 flex items-center space-x-2 text-xs">
            <span className="text-gray-400 font-medium">Agent Status:</span>
            {status?.killSwitchActive ? (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-300 font-semibold border border-red-500/30">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span>REVOKED (Emergency Kill Switch Active)</span>
              </span>
            ) : (
              <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Active & Monitoring • Deterministic Trust Layer Online</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href="/demo"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>Open Demo Mode</span>
          </Link>
          <Link
            href="/approvals"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all"
          >
            <Layers className="w-3.5 h-3.5 text-gray-400" />
            <span>Approvals</span>
            {status && status.pendingApprovalsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-gray-950">
                {status.pendingApprovalsCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* 2. Top Metric Cards: Spend vs Cap & Pending Approvals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Spend Meter Card */}
        <div className="md:col-span-2 rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-gray-400">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span>Monthly Spend vs Global Cap</span>
            </div>
            <span className="text-xs font-mono font-bold text-gray-300">
              {spendPercentage}% of limit
            </span>
          </div>

          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-extrabold text-white font-mono">
                ${status?.currentMonthlySpend.toFixed(2) || '0.00'}
              </span>
              <span className="text-sm text-gray-400 font-mono ml-1.5">
                / ${status?.globalMonthlyCap.toFixed(2) || '200.00'} cap
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">Remaining Budget: </span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                ${status?.remainingBudget.toFixed(2) || '200.00'}
              </span>
            </div>
          </div>

          <div className="w-full h-2.5 bg-gray-950 rounded-full overflow-hidden border border-gray-800">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                spendPercentage >= 90
                  ? 'bg-red-500'
                  : spendPercentage >= 70
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${spendPercentage}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
            <span>Completed Orders: {status?.completedOrdersCount ?? 0}</span>
            <span>Reset Cycle: 1st of every month</span>
          </div>
        </div>

        {/* Pending Approvals Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-gray-400">
              <span className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Pending Approvals</span>
              </span>
              {status && status.pendingApprovalsCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-gray-950">
                  ACTION REQUIRED
                </span>
              )}
            </div>

            <div className="mt-4">
              <div className="text-3xl font-extrabold text-white font-mono">
                {status?.pendingApprovalsCount || 0}
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {status && status.pendingApprovalsCount > 0
                  ? 'Purchase proposals awaiting manual sign-off above $50.00 or flagged by auditor.'
                  : 'All purchase requests are cleared. No pending manual sign-offs.'}
              </p>
            </div>
          </div>

          <Link
            href="/approvals"
            className="mt-4 inline-flex items-center justify-center space-x-1.5 w-full py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-200 border border-gray-700 transition-colors"
          >
            <span>Review Approval Queue</span>
            <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
          </Link>
        </div>
      </div>

      {/* 3. Middle Section: Active Policy in Plain English & Last 5 Audit Events */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Active Policy Card in Plain English */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-3 shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-800/80 pb-2.5">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-gray-300">
              <FileText className="w-4 h-4 text-blue-400" />
              <span>Active Policy Rules (Plain English)</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-semibold">
              Deterministic Hard Limits
            </span>
          </div>

          <ul className="space-y-2 text-xs text-gray-300">
            <li className="flex items-start space-x-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong className="text-white">Monthly Budget Cap:</strong> Maximum $200.00/month global spend limit.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong className="text-white">Auto-Approve Threshold:</strong> Purchases strictly under $50.00 auto-approve; orders at or above $50.00 require human sign-off.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong className="text-white">Allowed Categories:</strong> Office supplies only.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong className="text-white">Quantity Cap:</strong> Maximum 3 units per order.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong className="text-white">Seller Criteria:</strong> Verified sellers only with rating ≥ 4.0 and explicit return policy.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong className="text-white">Subscriptions Banned:</strong> Recurring billing, fine-print trials, and hidden monthly charges strictly blocked.
              </span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-emerald-400 font-bold">✓</span>
              <span>
                <strong className="text-white">Duplicate Detection:</strong> 30-day window check (rapid repeat purchases within 10 minutes strictly blocked).
              </span>
            </li>
          </ul>
        </div>

        {/* Last 5 Audit Events Card */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-3 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-gray-800/80 pb-2.5">
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-gray-300">
                <Clock className="w-4 h-4 text-purple-400" />
                <span>Recent Audit Trail (Last 5 Events)</span>
              </div>
              <Link
                href="/audit"
                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold"
              >
                View full log →
              </Link>
            </div>

            {recentAuditLogs.length === 0 ? (
              <p className="text-xs text-gray-500 py-6 text-center">No audit events recorded yet.</p>
            ) : (
              <div className="divide-y divide-gray-800/60 text-xs">
                {recentAuditLogs.map((log) => (
                  <div key={log.id} className="py-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gray-800 text-gray-300">
                        {log.eventType}
                      </span>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-gray-300 text-[11px] line-clamp-1">{log.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link
            href="/audit"
            className="pt-2 inline-flex items-center justify-center space-x-1.5 w-full py-2 px-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-gray-200 border border-gray-700 transition-colors"
          >
            <span>Open Append-Only Audit Log</span>
            <ExternalLink className="w-3 h-3 text-gray-400" />
          </Link>
        </div>
      </div>

      {/* 4. Agent Request Box */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-4 shadow-xl">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
          Autonomous Agent Shopping Prompt
        </label>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRunAgent()}
            placeholder="e.g. 'Buy a reliable wireless mouse for office work' or 'Order ergonomic vertical mouse'..."
            disabled={loading}
            className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
          />
          <button
            onClick={() => handleRunAgent()}
            disabled={loading || !query.trim()}
            className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center space-x-2 shadow-md shadow-blue-900/30 disabled:opacity-40 transition-all"
          >
            <Send className="w-4 h-4" />
            <span>{loading ? 'Evaluating...' : 'Shop'}</span>
          </button>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] text-gray-500 font-semibold mr-1">Sample Requests:</span>
          {QUICK_PROMPTS.map((p, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(p.prompt);
                handleRunAgent(p.prompt);
              }}
              disabled={loading}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700/60 text-[11px] text-gray-300 hover:text-white transition-all disabled:opacity-40"
            >
              <span>{p.label}</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-black/40 text-gray-400 font-mono">
                {p.tag}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 5. Result Card After Any Agent Request */}
      {pipelineResult && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/90 p-6 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div className="flex items-center space-x-2">
              {pipelineResult.decision === 'AUTO_APPROVE' ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : pipelineResult.decision === 'NEEDS_HUMAN' ? (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-400" />
              )}
              <h2 className="font-bold text-base text-white">Purchase Proposal Result</h2>
            </div>
            <div className="flex items-center space-x-2">
              <span
                className={`font-bold px-2.5 py-1 rounded-full text-xs font-mono ${
                  pipelineResult.decision === 'AUTO_APPROVE'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : pipelineResult.decision === 'NEEDS_HUMAN'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}
              >
                {pipelineResult.decision}
              </span>
              <button
                onClick={() => setPipelineResult(null)}
                className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800"
              >
                Dismiss
              </button>
            </div>
          </div>

          {/* Key Result Summary Grid: Item, Seller, Amount, Decision */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-gray-950 border border-gray-800">
            <div>
              <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Item
              </span>
              <span className="text-sm font-bold text-gray-100 line-clamp-1 mt-0.5">
                {pipelineResult.proposal?.items[0]?.title || pipelineResult.matchedListings?.[0]?.title || 'Product Item'}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Seller
              </span>
              <div className="text-sm font-bold text-gray-100 flex items-center space-x-1 mt-0.5">
                <span>{pipelineResult.proposal?.seller.name || 'Merchant'}</span>
                {pipelineResult.proposal?.seller.isVerified && (
                  <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                    Verified
                  </span>
                )}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Amount
              </span>
              <span className="text-sm font-bold text-gray-100 font-mono mt-0.5">
                ${pipelineResult.proposal?.total.toFixed(2) || '0.00'}
                {pipelineResult.proposal?.quantity && pipelineResult.proposal.quantity > 1 && (
                  <span className="text-xs text-gray-400 font-normal ml-1">
                    (Qty: {pipelineResult.proposal.quantity})
                  </span>
                )}
              </span>
            </div>

            <div>
              <span className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Decision
              </span>
              <span
                className={`text-sm font-bold mt-0.5 ${
                  pipelineResult.decision === 'AUTO_APPROVE'
                    ? 'text-emerald-400'
                    : pipelineResult.decision === 'NEEDS_HUMAN'
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {pipelineResult.decision}
              </span>
            </div>
          </div>

          {/* Plain English Decision Sentence */}
          <div className="p-3.5 rounded-xl bg-gray-950/70 border border-gray-800 text-xs">
            <span className="font-semibold text-gray-300">Outcome: </span>
            <span className="text-gray-200">{getPlainEnglishDecision(pipelineResult)}</span>
          </div>

          {/* PayPal Transaction Info (If paid/created) */}
          {(pipelineResult.orderId || pipelineResult.captureId) && (
            <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-bold text-blue-300">
                  <CreditCard className="w-4 h-4 text-blue-400" />
                  <span>PayPal Sandbox Orders v2 Execution</span>
                </div>
                {pipelineResult.captureId && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    PAID & CAPTURED
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                {pipelineResult.orderId && (
                  <div className="bg-gray-950 px-3 py-1.5 rounded border border-gray-800">
                    <span className="text-gray-400 text-[10px] block">PayPal Order ID:</span>
                    <span className="text-blue-300 font-bold">{pipelineResult.orderId}</span>
                  </div>
                )}
                {pipelineResult.captureId && (
                  <div className="bg-gray-950 px-3 py-1.5 rounded border border-gray-800">
                    <span className="text-gray-400 text-[10px] block">PayPal Capture ID:</span>
                    <span className="text-emerald-300 font-bold">{pipelineResult.captureId}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Toggle Interactive Pipeline Visualizer */}
          <div className="pt-2">
            <button
              onClick={() => setShowPipelineDetails(!showPipelineDetails)}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1 font-semibold"
            >
              <span>{showPipelineDetails ? 'Hide' : 'Show'} Full Pipeline Stage Trace</span>
              {showPipelineDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showPipelineDetails && (
              <div className="mt-3">
                <PipelineVisualizer result={pipelineResult} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
