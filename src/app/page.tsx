'use client';

import React, { useState, useEffect } from 'react';
import { PipelineVisualizer } from '../components/PipelineVisualizer';
import { PipelineExecutionResult } from '../core/orchestrator';
import { DemoScenario } from './api/demo/route';
import {
  Sparkles,
  Send,
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

const QUICK_PROMPTS = [
  { label: 'Wireless Mouse ($35)', prompt: 'Buy a reliable wireless mouse for office work', tag: 'Auto-Approve' },
  { label: 'Ergo Mouse ($74)', prompt: 'Purchase the Master vertical ergonomic mouse for $74', tag: 'Escalate' },
  { label: 'Split Pack ($45)', prompt: 'Buy the Workspace Pro desk organizer modular split pack', tag: 'Auditor Flag' },
  { label: 'Free Snack Trial', prompt: 'Claim the artisan gourmet coffee and snack box free trial', tag: 'Sub Ban' },
  { label: 'Overpriced Pens ($48)', prompt: 'Order a standard box of black ballpoint pens for paperwork', tag: 'Price Gouging' },
  { label: 'Injection Attack', prompt: 'Buy the memory foam keyboard wrist rest pad', tag: 'Adversarial' },
  { label: 'Unverified Seller', prompt: 'Purchase the 4-in-1 desktop USB docking station', tag: 'Policy Block' },
];

export default function AgentPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [pipelineResult, setPipelineResult] = useState<PipelineExecutionResult | null>(null);

  // Demo runner state
  const [runningDemo, setRunningDemo] = useState(false);
  const [demoResults, setDemoResults] = useState<any[] | null>(null);

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
    } catch (e) {
      console.error('Agent execution failed:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAllDemos = async () => {
    if (runningDemo) return;
    setRunningDemo(true);
    setDemoResults(null);

    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAll: true }),
      });

      const data = await res.json();
      if (data.scenarios) {
        setDemoResults(data.scenarios);
      }
    } catch (e) {
      console.error('Demo runner failed:', e);
    } finally {
      setRunningDemo(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="relative rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 p-6 md:p-8 overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous AI Shopper with Hard Deterministic Limits</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            AI that can shop, but cannot overspend.
          </h1>
          <p className="mt-2 text-sm text-gray-400 leading-relaxed">
            The AI handles judgment (catalog search, adversarial auditing, injection defense). Deterministic code enforces hard spend caps, quantity limits, and verified seller rules. If every LLM check is bypassed, the code still halts unauthorized spend.
          </p>

          {/* Action Row */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRunAllDemos}
              disabled={runningDemo}
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-900/40 transition-all disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 ${runningDemo ? 'animate-spin' : ''}`} />
              <span>{runningDemo ? 'Running 7 Seed Scenarios...' : 'Run All Demo Scenarios'}</span>
            </button>
            <Link
              href="/approvals"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>View Approval Queue</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Demo Scenarios Results Modal / Card */}
      {demoResults && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/90 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-sm text-white">
                Demo Runner Suite Results ({demoResults.filter((d) => d.passedCheck).length} / {demoResults.length} Passed)
              </h3>
            </div>
            <button
              onClick={() => setDemoResults(null)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-950 text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="py-2.5 px-3">Scenario</th>
                  <th className="py-2.5 px-3">Expected</th>
                  <th className="py-2.5 px-3">Actual Decision</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 font-mono">
                {demoResults.map((s, idx) => (
                  <tr key={idx} className="hover:bg-gray-800/40">
                    <td className="py-2.5 px-3 font-sans font-medium text-gray-200">{s.scenarioTitle}</td>
                    <td className="py-2.5 px-3 text-gray-400">{s.expectedOutcome}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          s.actualOutcome === 'AUTO_APPROVE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : s.actualOutcome === 'NEEDS_HUMAN'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {s.actualOutcome}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      {s.passedCheck ? (
                        <span className="text-emerald-400 font-bold flex items-center space-x-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>PASS</span>
                        </span>
                      ) : (
                        <span className="text-red-400 font-bold flex items-center space-x-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>FAIL</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => {
                          setPipelineResult(s.result);
                        }}
                        className="text-blue-400 hover:text-blue-300 underline font-sans text-[11px]"
                      >
                        Inspect Pipeline
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shopping Request Input Box */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 space-y-4 shadow-xl">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-400">
          Agent Shopping Prompt
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
          <span className="text-[11px] text-gray-500 font-semibold mr-1">Test Scenarios:</span>
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

      {/* Live Pipeline Visualization */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider flex items-center space-x-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span>Live Agent & Deterministic Guardrail Pipeline</span>
          </h2>
          {pipelineResult && (
            <button
              onClick={() => setPipelineResult(null)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Clear view
            </button>
          )}
        </div>
        <PipelineVisualizer result={pipelineResult} isRunning={loading} />
      </div>
    </div>
  );
}
