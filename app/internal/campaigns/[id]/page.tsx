'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import { formatCurrency, formatDate, STATUS_CONFIG } from '@/lib/utils';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, FileVideo, Image as ImageIcon, FileText, Camera, Loader2, Upload, LayoutGrid, GanttChartSquare } from 'lucide-react';
import type { Deliverable, DeliverableStatus, Campaign, KPI } from '@/lib/types';

const COLUMNS: DeliverableStatus[] = ['todo', 'in_progress', 'in_review', 'approved', 'posted'];

const TYPE_ICONS = {
  video: FileVideo,
  graphic: ImageIcon,
  copy: FileText,
  photo: Camera,
};

type DeliverableRow = Database['public']['Tables']['deliverables']['Row'];
type CommentRow = Database['public']['Tables']['comments']['Row'];
type CampaignRow = Database['public']['Tables']['campaigns']['Row'];
type CampaignContactRow = { contact_id: string; contacts?: { id: string; name: string } };
type CampaignWithDeliverables = CampaignRow & {
  deliverables?: (DeliverableRow & { comments?: CommentRow[] })[];
  campaign_contacts?: CampaignContactRow[];
};

function mapDeliverableRow(del: DeliverableRow & { comments?: CommentRow[] }): Deliverable {
  return {
    id: del.id,
    campaignId: del.campaign_id,
    title: del.title,
    type: del.type,
    status: del.status,
    assigneeId: del.assignee_id ?? undefined,
    assigneeName: undefined,
    dueDate: del.due_date,
    fileUrl: del.file_url ?? undefined,
    thumbnailUrl: del.thumbnail_url ?? undefined,
    comments: (del.comments ?? []).map((comment) => ({
      id: comment.id,
      deliverableId: comment.deliverable_id,
      userId: comment.user_id,
      userName: '',
      userRole: 'internal',
      body: comment.body,
      resolved: comment.resolved,
      createdAt: comment.created_at,
    })),
    createdAt: del.created_at,
  };
}

function mapCampaignRow(row: CampaignWithDeliverables): Campaign {
  const contacts = row.campaign_contacts ?? [];
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description ?? '',
    tags: row.tags ?? [],
    dealValue: row.deal_value !== null ? Number(row.deal_value) : undefined,
    kpis: Array.isArray(row.kpis) ? (row.kpis as unknown as KPI[]) : [],
    createdAt: row.created_at,
    clientIds: contacts.map((contact) => contact.contact_id),
    clientNames: contacts.map((contact) => contact.contacts?.name ?? ''),
    deliverables: (row.deliverables ?? []).map(mapDeliverableRow),
  };
}

function TrendIcon({ trend }: { trend?: string }) {
  if (trend === 'up') return <TrendingUp size={12} className="text-emerald-400" />;
  if (trend === 'down') return <TrendingDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-zinc-500" />;
}

// Extracts just the bg-* class from STATUS_CONFIG's combined color string
function statusBg(color: string) {
  return color.split(' ')[0];
}

