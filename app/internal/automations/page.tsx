'use client';
import { useEffect, useState } from 'react';
import { Zap, Plus, Trash2, X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import type {
  AutomationRule,
  AutomationTriggerType,
  AutomationActionType,
  DeliverableStatus,
} from '@/lib/types';

// ─── Display helpers ─────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  status_changed: 'Status changes to…',
  deliverable_created: 'A deliverable is created',
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  notify_assignee: 'Notify the assignee',
  notify_team: 'Notify the whole team',
  auto_assign: 'Auto-assign to a team member',
};

const STATUS_OPTIONS: { value: DeliverableStatus; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
];

function triggerSummary(rule: AutomationRule) {
  if (rule.triggerType === 'status_changed') {
    const s = STATUS_OPTIONS.find((o) => o.value === rule.triggerConfig.toStatus);
    return `Status → ${s?.label ?? rule.triggerConfig.toStatus ?? 'any'}`;
  }
  return 'Deliverable created';
}

function actionSummary(rule: AutomationRule, assignees: AssigneeOption[]) {
  if (rule.actionType === 'auto_assign') {
    const a = assignees.find((x) => x.id === rule.actionConfig.assigneeId);
    return `Auto-assign to ${a?.name ?? '…'}`;
  }
  return ACTION_LABELS[rule.actionType];
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssigneeOption {
  id: string;
  name: string;
}

function mapRow(row: any): AutomationRule {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    triggerType: row.trigger_type,
    triggerConfig: row.trigger_config ?? {},
    actionType: row.action_type,
    actionConfig: row.action_config ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ─── Form default state ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  triggerType: 'status_changed' as AutomationTriggerType,
  toStatus: 'approved' as DeliverableStatus,
  actionType: 'notify_assignee' as AutomationActionType,
  assigneeId: '',
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const INPUT = 'w-full rounded-lg border border-[#1E1E2A] bg-[#13131A] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E8FF47]/50 placeholder-[#6B6B8A]';
const LABEL = 'flex flex-col gap-1.5 text-xs font-medium text-[#E8FF47]';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AutomationsPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [rulesRes, profilesRes] = await Promise.all([
        fetch('/api/automations'),
        fetch('/api/automations/profiles'),
      ]);

      if (rulesRes.ok) {
        const json = await rulesRes.json();
        setRules((json.rules ?? []).map(mapRow));
      } else {
        setError('Failed to load rules.');
      }

      if (profilesRes.ok) {
        const json = await profilesRes.json();
        setAssignees(json.profiles ?? []);
        // Pre-select first assignee in form
        if (json.profiles?.length > 0) {
          setForm((f) => ({ ...f, assigneeId: json.profiles[0].id }));
        }
      }
      setLoading(false);
    };
    void load();
  }, []);

  function openForm() {
    setForm({
      ...EMPTY_FORM,
      assigneeId: assignees[0]?.id ?? '',
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Rule name is required.'); return; }
    if (form.triggerType === 'status_changed' && !form.toStatus) { setFormError('Select a status.'); return; }
    if (form.actionType === 'auto_assign' && !form.assigneeId) { setFormError('Select a team member.'); return; }

    setSaving(true);
    setFormError(null);

    const body = {
      name: form.name,
      trigger_type: form.triggerType,
      trigger_config: form.triggerType === 'status_changed' ? { to_status: form.toStatus } : {},
      action_type: form.actionType,
      action_config: form.actionType === 'auto_assign' ? { assignee_id: form.assigneeId } : {},
    };

    const res = await fetch('/api/automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();

    if (!res.ok) {
      setFormError(json.error ?? 'Failed to create rule.');
      setSaving(false);
      return;
    }

    setRules((prev) => [mapRow(json.rule), ...prev]);
    setSaving(false);
    setFormOpen(false);
  }

  async function toggleRule(rule: AutomationRule) {
    setTogglingId(rule.id);
    const res = await fetch(`/api/automations/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (res.ok) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    }
    setTogglingId(null);
  }

  async function deleteRule(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/automations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
    setDeletingId(null);
  }

  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="p-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={20} className="text-[#E8FF47]" />
            <h1 className="text-2xl font-bold">Automations</h1>
          </div>
          <p className="text-[#6B6B8A] text-sm">
            {rules.length === 0
              ? 'No rules yet — create one to automate your workflow.'
              : `${activeCount} of ${rules.length} rule${rules.length !== 1 ? 's' : ''} active`}
          </p>
        </div>
        <button
          onClick={openForm}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#E8FF47] text-black text-sm font-semibold rounded-lg hover:bg-[#d4eb3a] transition-colors"
        >
          <Plus size={14} /> New Rule
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800/40 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Rule list */}
      {loading ? (
        <div className="flex items-center gap-2 text-[#6B6B8A] text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : rules.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#1E1E2A] py-20 text-center">
          <Zap size={32} className="text-[#2D2D38] mb-3" />
          <p className="text-sm font-medium text-[#6B6B8A]">No automation rules</p>
          <p className="text-xs text-[#6B6B8A]/60 mt-1">Click "New Rule" to create your first automation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rounded-xl border p-4 transition-all ${rule.enabled ? 'border-[#1E1E2A] bg-[#13131A]' : 'border-[#1E1E2A]/50 bg-[#0E0E14] opacity-60'}`}
            >
              <div className="flex items-start gap-4">
                {/* Toggle */}
                <button
                  onClick={() => toggleRule(rule)}
                  disabled={togglingId === rule.id}
                  className="mt-0.5 flex-shrink-0 text-[#6B6B8A] hover:text-[#E8FF47] transition-colors disabled:opacity-40"
                  title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                >
                  {togglingId === rule.id
                    ? <Loader2 size={20} className="animate-spin" />
                    : rule.enabled
                      ? <ToggleRight size={20} className="text-[#E8FF47]" />
                      : <ToggleLeft size={20} />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{rule.name}</span>
                    {!rule.enabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700 text-zinc-400">Disabled</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 font-medium">
                      When: {triggerSummary(rule)}
                    </span>
                    <span className="text-[#6B6B8A] text-xs">→</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-300 font-medium">
                      Then: {actionSummary(rule, assignees)}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#6B6B8A]/60 mt-1.5">
                    Created {new Date(rule.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteRule(rule.id)}
                  disabled={deletingId === rule.id}
                  className="flex-shrink-0 text-[#6B6B8A] hover:text-red-400 transition-colors disabled:opacity-40"
                  title="Delete rule"
                >
                  {deletingId === rule.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* How it works */}
      {!loading && (
        <div className="mt-10 rounded-xl border border-[#1E1E2A] bg-[#13131A] p-5">
          <p className="text-xs font-semibold text-[#6B6B8A] uppercase tracking-wider mb-3">Available rule types</p>
          <div className="space-y-2">
            {[
              { when: 'Status changes to Approved', then: 'Notify the assignee' },
              { when: 'Status changes to In Review', then: 'Notify the team' },
              { when: 'A deliverable is created', then: 'Auto-assign to a team member' },
              { when: 'A deliverable is created', then: 'Notify the team' },
            ].map((ex, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[#6B6B8A]">
                <span className="text-[10px] px-1.5 py-px rounded bg-[#1E1E2A] text-[#F0F0F8]/60">When</span>
                <span>{ex.when}</span>
                <span>→</span>
                <span className="text-[10px] px-1.5 py-px rounded bg-[#1E1E2A] text-[#F0F0F8]/60">Then</span>
                <span>{ex.then}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create rule modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setFormOpen(false); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[#2D2D38] bg-[#0B0B11] p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">New Automation Rule</h2>
              <button onClick={() => setFormOpen(false)} className="text-[#6B6B8A] hover:text-[#F0F0F8] transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <label className={LABEL}>
                Rule name
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Notify team when approved"
                  className={INPUT}
                />
              </label>

              {/* Trigger */}
              <fieldset className="rounded-lg border border-[#1E1E2A] p-4 space-y-3">
                <legend className="text-[10px] font-semibold text-[#6B6B8A] uppercase tracking-wider px-1">When</legend>
                <label className={LABEL}>
                  Trigger
                  <select
                    value={form.triggerType}
                    onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value as AutomationTriggerType }))}
                    className={INPUT}
                  >
                    {(Object.entries(TRIGGER_LABELS) as [AutomationTriggerType, string][]).map(([v, l]) => (
                      <option key={v} value={v} className="bg-[#13131A]">{l}</option>
                    ))}
                  </select>
                </label>

                {form.triggerType === 'status_changed' && (
                  <label className={LABEL}>
                    To status
                    <select
                      value={form.toStatus}
                      onChange={(e) => setForm((f) => ({ ...f, toStatus: e.target.value as DeliverableStatus }))}
                      className={INPUT}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value} className="bg-[#13131A]">{s.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </fieldset>

              {/* Action */}
              <fieldset className="rounded-lg border border-[#1E1E2A] p-4 space-y-3">
                <legend className="text-[10px] font-semibold text-[#6B6B8A] uppercase tracking-wider px-1">Then</legend>
                <label className={LABEL}>
                  Action
                  <select
                    value={form.actionType}
                    onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as AutomationActionType }))}
                    className={INPUT}
                  >
                    {(Object.entries(ACTION_LABELS) as [AutomationActionType, string][]).map(([v, l]) => (
                      <option key={v} value={v} className="bg-[#13131A]">{l}</option>
                    ))}
                  </select>
                </label>

                {form.actionType === 'auto_assign' && (
                  <label className={LABEL}>
                    Assign to
                    <select
                      value={form.assigneeId}
                      onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}
                      className={INPUT}
                    >
                      {assignees.length === 0 && (
                        <option value="" className="bg-[#13131A]">No team members found</option>
                      )}
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id} className="bg-[#13131A]">{a.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </fieldset>

              {formError && <p className="text-xs text-red-400">{formError}</p>}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="flex-1 rounded-lg border border-[#1E1E2A] px-4 py-2 text-sm text-[#6B6B8A] hover:text-[#F0F0F8] hover:bg-[#1E1E2A] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#E8FF47] px-4 py-2 text-sm font-semibold text-black hover:bg-[#d4eb3a] transition-colors disabled:opacity-60"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Saving…' : 'Create Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
