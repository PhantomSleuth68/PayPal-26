import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import {
  AuditLogEntry,
  Decision,
  Policy,
  PolicyEvaluationResult,
  PurchaseProposal,
  RuleTrace,
  SpendRecord,
} from './types';
import { DEFAULT_POLICY } from './policy-engine';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'warden.db');

// Ensure db directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    initTables(dbInstance);
  }
  return dbInstance;
}

function initTables(db: Database.Database): void {
  // Orders table for PayPal transactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      reference_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USD',
      status TEXT NOT NULL,
      capture_id TEXT,
      proposal_json TEXT,
      idempotency_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Spend history table
  db.exec(`
    CREATE TABLE IF NOT EXISTS spend_history (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      capture_id TEXT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      status TEXT NOT NULL,
      proposal_summary TEXT
    );
  `);

  // Append-only audit log
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      details_json TEXT,
      rule_trace_json TEXT,
      decision TEXT
    );
  `);

  // Human approval requests
  db.exec(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      proposal_json TEXT NOT NULL,
      evaluation_result_json TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      paypal_order_id TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
  `);

  // System & policy state (kill switch, active policy)
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Seed default kill switch state if missing
  const existingKillSwitch = db
    .prepare('SELECT value FROM system_state WHERE key = ?')
    .get('kill_switch_active');

  if (!existingKillSwitch) {
    db.prepare(
      'INSERT INTO system_state (key, value, updated_at) VALUES (?, ?, ?)'
    ).run('kill_switch_active', 'false', new Date().toISOString());
  }
}

// System state helpers
export function isKillSwitchActive(): boolean {
  const db = getDb();
  const row = db.prepare('SELECT value FROM system_state WHERE key = ?').get('kill_switch_active') as
    | { value: string }
    | undefined;
  return row ? row.value === 'true' : false;
}

export function setKillSwitchActive(active: boolean, reason = 'User action'): void {
  const db = getDb();
  const timestamp = new Date().toISOString();
  db.prepare(
    `INSERT INTO system_state (key, value, updated_at) 
     VALUES ('kill_switch_active', ?, ?) 
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(active ? 'true' : 'false', timestamp);

  logAuditEvent({
    id: `audit_ks_${Date.now()}`,
    timestamp,
    eventType: 'KILL_SWITCH_TOGGLED',
    summary: active
      ? `EMERGENCY KILL SWITCH ENGAGED: Agent purchasing revoked. Reason: ${reason}`
      : 'Emergency kill switch disengaged. Normal operations restored.',
    decision: active ? 'BLOCK' : 'AUTO_APPROVE',
  });
}

export function getActivePolicy(): Policy {
  const db = getDb();
  const row = db.prepare('SELECT value FROM system_state WHERE key = ?').get('active_policy') as
    | { value: string }
    | undefined;

  const killSwitch = isKillSwitchActive();
  if (row) {
    try {
      const parsed = JSON.parse(row.value) as Policy;
      return { ...parsed, killSwitchActive: killSwitch };
    } catch {
      // Fallback to default
    }
  }
  return { ...DEFAULT_POLICY, killSwitchActive: killSwitch };
}

// Audit log helpers
export function logAuditEvent(entry: AuditLogEntry): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO audit_log (id, timestamp, event_type, summary, details_json, rule_trace_json, decision)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.timestamp,
    entry.eventType,
    entry.summary,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.ruleTrace ? JSON.stringify(entry.ruleTrace) : null,
    entry.decision || null
  );
}

export function getAuditLogs(limit = 100): AuditLogEntry[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?')
    .all(limit) as Array<{
    id: string;
    timestamp: string;
    event_type: string;
    summary: string;
    details_json: string | null;
    rule_trace_json: string | null;
    decision: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    eventType: r.event_type as AuditLogEntry['eventType'],
    summary: r.summary,
    details: r.details_json ? JSON.parse(r.details_json) : undefined,
    ruleTrace: r.rule_trace_json ? JSON.parse(r.rule_trace_json) : undefined,
    decision: r.decision as Decision | undefined,
  }));
}

// Spend history helpers
export function getSpendHistory(): SpendRecord[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM spend_history ORDER BY timestamp DESC').all() as Array<{
    id: string;
    order_id: string | null;
    capture_id: string | null;
    amount: number;
    category: string;
    timestamp: string;
    status: string;
    proposal_summary: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id || undefined,
    captureId: r.capture_id || undefined,
    amount: r.amount,
    category: r.category,
    timestamp: r.timestamp,
    status: r.status as SpendRecord['status'],
    proposalSummary: r.proposal_summary || undefined,
  }));
}

export function recordSpend(record: SpendRecord): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO spend_history (id, order_id, capture_id, amount, category, timestamp, status, proposal_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.orderId || null,
    record.captureId || null,
    record.amount,
    record.category,
    record.timestamp,
    record.status,
    record.proposalSummary || null
  );
}

// Approval request helpers
export interface ApprovalRecord {
  id: string;
  proposal: PurchaseProposal;
  evaluationResult: PolicyEvaluationResult;
  summary: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  paypalOrderId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export function createApproval(
  proposal: PurchaseProposal,
  evaluationResult: PolicyEvaluationResult,
  summary: string,
  paypalOrderId?: string
): ApprovalRecord {
  const db = getDb();
  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO approvals (id, proposal_json, evaluation_result_json, summary, status, paypal_order_id, created_at)
    VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
  `).run(
    id,
    JSON.stringify(proposal),
    JSON.stringify(evaluationResult),
    summary,
    paypalOrderId || null,
    createdAt
  );

  return {
    id,
    proposal,
    evaluationResult,
    summary,
    status: 'PENDING',
    paypalOrderId,
    createdAt,
  };
}

export function getApprovals(status?: 'PENDING' | 'APPROVED' | 'REJECTED'): ApprovalRecord[] {
  const db = getDb();
  let query = 'SELECT * FROM approvals';
  const params: string[] = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC';

  const rows = db.prepare(query).all(...params) as Array<{
    id: string;
    proposal_json: string;
    evaluation_result_json: string;
    summary: string;
    status: string;
    paypal_order_id: string | null;
    created_at: string;
    resolved_at: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    proposal: JSON.parse(r.proposal_json),
    evaluationResult: JSON.parse(r.evaluation_result_json),
    summary: r.summary,
    status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
    paypalOrderId: r.paypal_order_id || undefined,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at || undefined,
  }));
}

export function updateApprovalStatus(
  id: string,
  status: 'APPROVED' | 'REJECTED',
  captureId?: string
): void {
  const db = getDb();
  const resolvedAt = new Date().toISOString();
  db.prepare(
    'UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?'
  ).run(status, resolvedAt, id);
}

// Order helpers
export function saveOrderRecord(record: {
  orderId: string;
  referenceId: string;
  amount: number;
  currency: string;
  status: string;
  captureId?: string;
  proposal?: PurchaseProposal;
  idempotencyKey?: string;
}): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO orders (order_id, reference_id, amount, currency, status, capture_id, proposal_json, idempotency_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_id) DO UPDATE SET
      status = excluded.status,
      capture_id = COALESCE(excluded.capture_id, orders.capture_id),
      updated_at = excluded.updated_at
  `).run(
    record.orderId,
    record.referenceId,
    record.amount,
    record.currency,
    record.status,
    record.captureId || null,
    record.proposal ? JSON.stringify(record.proposal) : null,
    record.idempotencyKey || null,
    now,
    now
  );
}
