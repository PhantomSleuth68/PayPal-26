'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Shield, ShieldAlert, AlertTriangle, CheckCircle, RefreshCw, ShoppingCart } from 'lucide-react';

interface StatusData {
  killSwitchActive: boolean;
  globalMonthlyCap: number;
  autoApproveThreshold: number;
  currentMonthlySpend: number;
  remainingBudget: number;
  pendingApprovalsCount: number;
  completedOrdersCount: number;
}

export function Header() {
  const pathname = usePathname();
  const [status, setStatus] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (e) {
      console.error('Failed to load status:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, []);

  const toggleKillSwitch = async () => {
    if (!status) return;
    const nextState = !status.killSwitchActive;
    const confirmMsg = nextState
      ? 'REVOKE AGENT: Are you sure you want to trigger the EMERGENCY KILL SWITCH? All future purchasing actions will be immediately blocked.'
      : 'Disengage emergency kill switch and restore normal shopping permissions?';

    if (!window.confirm(confirmMsg)) return;

    try {
      setToggling(true);
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: nextState,
          reason: nextState ? 'Operator manual revocation from UI header' : 'Operator reset',
        }),
      });
      if (res.ok) {
        await fetchStatus();
      }
    } catch (e) {
      console.error('Failed to toggle kill switch:', e);
    } finally {
      setToggling(false);
    }
  };

  const spendPercentage = status
    ? Math.min(100, Math.round((status.currentMonthlySpend / status.globalMonthlyCap) * 100))
    : 0;

  return (
    <header className="sticky top-0 z-50 bg-gray-950/90 backdrop-blur-md border-b border-gray-800 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:bg-blue-600/30 transition-all">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-extrabold tracking-tight text-lg text-white">WARDEN</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    PAYPAL SANDBOX
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">Autonomous Shopper • Deterministic Trust Layer</p>
              </div>
            </Link>

            {/* Nav Links */}
            <nav className="hidden md:flex items-center space-x-1 pl-6">
              <Link
                href="/"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  pathname === '/'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/demo"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  pathname === '/demo'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                }`}
              >
                Demo mode
              </Link>
              <Link
                href="/approvals"
                className={`relative px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  pathname === '/approvals'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                }`}
              >
                Approvals
                {status && status.pendingApprovalsCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-gray-950">
                    {status.pendingApprovalsCount}
                  </span>
                )}
              </Link>
              <Link
                href="/audit"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  pathname === '/audit'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
                }`}
              >
                Audit Log
              </Link>
            </nav>
          </div>

          {/* Right Section: Spend Meter & Kill Switch */}
          <div className="flex items-center space-x-4">
            {/* Spend vs Cap Meter */}
            <div className="hidden sm:flex flex-col items-end">
              <div className="flex items-center space-x-2 text-xs">
                <span className="text-gray-400">Monthly Budget:</span>
                <span className="font-bold text-gray-200 font-mono">
                  ${status?.currentMonthlySpend.toFixed(2) || '0.00'} / ${status?.globalMonthlyCap.toFixed(2) || '200.00'}
                </span>
                <span className="text-[11px] text-gray-400">({spendPercentage}%)</span>
              </div>
              <div className="w-36 h-2 bg-gray-800 rounded-full mt-1 overflow-hidden border border-gray-700/60">
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
            </div>

            {/* Kill Switch Revoke Button */}
            <button
              onClick={toggleKillSwitch}
              disabled={toggling}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                status?.killSwitchActive
                  ? 'bg-red-600 text-white hover:bg-red-700 ring-2 ring-red-500 animate-pulse'
                  : 'bg-red-950/60 hover:bg-red-900/80 text-red-400 hover:text-red-200 border border-red-800/80'
              }`}
              title={
                status?.killSwitchActive
                  ? 'Click to restore agent operations'
                  : 'Immediately revoke agent purchasing permissions'
              }
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{status?.killSwitchActive ? 'AGENT REVOKED (LOCKED)' : 'Revoke Agent'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Kill Switch Active Warning Banner */}
      {status?.killSwitchActive && (
        <div className="bg-red-950 border-b border-red-800/80 px-4 py-2 text-center text-xs font-semibold text-red-200 flex items-center justify-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 animate-bounce" />
          <span>
            EMERGENCY KILL SWITCH ACTIVE: Agent permissions are revoked. All purchases will be strictly blocked in deterministic code.
          </span>
          <button
            onClick={toggleKillSwitch}
            className="underline ml-2 text-white hover:text-red-200"
          >
            Disengage
          </button>
        </div>
      )}
    </header>
  );
}

