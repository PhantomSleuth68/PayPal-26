'use client';

import React, { useState } from 'react';
import { PipelineVisualizer } from '../../components/PipelineVisualizer';
import { PipelineExecutionResult } from '../../core/orchestrator';
import { DemoScenario } from '../../core/demo-scenarios';
import {
  Sparkles,
  Play,
  RotateCcw,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
  Info,
} from 'lucide-react';
import Link from 'next/link';

export default function DemoPage() {
  const [runningDemo, setRunningDemo] = useState(false);
  const [demoResults, setDemoResults] = useState<any[] | null>(null);
  const [demoRunId, setDemoRunId] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<PipelineExecutionResult | null>(null);

  const handleRunAllDemos = async () => {
    if (runningDemo) return;
    setRunningDemo(true);
    setDemoResults(null);
    setDemoRunId(null);
    setInspectResult(null);

    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runAll: true }),
      });

      const data = await res.json();
      if (data.scenarios) {
        setDemoResults(data.scenarios);
        setDemoRunId(data.runId || null);
      }
    } catch (e) {
      console.error('Demo runner failed:', e);
    } finally {
      setRunningDemo(false);
    }
  };

  const handleRunSingleScenario = async (scenarioId: string) => {
    if (runningDemo) return;
    setRunningDemo(true);

    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId }),
      });

      const data = await res.json();
      if (data.result) {
        setInspectResult(data.result);
      }
    } catch (e) {
      console.error('Single scenario execution failed:', e);
    } finally {
      setRunningDemo(false);
    }
  };

  const passedCount = demoResults ? demoResults.filter((d) => d.passedCheck).length : 0;
  const totalCount = demoResults ? demoResults.length : 0;

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Demo Header Card */}
      <div className="rounded-2xl bg-gradient-to-b from-gray-900 to-gray-950 border border-gray-800 p-6 md:p-8">
        <div className="max-w-3xl">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Interactive Demo & Judge Evaluation Suite</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Demo Mode: 7 Safety & Overspend Scenarios
          </h1>
          <p className="mt-2 text-sm text-gray-400 leading-relaxed">
            Run the seeded adversarial and edge-case purchase proposals through Warden.
            Each test proves how AI judgment and deterministic policy engine limits collaborate
            to prevent overspend, halt prompt injections, catch split orders, and block fine-print subscriptions.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRunAllDemos}
              disabled={runningDemo}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 transition-all disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${runningDemo ? 'animate-spin' : ''}`} />
              <span>{runningDemo ? 'Executing 7 Scenarios Sequentially (~1s delay)...' : 'Run All Demo Scenarios'}</span>
            </button>
            <Link
              href="/"
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-all"
            >
              <ArrowRight className="w-3.5 h-3.5 rotate-180" />
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Demo Results Table */}
      {demoResults && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/90 p-6 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-800 pb-4">
            <div className="flex items-center space-x-3">
              {passedCount === totalCount ? (
                <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0" />
              )}
              <div>
                <h3 className="font-bold text-base text-white">
                  Demo Suite Result: {passedCount} / {totalCount} Passed
                </h3>
                {demoRunId && (
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    Run ID: {demoRunId} •{' '}
                    <Link
                      href={`/audit?runId=${demoRunId}`}
                      className="text-blue-400 hover:text-blue-300 underline font-sans font-medium"
                    >
                      Filter Audit Log to this run
                    </Link>
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => setDemoResults(null)}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-800"
            >
              Dismiss
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-950 text-gray-400 border-b border-gray-800 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3">Scenario</th>
                  <th className="py-3 px-3">Expected</th>
                  <th className="py-3 px-3">Actual Decision</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Details / PayPal</th>
                  <th className="py-3 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 font-mono">
                {demoResults.map((s, idx) => (
                  <tr key={idx} className="hover:bg-gray-800/40">
                    <td className="py-3 px-3 font-sans font-medium text-gray-200">
                      <div>{s.scenarioTitle}</div>
                      {s.reason && (
                        <div className="text-[11px] text-gray-400 font-sans mt-0.5">{s.reason}</div>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-400">{s.expectedOutcome}</td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          s.actualOutcome === 'AUTO_APPROVE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : s.actualOutcome === 'NEEDS_HUMAN'
                              ? 'bg-amber-500/20 text-amber-300'
                              : s.actualOutcome === 'AI_UNAVAILABLE'
                                ? 'bg-purple-500/20 text-purple-300'
                                : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {s.actualOutcome}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {s.status === 'PASS' ? (
                        <span className="text-emerald-400 font-bold flex items-center space-x-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>PASS</span>
                        </span>
                      ) : s.status === 'ERROR' ? (
                        <span className="text-purple-400 font-bold flex items-center space-x-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>ERROR (AI Unavailable)</span>
                        </span>
                      ) : (
                        <span className="text-red-400 font-bold flex items-center space-x-1">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>FAIL</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-gray-300 font-sans">
                      {s.orderId ? (
                        <div className="space-y-0.5">
                          <div className="text-emerald-400 font-mono text-[10px]">Order: {s.orderId}</div>
                          {s.captureId && (
                            <div className="text-emerald-400 font-mono text-[10px]">Capture: {s.captureId}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500">None (Not captured)</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setInspectResult(s.result)}
                        className="text-blue-400 hover:text-blue-300 underline font-sans text-xs"
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

      {/* Inspected Pipeline Visualizer */}
      {inspectResult && (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-gray-800 pb-2">
            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center space-x-2">
              <Shield className="w-4 h-4 text-blue-400" />
              <span>Inspected Pipeline Trace</span>
            </h2>
            <button
              onClick={() => setInspectResult(null)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Close trace
            </button>
          </div>
          <PipelineVisualizer result={inspectResult} />
        </div>
      )}
    </div>
  );
}
