'use client';
import { use, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import { ArrowLeft, MessageSquare, Check, Plus } from 'lucide-react';
import type { Comment } from '@/lib/types';

type CommentRow = Database['public']['Tables']['comments']['Row'];
type CommentWithProfile = CommentRow & { profiles?: { name: string } };

function mapCommentRow(row: CommentWithProfile): Comment {
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

export default function ImageReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { campaigns, profile } = useAppStore();
  const supabase = createClient();

  const deliverable = campaigns.flatMap(c => c.deliverables).find(d => d.id === id);
  const imgRef = useRef<HTMLDivElement>(null);

  const [pendingPin, setPendingPin] = useState<{ x: number; y: number } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [saving, setSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  if (!deliverable) return <div className="p-8 text-[#6B6B8A]">Deliverable not found</div>;

  async function fetchComments() {
    const { data, error } = await (supabase.from('comments' as const) as any)
      .select('*, profiles(name)')
      .eq('deliverable_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      setCommentError(error.message);
      setComments([]);
    } else {
      setComments((data ?? []).map(mapCommentRow));
    }
  }

  useEffect(() => {
    void fetchComments();
  }, [id, supabase]);

  const visibleComments = comments.filter(c => c.pinX != null);

  function onImageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingPin({ x, y });
    setCommentText('');
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
    await fetchComments();
    setSaving(false);

    // Fire-and-forget notification
    void fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'comment',
        deliverable_id: id,
        deliverable_title: deliverable.title,
        deliverable_type: deliverable.type,
        message: `${profile.name} commented on "${deliverable.title}"`,
      }),
    });
  }

  async function resolveCommentById(commentId: string) {
    const { error } = await (supabase.from('comments' as const) as any)
      .update({ resolved: true })
      .eq('id', commentId);

    if (error) {
      setCommentError(error.message);
      return;
    }

    setComments((prev) => prev.map((comment) =>
      comment.id === commentId ? { ...comment, resolved: true } : comment
    ));
  }

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0F]">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#1E1E2A] flex-shrink-0">
        <button onClick={() => router.back()} className="text-[#6B6B8A] hover:text-[#F0F0F8] transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate">{deliverable.title}</h1>
          <p className="text-[#6B6B8A] text-xs">Image Review · Click anywhere on the image to pin a comment</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6B6B8A]">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          In Review
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Image canvas */}
        <div className="flex-1 flex items-center justify-center bg-[#080810] p-8 overflow-auto">
          <div
            ref={imgRef}
            className="relative cursor-crosshair select-none"
            onClick={onImageClick}
            style={{ maxWidth: '100%', maxHeight: '100%' }}
          >
            {deliverable.fileUrl ? (
              <img
                src={deliverable.fileUrl}
                alt={deliverable.title}
                className="max-w-full max-h-[calc(100vh-160px)] rounded-lg"
                draggable={false}
              />
            ) : (
              <div className="w-[800px] h-[500px] bg-[#13131A] rounded-lg flex items-center justify-center text-[#6B6B8A]">
                No image file attached
              </div>
            )}

            {/* Existing comment pins */}
            {comments.map((comment, i) => (
              <button
                key={comment.id}
                title={`${comment.userName}: ${comment.body}`}
                onClick={e => { e.stopPropagation(); setActiveComment(activeComment === comment.id ? null : comment.id); setPendingPin(null); }}
                className={`absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 flex items-center justify-center text-[10px] font-bold z-10 transition-all hover:scale-125 ${comment.resolved ? 'border-emerald-400 bg-emerald-900/80 text-emerald-300' : 'border-[#E8FF47] bg-[#0A0A0F] text-[#E8FF47]'}`}
                style={{ left: `${comment.pinX}%`, top: `${comment.pinY}%` }}
              >
                {i + 1}
              </button>
            ))}

            {/* Active comment tooltip */}
            {activeComment && (() => {
              const c = comments.find(c => c.id === activeComment);
              if (!c) return null;
              return (
                <div
                  className="absolute z-20 w-64 bg-[#13131A] border border-[#1E1E2A] rounded-xl p-3 shadow-2xl"
                  style={{
                    left: `${Math.min(c.pinX || 0, 70)}%`,
                    top: `${(c.pinY || 0) + 4}%`,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded-full bg-[#E8FF47]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[#E8FF47] text-[8px] font-bold">{c.userName.split(' ').map(n => n[0]).join('')}</span>
                    </div>
                    <span className="text-xs font-medium">{c.userName}</span>
                    <button
                      onClick={() => resolveCommentById(c.id)}
                      className={`ml-auto flex items-center gap-1 text-[10px] ${c.resolved ? 'text-emerald-400' : 'text-[#6B6B8A] hover:text-emerald-400'} transition-colors`}
                    >
                      <Check size={10} /> {c.resolved ? 'Resolved' : 'Resolve'}
                    </button>
                  </div>
                  <p className="text-xs leading-relaxed">{c.body}</p>
                  {(c.replies || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#1E1E2A] space-y-1">
                      {c.replies!.map(r => (
                        <div key={r.id} className="text-[10px] text-[#6B6B8A]">
                          <span className="font-medium text-[#F0F0F8]">{r.userName}:</span> {r.body}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Pending pin */}
            {pendingPin && (
              <>
                <div
                  className="absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#00C2FF] bg-[#00C2FF]/20 z-10 animate-pulse"
                  style={{ left: `${pendingPin.x}%`, top: `${pendingPin.y}%` }}
                />
                <div
                  className="absolute z-20 w-64 bg-[#13131A] border border-[#00C2FF]/50 rounded-xl p-3 shadow-2xl"
                  style={{
                    left: `${Math.min(pendingPin.x, 70)}%`,
                    top: `${pendingPin.y + 4}%`,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <div className="text-xs text-[#00C2FF] mb-2">New comment</div>
                  <textarea
                    autoFocus
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Add feedback at this point…"
                    rows={3}
                    className="w-full bg-[#0A0A0F] border border-[#1E1E2A] rounded-lg p-2 text-xs resize-none focus:outline-none focus:border-[#00C2FF]/50 placeholder:text-[#6B6B8A]"
                    onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submitComment(); if (e.key === 'Escape') setPendingPin(null); }}
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={submitComment} disabled={!commentText.trim()} className="px-2.5 py-1.5 bg-[#00C2FF] text-black text-xs font-semibold rounded-lg disabled:opacity-40 hover:bg-[#00b3eb] transition-colors">
                      Post
                    </button>
                    <button onClick={() => setPendingPin(null)} className="px-2.5 py-1.5 text-[#6B6B8A] text-xs hover:text-[#F0F0F8] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Comment sidebar */}
        <div className="w-72 flex-shrink-0 border-l border-[#1E1E2A] flex flex-col bg-[#13131A]">
          <div className="px-4 py-3 border-b border-[#1E1E2A] flex items-center gap-2">
            <MessageSquare size={14} className="text-[#6B6B8A]" />
            <span className="text-sm font-semibold">{comments.length} Comments</span>
            <span className="ml-auto text-xs text-amber-400">{comments.filter(c => !c.resolved).length} open</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#1E1E2A]">
            {comments.map((comment, i) => (
              <div
                key={comment.id}
                className={`p-4 cursor-pointer transition-colors ${activeComment === comment.id ? 'bg-[#E8FF47]/5' : 'hover:bg-[#1a1a24]'} ${comment.resolved ? 'opacity-50' : ''}`}
                onClick={() => setActiveComment(activeComment === comment.id ? null : comment.id)}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#E8FF47]/10 flex items-center justify-center flex-shrink-0 text-[#E8FF47] text-[9px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-xs font-medium">{comment.userName}</span>
                  <button
                    onClick={e => { e.stopPropagation(); resolveCommentById(comment.id); }}
                    className={`ml-auto flex items-center gap-1 text-[10px] ${comment.resolved ? 'text-emerald-400' : 'text-[#6B6B8A] hover:text-emerald-400'} transition-colors`}
                  >
                    <Check size={10} /> {comment.resolved ? 'Resolved' : 'Resolve'}
                  </button>
                </div>
                <p className="text-xs text-[#F0F0F8] leading-relaxed">{comment.body}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <div className="p-8 text-center text-[#6B6B8A] text-xs">
                No comments yet. Click anywhere on the image to pin feedback.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
