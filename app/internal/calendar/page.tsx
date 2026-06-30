'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { STATUS_CONFIG } from '@/lib/utils';
import { ChevronLeft, ChevronRight, X, Loader2 } from 'lucide-react';
import type { DeliverableStatus } from '@/lib/types';

interface CalendarDeliverable {
  id: string;
  title: string;
  status: DeliverableStatus;
  type: string;
  due_date: string;
  campaign_title: string;
  campaign_id: string;
}

interface CampaignOption {
  id: string;
  title: string;
}

interface AssigneeOption {
  id: string;
  name: string;
}

const DELIVERABLE_TYPES = ['video', 'graphic', 'copy', 'photo'] as const;
type DeliverableType = typeof DELIVERABLE_TYPES[number];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateString(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const INPUT_CLASS =
  'w-full rounded-lg border border-[#1E1E2A] bg-[#13131A] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E8FF47]/50 placeholder-[#6B6B8A]';
const LABEL_CLASS = 'flex flex-col gap-1.5 text-xs font-medium text-[#E8FF47]';

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [deliverables, setDeliverables] = useState<CalendarDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // lookup data
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);

  // create form state
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<DeliverableType>('video');
  const [formCampaignId, setFormCampaignId] = useState('');
  const [formAssigneeId, setFormAssigneeId] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      const [delResult, campResult, profileResult] = await Promise.all([
        (supabase.from('deliverables' as any) as any)
          .select('id, title, status, type, due_date, campaign_id, campaigns(title)')
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true }),
        (supabase.from('campaigns' as any) as any)
          .select('id, title')
          .order('title', { ascending: true }),
        (supabase.from('profiles' as any) as any)
          .select('id, name')
          .in('role', ['internal', 'admin'])
          .order('name', { ascending: true }),
      ]);

      if (delResult.error) {
        setError(delResult.error.message);
      } else {
        setDeliverables(
          (delResult.data ?? []).map((row: any) => ({
            id: row.id,
            title: row.title,
            status: row.status,
            type: row.type,
            due_date: row.due_date,
            campaign_id: row.campaign_id,
            campaign_title: row.campaigns?.title ?? 'Unknown Campaign',
          }))
        );
      }

      setCampaigns((campResult.data ?? []).map((r: any) => ({ id: r.id, title: r.title })));
      setAssignees((profileResult.data ?? []).map((r: any) => ({ id: r.id, name: r.name })));
      setLoading(false);
    };

    void fetchAll();
  }, []);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  function openModal(day: number) {
    const dateStr = toDateString(year, month, day);
    setModalDate(dateStr);
    setFormTitle('');
    setFormType('video');
    setFormCampaignId(campaigns[0]?.id ?? '');
    setFormAssigneeId('');
    setFormDueDate(dateStr);
    setFormError(null);
  }

  function closeModal() {
    setModalDate(null);
    setFormError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formCampaignId || !formDueDate) {
      setFormError('Title, campaign, and due date are required.');
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload: any = {
      title: formTitle.trim(),
      type: formType,
      campaign_id: formCampaignId,
      due_date: formDueDate,
      status: 'todo',
      assignee_id: formAssigneeId || null,
    };

    const { data, error: insertError } = await (supabase.from('deliverables' as any) as any)
      .insert(payload)
      .select('id, title, status, type, due_date, campaign_id')
      .single();

    if (insertError) {
      setFormError(insertError.message);
      setSaving(false);
      return;
    }

    const campaignTitle = campaigns.find((c) => c.id === formCampaignId)?.title ?? 'Unknown Campaign';
    const newDel: CalendarDeliverable = {
      id: data.id,
      title: data.title,
      status: data.status,
      type: data.type,
      due_date: data.due_date,
      campaign_id: data.campaign_id,
      campaign_title: campaignTitle,
    };

    setDeliverables((prev) => [...prev, newDel]);
    setSaving(false);
    closeModal();

    // Fire-and-forget automations
    void fetch('/api/automations/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger_type: 'deliverable_created',
        deliverable_id: data.id,
        deliverable_title: data.title,
        deliverable_type: data.type,
        assignee_id: formAssigneeId || null,
      }),
    });
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const deliverablesByDay: Record<number, CalendarDeliverable[]> = {};
  for (const del of deliverables) {
    const d = new Date(del.due_date + 'T00:00:00');
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!deliverablesByDay[day]) deliverablesByDay[day] = [];
      deliverablesByDay[day].push(del);
    }
  }

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayDay =
    today.getFullYear() === year && today.getMonth() === month ? today.getDate() : null;

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-[#6B6B8A] text-sm mt-1">
            Deliverable due dates across all campaigns · click an empty date to add one
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg border border-[#1E1E2A] text-[#6B6B8A] hover:text-[#F0F0F8] hover:bg-[#1E1E2A] transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold w-36 text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg border border-[#1E1E2A] text-[#6B6B8A] hover:text-[#F0F0F8] hover:bg-[#1E1E2A] transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-900/20 border border-red-800/40 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-[#6B6B8A] py-2">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="flex items-center justify-center h-96 text-[#6B6B8A] text-sm gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="grid grid-cols-7 border-l border-t border-[#1E1E2A]">
          {cells.map((day, i) => {
            const items = day ? (deliverablesByDay[day] ?? []) : [];
            const isToday = day === todayDay;
            const isEmpty = day !== null && items.length === 0;
            return (
              <div
                key={i}
                onClick={() => { if (isEmpty) openModal(day!); }}
                className={`border-r border-b border-[#1E1E2A] min-h-[120px] p-1.5 ${
                  isEmpty ? 'cursor-pointer hover:bg-[#E8FF47]/5 group' : ''
                }`}
              >
                {day !== null && (
                  <>
                    <div
                      className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                        isToday ? 'bg-[#E8FF47] text-black' : 'text-[#6B6B8A]'
                      }`}
                    >
                      {day}
                    </div>

                    {isEmpty && (
                      <div className="flex items-center justify-center h-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-[#E8FF47]/60">+ add</span>
                      </div>
                    )}

                    <div className="space-y-1">
                      {items.map((del) => {
                        const cfg = STATUS_CONFIG[del.status];
                        const href =
                          del.type === 'video'
                            ? `/internal/review/video/${del.id}`
                            : `/internal/review/image/${del.id}`;
                        return (
                          <Link
                            key={del.id}
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className={`block rounded px-1.5 py-1 text-[10px] leading-tight hover:opacity-80 transition-opacity ${cfg.color}`}
                          >
                            <div className="font-medium truncate">{del.title}</div>
                            <div className="truncate opacity-70">{del.campaign_title}</div>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 flex-wrap">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${cfg.color.split(' ')[0]}`} />
            <span className="text-xs text-[#6B6B8A]">{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* Create deliverable modal */}
      {modalDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-md rounded-2xl border border-[#2D2D38] bg-[#0B0B11] p-6 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold">New Deliverable</h2>
                <p className="text-xs text-[#6B6B8A] mt-0.5">{modalDate}</p>
              </div>
              <button
                onClick={closeModal}
                className="text-[#6B6B8A] hover:text-[#F0F0F8] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <label className={LABEL_CLASS}>
                Title
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Instagram Reel – Game Day"
                  className={INPUT_CLASS}
                  autoFocus
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className={LABEL_CLASS}>
                  Type
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as DeliverableType)}
                    className={INPUT_CLASS}
                  >
                    {DELIVERABLE_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-[#13131A]">
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={LABEL_CLASS}>
                  Due Date
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={(e) => setFormDueDate(e.target.value)}
                    className={INPUT_CLASS + ' [color-scheme:dark]'}
                  />
                </label>
              </div>

              <label className={LABEL_CLASS}>
                Campaign
                <select
                  value={formCampaignId}
                  onChange={(e) => setFormCampaignId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="" className="bg-[#13131A]">Select a campaign…</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#13131A]">
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className={LABEL_CLASS}>
                Assignee <span className="text-[#6B6B8A] font-normal">(optional)</span>
                <select
                  value={formAssigneeId}
                  onChange={(e) => setFormAssigneeId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="" className="bg-[#13131A]">Unassigned</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id} className="bg-[#13131A]">
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              {formError && (
                <p className="text-xs text-red-400">{formError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-[#1E1E2A] px-4 py-2 text-sm text-[#6B6B8A] hover:text-[#F0F0F8] hover:bg-[#1E1E2A] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#E8FF47] px-4 py-2 text-sm font-semibold text-black hover:bg-[#d4eb3a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {saving ? 'Saving…' : 'Create Deliverable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
