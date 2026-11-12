'use client';

import React, { useEffect, useState } from 'react';
import { AuditLogEntry, AuditEventType } from '../../core/types';
import {
  ListFilter,
  Search,
  Bot,
  ShieldCheck,
  ShieldAlert,
  Scale,
  Cpu,
  CreditCard,
  UserCheck,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
} from 'lucide-react';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/audit?limit=200');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getEventBadge = (type: AuditEventType) => {
    switch (type) {
      case 'SEARCH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">SEARCH</span>;
      case 'PROPOSAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">PROPOSAL</span>;
      case 'INJECTION_CHECK':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">INJECTION_CHECK</span>;
      case 'AUDITOR_VERDICT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">AUDITOR</span>;
      case 'POLICY_EVALUATION':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">POLICY_ENGINE</span>;
      case 'PAYPAL_ORDER_CREATED':
      case 'PAYPAL_ORDER_CAPTURED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PAYPAL_SANDBOX</span>;
      case 'KILL_SWITCH_TOGGLED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600/30 text-red-300 border border-red-500 animate-pulse">KILL_SWITCH</span>;
      case 'HUMAN_APPROVAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">HUMAN_APPROVE</span>;
      case 'APPROVAL_REJECTED':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">REJECTED</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-800 text-gray-300">{type}</span>;
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (filterType !== 'ALL' && log.eventType !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const searchable = `${log.summary} ${log.eventType} ${JSON.stringify(log.details || '')}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Immutable Audit Log</h1>
          <p className="text-xs text-gray-400 mt-1">
            Append-only record of all shopper proposals, injection scans, auditor reviews, policy traces, and PayPal transactions.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-800 text-xs font-semibold text-gray-300 hover:text-white flex items-center space-x-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-gray-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search audit trail by keyword, ID, or trace..."
            className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="ALL">All Events ({logs.length})</option>
            <option value="SEARCH">Catalog Search</option>
            <option value="PROPOSAL">Shopper Proposals</option>
            <option value="INJECTION_CHECK">Injection Shield</option>
            <option value="AUDITOR_VERDICT">Auditor Verdicts</option>
            <option value="POLICY_EVALUATION">Policy Engine</option>
            <option value="PAYPAL_ORDER_CREATED">PayPal Orders</option>
            <option value="PAYPAL_ORDER_CAPTURED">PayPal Captures</option>
            <option value="HUMAN_APPROVAL">Human Actions</option>
            <option value="KILL_SWITCH_TOGGLED">Kill Switch</option>
          </select>
        </div>
      </div>

      {/* Timeline List */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 text-xs font-mono">
          Loading audit entries...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center text-gray-500 bg-gray-900/30">
          <Clock className="w-10 h-10 mx-auto text-gray-600 mb-2" />
          <p className="text-sm font-semibold text-gray-400">No matching audit logs found.</p>
        </div>
      ) : (
        <div className="space-y-3 font-sans">
          {filteredLogs.map((entry) => {
            const isExpanded = expandedId === entry.id;

            return (
              <div
                key={entry.id}
                className="rounded-xl border border-gray-800/80 bg-gray-900/50 p-4 space-y-2 hover:border-gray-700 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {getEventBadge(entry.eventType)}
                      <span className="text-[11px] font-mono text-gray-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      {entry.decision && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded font-mono ${
                            entry.decision === 'AUTO_APPROVE'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : entry.decision === 'NEEDS_HUMAN'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {entry.decision}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-200 font-medium leading-relaxed">
                      {entry.summary}
                    </p>
                  </div>

                  {(entry.details || entry.ruleTrace) && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="text-gray-400 hover:text-gray-200 p-1"
                      title="Toggle traces"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* Rule Traces Chip List */}
                {entry.ruleTrace && entry.ruleTrace.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.ruleTrace.map((rule, idx) => (
                      <span
                        key={idx}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                          rule.verdict === 'BLOCK'
                            ? 'bg-red-950/60 text-red-300 border-red-800'
                            : rule.verdict === 'NEEDS_HUMAN'
                              ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                              : 'bg-gray-800/80 text-gray-400 border-gray-700'
                        }`}
                        title={rule.reason}
                      >
                        {rule.name}: {rule.verdict}
                      </span>
                    ))}
                  </div>
                )}

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="pt-2 border-t border-gray-800 space-y-2 text-xs">
                    <pre className="p-3 rounded-lg bg-black/60 border border-gray-800 text-[11px] font-mono text-gray-300 overflow-x-auto">
                      {JSON.stringify(
                        { details: entry.details, ruleTrace: entry.ruleTrace },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
