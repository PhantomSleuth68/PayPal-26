'use client';

import React, { useEffect, useState } from 'react';
import { ApprovalRecord } from '../../core/db';
import {
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  ShoppingBag,
  CreditCard,
  RefreshCw,
} from 'lucide-react';

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'RESOLVED'>('PENDING');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/approvals');
      if (res.ok) {
        const data = await res.json();
        setApprovals(data.approvals || []);
      }
    } catch (e) {
      console.error('Failed to fetch approvals:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleAction = async (approvalId: string, action: 'APPROVE' | 'REJECT') => {
    setProcessingId(approvalId);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, action }),
      });

      if (res.ok) {
        await fetchApprovals();
      }
    } catch (e) {
      console.error(`Failed to ${action} approval:`, e);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingList = approvals.filter((a) => a.status === 'PENDING');
  const resolvedList = approvals.filter((a) => a.status !== 'PENDING');
  const displayList = activeTab === 'PENDING' ? pendingList : resolvedList;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Human Approval Queue</h1>
          <p className="text-xs text-gray-400 mt-1">
            Review purchases escalated by policy rules or the independent auditor. One-tap approval authorizes payment in PayPal Sandbox.
          </p>
        </div>

        {/* Tab Controls & Refresh */}
        <div className="flex items-center space-x-2">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-1 flex items-center space-x-1 text-xs">
            <button
              onClick={() => setActiveTab('PENDING')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors flex items-center space-x-1.5 ${
                activeTab === 'PENDING'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <span>Pending Review</span>
              {pendingList.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white text-blue-900 font-bold">
                  {pendingList.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('RESOLVED')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                activeTab === 'RESOLVED'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Resolved History ({resolvedList.length})
            </button>
          </div>
          <button
            onClick={fetchApprovals}
            className="p-2 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Approvals List */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 text-xs font-mono">
          Loading approval requests...
        </div>
      ) : displayList.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 p-12 text-center text-gray-500 bg-gray-900/30">
          <ShoppingBag className="w-10 h-10 mx-auto text-gray-600 mb-2" />
          <p className="text-sm font-semibold text-gray-400">
            {activeTab === 'PENDING' ? 'No pending approvals.' : 'No resolved approvals yet.'}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {activeTab === 'PENDING'
              ? 'When an order exceeds the $50 threshold or is flagged by the auditor, it will appear here.'
              : 'Approved and rejected transactions will be archived here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayList.map((appr) => {
            const isProcessing = processingId === appr.id;
            const item = appr.proposal.items[0];

            return (
              <div
                key={appr.id}
                className="rounded-2xl border border-gray-800 bg-gray-900/70 p-5 space-y-4 hover:border-gray-700 transition-all shadow-lg"
              >
                {/* Item & Price Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700">
                        {appr.proposal.category}
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {new Date(appr.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-white mt-1.5">{item?.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Seller: <span className="font-semibold text-gray-200">{appr.proposal.seller.name}</span> • Rating: {appr.proposal.seller.rating} ★ • {appr.proposal.seller.isVerified ? 'Verified' : 'Unverified'}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-extrabold text-white font-mono">
                      ${appr.proposal.total.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      Qty: {appr.proposal.quantity} × ${appr.proposal.unitPrice.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* AI-Written Executive Summary */}
                <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-900/50 text-xs text-blue-200 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold text-blue-300">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>AI Decision Brief:</span>
                  </div>
                  <p className="leading-relaxed opacity-95">{appr.summary}</p>
                </div>

                {/* Escalation Triggers Trace */}
                {appr.evaluationResult.requiresHumanReason && (
                  <div className="text-xs text-amber-300 bg-amber-950/20 border border-amber-800/40 p-2.5 rounded-lg flex items-start space-x-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Escalation Trigger: </span>
                      <span>{appr.evaluationResult.requiresHumanReason}</span>
                    </div>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="pt-2 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-[11px] font-mono text-gray-500">
                    ID: {appr.id} {appr.paypalOrderId && `• PayPal Order: ${appr.paypalOrderId}`}
                  </div>

                  {appr.status === 'PENDING' ? (
                    <div className="flex items-center space-x-2 w-full sm:w-auto">
                      <button
                        onClick={() => handleAction(appr.id, 'REJECT')}
                        disabled={isProcessing}
                        className="flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold bg-gray-800 hover:bg-gray-700 text-red-400 hover:text-red-300 border border-gray-700 transition-all disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleAction(appr.id, 'APPROVE')}
                        disabled={isProcessing}
                        className="flex-1 sm:flex-initial px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 flex items-center justify-center space-x-1.5 transition-all disabled:opacity-50"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{isProcessing ? 'Processing PayPal...' : 'Approve & Pay via PayPal Sandbox'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          appr.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-300 border border-red-500/30'
                        }`}
                      >
                        {appr.status}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
