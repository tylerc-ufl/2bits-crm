'use client';
import { use, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { Comment } from '@/lib/types';
import { ArrowLeft, ThumbsUp, Check } from 'lucide-react';

type CommentRow = Database['public']['Tables']['comments']['Row'];
type CommentWithProfile = CommentRow & { profiles?: { name: string } };

function mapCommentRow(row: CommentWithProfile) {
  return {
    id: row.id,
    deliverableId: row.deliverable_id,
    userId: row.user_id,
    userName: row.profiles?.name ?? row.user_id,
    userRole: 'internal',
    body: row.body,
    resolved: row.resolved,
    createdAt: row.created_at,
    timestamp: row.timestamp_seconds ?? undefined,
    pinX: row.pin_x ?? undefined,
    pinY: row.pin_y ?? undefined,
    replies: [],
  };
}

export default function ClientImageReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { campaigns, profile } = useAppStore();
  const supabase = createClient();

  const deliverable = campaigns.flatMap(c => c.deliverables).find(d => d.id === id);
  const imgRef = useRef<HTMLDivElement>(null);

  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentError, setCommentError] = useState<string | null>(null);

  const fetchComments = async () => {
    const { data, error } = await (supabase.from('comments' as const) as any)
      .select('*, profiles(name)')
      .eq('deliverable_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      setCommentError(error.message);
      setComments([]);
    } else {
      setComments((data ?? []).map(mapCommentRow).filter((c: Comment) => c.pinX != null));
    }
  };

  useEffect(() => {
    void fetchComments();
  }, [id]);

  if (!deliverable) return <div className="p-8 text-[#6B6B8A]">Not found</div>;

  const commentsWithPins = comments.filter(c => c.pinX != null);

  function onImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setPendingPin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    setActiveComment(null);
  }

  async function submitComment() {
    if (!commentText.trim() || !profile || !pendingPin) return;
    setSaving(true);
    setCommentError(null);

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      setCommentError(authError?.message ?? 'Unable to identify current user.');
      setSaving(false);
      return;
    }

    const { error } = await (supabase.from('comments' as const) as any).insert([
      {
        deliverable_id: id,
        user_id: userData.user.id,
        body: commentText.trim(),
        resolved: false,
        pin_x: pendingPin.x,
        pin_y: pendingPin.y,
      },
    ]);

    if (error) {
      setCommentError(error.message);
      setSaving(false);
      return;
    }

    setCommentText('');
    setPendingPin(null);
    setSaving(false);
    await fetchComments();
  }

  async function resolveComment(commentId: string) {
    const { error } = await (supabase.from('comments' as const) as any)
      .update({ resolved: true })
      .eq('id', commentId);
    if (!error) {
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c));
      setActiveComment(null);
    } else {
      setCommentError(error.message);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0F]">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#1E1E2A] flex-shrink-0">
        <button onClick={() => router.back()} className="text-[#6B6B8A] hover:text-[#F0F0F8] transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-semibold text-sm">{deliverable.title}</h1>
          <p className="text-[#6B6B8A] text-xs">Click on the image to pin feedback</p>
        </div>
        {commentError && (
          <p className="ml-auto text-xs text-red-400">{commentError}</p>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Image panel */}
        <div className="flex-1 flex items-center justify-center bg-[#080810] p-8 overflow-auto">
          <div ref={imgRef} className="relative cursor-crosshair select-none" onClick={onImageClick}>
            {deliverable.fileUrl ? (
              <img
                src={deliverable.fileUrl}
                alt={deliverable.title}
                className="max-w-full max-h-[calc(100vh-160px)] rounded-xl"
                draggable={false}
              />
            ) : (
              <div className="w-[800px] h-[500px] bg-[#13131A] rounded-xl flex items-center justify-center text-[#6B6B8A]">
                No image attached
              </div>
            )}

            {/* Existing pins */}
            {commentsWithPins.map((c, i) => (
              <button
                key={c.id}
                onClick={e => {
                  e.stopPropagation();
                  setActiveComment(activeComment === c.id ? null : c.id);
                  setPendingPin(null);
                }}
                className={`absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 hover:scale-125 transition-transform ${
                  c.resolved
                    ? 'border-emerald-400 bg-emerald-900/80 text-emerald-300'
                    : 'border-[#E8FF47] bg-[#0A0A0F] text-[#E8FF47]'
                }`}
                style={{ left: `${c.pinX}%`, top: `${c.pinY}%` }}
                title={c.body}
              >
                {i + 1}
              </button>
            ))}

            {/* Active comment popup */}
            {activeComment && (() => {
              const c = commentsWithPins.find(c => c.id === activeComment);
              if (!c) return null;
              return (
                <div
                  className="absolute z-20 w-60 bg-[#13131A] border border-[#1E1E2A] rounded-xl p-3 shadow-2xl"
                  style={{ left: `${Math.min(c.pinX || 0, 65)}%`, top: `${(c.pinY || 0) + 5}%` }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="text-xs font-medium mb-1">{c.userName}</div>
                  <p className="text-xs text-[#F0F0F8] leading-relaxed">{c.body}</p>
                  {!c.resolved && (
                    <button
                      onClick={() => resolveComment(c.id)}
                      className="flex items-center gap-1 text-[10px] text-[#6B6B8A] hover:text-emerald-400 mt-2 transition-colors"
                    >
                      <Check size={10} /> Mark resolved
                    </button>
                  )}
                  {c.resolved && (
                    <span className="text-[10px] text-emerald-400 mt-2 block">✓ Resolved</span>
                  )}
                </div>
              );
            })()}

            {/* Pending pin + input */}
            {pendingPin && (
              <>
                <div
                  className="absolute w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00C2FF] bg-[#00C2FF]/20 z-10 animate-pulse"
                  style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}
                />
                <div
                  className="absolute z-20 w-60 bg-[#13131A] border border-[#00C2FF]/50 rounded-xl p-3 shadow-2xl"
                  style={{ left: `${Math.min(pendingPin.x, 65)}%`, top: `${pendingPin.y + 5}%` }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="text-xs text-[#00C2FF] mb-2">📍 Pinned feedback</div>
                  <textarea
                    autoFocus
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') setPendingPin(null);
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment();
                    }}
                    placeholder="Describe the change needed…"
                    rows={3}
                    className="w-full bg-[#0A0A0F] border border-[#1E1E2A] rounded-lg p-2 text-xs resize-none focus:outline-none focus:border-[#00C2FF]/50 placeholder:text-[#6B6B8A]"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={submitComment}
                      disabled={!commentText.trim() || saving}
                      className="px-2.5 py-1.5 bg-[#00C2FF] text-black text-xs font-semibold rounded-lg disabled:opacity-40"
                    >
                      {saving ? 'Posting…' : 'Post'}
                    </button>
                    <button
                      onClick={() => { setPendingPin(null); setCommentText(''); }}
                      className="px-2.5 py-1.5 text-[#6B6B8A] text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l border-[#1E1E2A] flex flex-col bg-[#13131A]">
          <div className="px-4 py-3 border-b border-[#1E1E2A] font-semibold text-sm">
            Feedback ({commentsWithPins.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E1E2A]">
            {commentsWithPins.map((c, i) => (
              <div
                key={c.id}
                className={`p-4 cursor-pointer hover:bg-[#1a1a24] transition-colors ${c.resolved ? 'opacity-50' : ''}`}
                onClick={() => setActiveComment(activeComment === c.id ? null : c.id)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#E8FF47]/10 flex items-center justify-center text-[#E8FF47] text-[9px] font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-xs font-medium">{c.userName}</span>
                  {c.resolved && <span className="ml-auto text-[10px] text-emerald-400">Resolved</span>}
                </div>
                <p className="text-xs text-[#F0F0F8] leading-relaxed">{c.body}</p>
              </div>
            ))}
            {commentsWithPins.length === 0 && (
              <div className="p-8 text-center text-[#6B6B8A] text-xs">
                Click the image to pin feedback.
              </div>
            )}
          </div>

          {/* Approve */}
          <div className="p-4 border-t border-[#1E1E2A]">
            <button className="w-full py-3 bg-[#E8FF47] text-black font-bold text-sm rounded-xl hover:bg-[#d4eb3a] transition-colors flex items-center justify-center gap-2">
              <ThumbsUp size={16} /> Approve This Design
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