function GanttView({ deliverables }: { deliverables: Deliverable[] }) {
  if (deliverables.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-[#6B6B8A] text-sm border border-dashed border-[#1E1E2A] rounded-xl">
        No deliverables yet
      </div>
    );
  }

  const dates = deliverables.flatMap((d) => [
    new Date(d.createdAt).getTime(),
    new Date(d.dueDate).getTime(),
  ]);
  const rangeStart = Math.min(...dates);
  const rangeEnd = Math.max(...dates);
  const totalMs = rangeEnd - rangeStart || 1;

  // Build tick marks (weekly or daily depending on range)
  const totalDays = Math.ceil(totalMs / 86400000);
  const tickInterval = totalDays <= 14 ? 1 : totalDays <= 60 ? 7 : 14;
  const ticks: Date[] = [];
  const cursor = new Date(rangeStart);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= rangeEnd) {
    ticks.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + tickInterval);
  }

  function pct(ts: number) {
    return Math.min(100, Math.max(0, ((ts - rangeStart) / totalMs) * 100));
  }

  const sorted = [...deliverables].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return (
    <div className="rounded-xl border border-[#1E1E2A] bg-[#13131A] overflow-hidden">
      {/* Timeline header */}
      <div className="flex border-b border-[#1E1E2A]">
        <div className="w-56 flex-shrink-0 px-4 py-2 text-xs text-[#6B6B8A] font-medium border-r border-[#1E1E2A]">
          Deliverable
        </div>
        <div className="flex-1 relative h-8 overflow-hidden">
          {ticks.map((tick) => {
            const left = pct(tick.getTime());
            return (
              <div
                key={tick.toISOString()}
                className="absolute top-0 h-full flex flex-col justify-end pb-1"
                style={{ left: `${left}%` }}
              >
                <div className="h-2 border-l border-[#2D2D38]" />
                <span className="text-[9px] text-[#6B6B8A] ml-1 whitespace-nowrap">
                  {tick.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      <div>
        {sorted.map((del, i) => {
          const cfg = STATUS_CONFIG[del.status];
          const bg = statusBg(cfg.color);
          const startPct = pct(new Date(del.createdAt).getTime());
          const endPct = pct(new Date(del.dueDate).getTime());
          const widthPct = Math.max(endPct - startPct, 0.5);
          const reviewUrl =
            del.type === 'video'
              ? `/internal/review/video/${del.id}`
              : `/internal/review/image/${del.id}`;

          return (
            <div
              key={del.id}
              className={`flex items-center group ${i % 2 === 1 ? 'bg-[#0A0A0F]' : ''}`}
            >
              {/* Label */}
              <div className="w-56 flex-shrink-0 px-4 py-2.5 border-r border-[#1E1E2A] min-w-0">
                <Link
                  href={reviewUrl}
                  className="text-xs font-medium text-[#F0F0F8] hover:text-[#E8FF47] truncate block transition-colors"
                >
                  {del.title}
                </Link>
                <span className={`inline-block mt-0.5 text-[9px] px-1.5 py-px rounded-full ${cfg.color}`}>
                  {cfg.label}
                </span>
              </div>

              {/* Bar track */}
              <div className="flex-1 relative h-10 px-0">
                {/* Grid lines */}
                {ticks.map((tick) => (
                  <div
                    key={tick.toISOString()}
                    className="absolute top-0 bottom-0 border-l border-[#1E1E2A]"
                    style={{ left: `${pct(tick.getTime())}%` }}
                  />
                ))}
                {/* Bar */}
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-full ${bg} opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-2 overflow-hidden`}
                  style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  title={`${formatDate(del.createdAt)} → ${formatDate(del.dueDate)}`}
                >
                  <span className="text-[9px] font-medium text-white/80 truncate whitespace-nowrap">
                    {del.title}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DeliverableStatus | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadAccept, setUploadAccept] = useState<string>('');
  const [view, setView] = useState<'kanban' | 'gantt'>('kanban');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const fetchCampaign = async () => {
      setLoading(true);
      setError(null);
      const campaignClient = supabase.from('campaigns' as const) as any;
      const { data, error: fetchError } = await campaignClient
        .select('*, deliverables(*, comments(*)), campaign_contacts(*, contacts(id, name))')
        .eq('id', id)
        .single();

      if (fetchError) {
        setError(fetchError.message);
        setCampaign(null);
      } else {
        setCampaign(mapCampaignRow(data));
      }
      setLoading(false);
    };

    void fetchCampaign();
  }, [id, supabase]);

  const getAcceptForType = (type: Deliverable['type']) => {
    if (type === 'video') return 'video/*';
    if (type === 'graphic' || type === 'photo') return 'image/*';
    return '*/*';
  };

  const openUploadPicker = (deliverableId: string, type: Deliverable['type']) => {
    setUploadingId(null);
    setUploadAccept(getAcceptForType(type));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      setUploadingId(deliverableId);
      fileInputRef.current.click();
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const deliverableId = uploadingId;
    if (!file || !deliverableId || !campaign) return;

    setError(null);
    setSavingStatus(true);

    const extension = file.name.split('.').pop() ?? '';
    const filePath = `deliverables/${campaign.id}/${deliverableId}/${Date.now()}.${extension}`;
    const storage = supabase.storage.from('deliverables');

    const { error: uploadError } = await storage.upload(filePath, file, { upsert: true });
    if (uploadError) {
      setError(uploadError.message);
      setSavingStatus(false);
      return;
    }

    const { data: publicUrlData } = storage.getPublicUrl(filePath);
    if (!publicUrlData?.publicUrl) {
      setError('Failed to generate public file URL.');
      setSavingStatus(false);
      return;
    }

    const isImage = file.type.startsWith('image/');
    const updatePayload: any = {
      file_url: publicUrlData.publicUrl,
    };
    if (isImage) {
      updatePayload.thumbnail_url = publicUrlData.publicUrl;
    }

    const { error: updateError } = await (supabase.from('deliverables' as const) as any)
      .update(updatePayload)
      .eq('id', deliverableId);

    if (updateError) {
      setError(updateError.message);
      setSavingStatus(false);
      return;
    }

    setCampaign((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        deliverables: prev.deliverables.map((del) =>
          del.id === deliverableId
            ? { ...del, fileUrl: publicUrlData.publicUrl, thumbnailUrl: isImage ? publicUrlData.publicUrl : del.thumbnailUrl }
            : del
        ),
      };
    });

    setSavingStatus(false);
    setUploadingId(null);
  };

  const onDrop = async (status: DeliverableStatus) => {
    if (!dragging || !campaign) return;
    setSavingStatus(true);
    setDragOver(null);

    const droppedDel = campaign.deliverables.find((d) => d.id === dragging);

    const deliverablesClient = supabase.from('deliverables' as const) as any;
    const { error: updateError } = await deliverablesClient.update({ status }).eq('id', dragging);
    if (updateError) {
      setError(updateError.message);
    } else {
      setCampaign((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          deliverables: prev.deliverables.map((del) =>
            del.id === dragging ? { ...del, status } : del
          ),
        };
      });

      // Fire-and-forget notification + automations
      if (droppedDel && profile) {
        const statusLabel = STATUS_CONFIG[status]?.label ?? status;
        void fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'status_change',
            deliverable_id: dragging,
            deliverable_title: droppedDel.title,
            deliverable_type: droppedDel.type,
            message: `${profile.name} moved "${droppedDel.title}" to ${statusLabel}`,
          }),
        });
        void fetch('/api/automations/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trigger_type: 'status_changed',
            deliverable_id: dragging,
            deliverable_title: droppedDel.title,
            deliverable_type: droppedDel.type,
            assignee_id: droppedDel.assigneeId ?? null,
            to_status: status,
          }),
        });
      }
    }
    setSavingStatus(false);
    setDragging(null);
  };

  if (loading) {
    return (
      <div className="p-8 text-[#6B6B8A] flex items-center gap-3">
        <Loader2 className="animate-spin" size={18} /> Loading campaign...
      </div>
    );
  }

  if (!campaign) {
    return <div className="p-8 text-[#6B6B8A]">Campaign not found</div>;
  }

  const delivsByStatus: Record<DeliverableStatus, Deliverable[]> = {
    todo: [], in_progress: [], in_review: [], approved: [], posted: [],
  };
  campaign.deliverables.forEach((d) => delivsByStatus[d.status].push(d));

  return (
    <div className="p-8">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-[#6B6B8A] hover:text-[#F0F0F8] text-sm mb-6 transition-colors">
        <ArrowLeft size={14} /> Back to Campaigns
      </button>

      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">{campaign.title}</h1>
            <div className="flex items-center gap-3 text-sm text-[#6B6B8A]">
              <span>{campaign.clientNames.join(' × ')}</span>
              <span>·</span>
              <span>{formatDate(campaign.startDate)} – {formatDate(campaign.endDate)}</span>
              {campaign.dealValue && (
                <><span>·</span><span className="text-emerald-400 font-medium">{formatCurrency(campaign.dealValue)}</span></>
              )}
            </div>
            {campaign.description && <p className="text-sm text-[#6B6B8A] mt-2 max-w-2xl">{campaign.description}</p>}
          </div>
          <span className={`text-sm px-3 py-1 rounded-full capitalize ${campaign.status === 'active' ? 'bg-emerald-900/60 text-emerald-300' : campaign.status === 'planning' ? 'bg-blue-900/60 text-blue-300' : 'bg-zinc-700 text-zinc-300'}`}>
            {campaign.status}
          </span>
        </div>
      </div>

      {campaign.kpis.length > 0 && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {campaign.kpis.map((kpi: KPI) => (
            <div key={kpi.label} className="rounded-xl border border-[#1E1E2A] bg-[#13131A] p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#6B6B8A]">{kpi.label}</span>
                <TrendIcon trend={kpi.trend} />
              </div>
              <div className="text-xl font-bold">{kpi.value}{kpi.unit}</div>
            </div>
          ))}
        </div>
      )}

      {error ? <div className="mb-4 text-sm text-rose-400">{error}</div> : null}
      {savingStatus ? <div className="mb-4 text-sm text-[#6B6B8A]">Saving status...</div> : null}
      <input
        ref={fileInputRef}
        type="file"
        accept={uploadAccept}
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* View toggle */}
      <div className="flex items-center gap-1 mb-4 p-1 rounded-lg bg-[#13131A] border border-[#1E1E2A] w-fit">
        <button
          onClick={() => setView('kanban')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            view === 'kanban'
              ? 'bg-[#E8FF47]/10 text-[#E8FF47]'
              : 'text-[#6B6B8A] hover:text-[#F0F0F8]'
          }`}
        >
          <LayoutGrid size={13} /> Kanban
        </button>
        <button
          onClick={() => setView('gantt')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            view === 'gantt'
              ? 'bg-[#E8FF47]/10 text-[#E8FF47]'
              : 'text-[#6B6B8A] hover:text-[#F0F0F8]'
          }`}
        >
          <GanttChartSquare size={13} /> Gantt
        </button>
      </div>

      {view === 'gantt' ? (
        <GanttView deliverables={campaign.deliverables} />
      ) : (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((status) => {
          const cfg = STATUS_CONFIG[status];
          const cards = delivsByStatus[status];
          const isOver = dragOver === status;
          return (
            <div
              key={status}
              onDragOver={(e) => { e.preventDefault(); setDragOver(status); }}
              onDrop={() => onDrop(status)}
              onDragLeave={() => setDragOver(null)}
              className={`flex-shrink-0 w-64 rounded-xl border transition-colors ${isOver ? 'border-[#E8FF47]/50 bg-[#E8FF47]/5' : 'border-[#1E1E2A] bg-[#13131A]'}`}
            >
              <div className="px-4 py-3 border-b border-[#1E1E2A] flex items-center justify-between">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                <span className="text-xs text-[#6B6B8A]">{cards.length}</span>
              </div>
              <div className="p-3 space-y-2 min-h-[200px]">
                {cards.map((del) => {
                  const Icon = TYPE_ICONS[del.type];
                  const openComments = del.comments.filter((c) => !c.resolved).length;
                  const reviewUrl = del.type === 'video'
                    ? `/internal/review/video/${del.id}`
                    : `/internal/review/image/${del.id}`;
                  return (
                    <div
                      key={del.id}
                      draggable
                      onDragStart={() => setDragging(del.id)}
                      className="rounded-lg bg-[#0A0A0F] border border-[#1E1E2A] p-3 cursor-grab active:cursor-grabbing hover:border-[#E8FF47]/30 transition-colors group"
                    >
                      {del.thumbnailUrl && (
                        <div className="w-full h-28 rounded-md overflow-hidden mb-2 bg-[#1E1E2A]">
                          <img src={del.thumbnailUrl} alt={del.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <Icon size={13} className="text-[#6B6B8A] mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium leading-snug">{del.title}</p>
                          <p className="text-[10px] text-[#6B6B8A] mt-0.5">Due {formatDate(del.dueDate)}</p>
                          {del.assigneeName && <p className="text-[10px] text-[#6B6B8A]">→ {del.assigneeName}</p>}
                        </div>
                      </div>
                      <div className="mt-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          {openComments > 0 ? (
                            <span className="text-[10px] bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded-full">{openComments} comments</span>
                          ) : <span className="text-[10px] text-transparent">empty</span>}
                          {(del.fileUrl || del.thumbnailUrl) && (
                            <Link href={reviewUrl} className="text-[10px] text-[#E8FF47] hover:underline">Review →</Link>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={uploadingId === del.id}
                          onClick={() => openUploadPicker(del.id, del.type)}
                          className="flex items-center justify-center gap-2 w-full rounded-lg border border-[#1E1E2A] bg-[#0A0A0F] px-2 py-2 text-[10px] text-[#E8FF47] hover:border-[#E8FF47]/50 hover:bg-[#121219] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Upload size={12} />
                          {uploadingId === del.id ? 'Uploading…' : del.fileUrl ? 'Replace file' : 'Upload file'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {cards.length === 0 && (
                  <div className="flex items-center justify-center h-16 text-[#6B6B8A] text-xs border-2 border-dashed border-[#1E1E2A] rounded-lg">
                    Drop here
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
