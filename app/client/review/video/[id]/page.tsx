'use client';
import { use, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import type { Comment } from '@/lib/types';
import { formatTimestamp } from '@/lib/utils';
import { ArrowLeft, Play, Pause, ThumbsUp, Plus, Check } from 'lucide-react';

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

export default function ClientVideoReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { campaigns, profile } = useAppStore();
  const supabase = createClient();

  const deliverable = campaigns.flatMap(c => c.deliverables).find(d => d.id === id);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [saving, setSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const fetchComments = async () => {
    const { data, error } = await (supabase.from('comments' as const) as any)
      .select('*, profiles(name)')
      .eq('deliverable_id', id)
      .order('timestamp_seconds', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      setCommentError(error.message);
      setComments([]);
    } else {
      setComments((data ?? []).map(mapCommentRow));
    }
  };

  useEffect(() => {
    void fetchComments();
  }, [id]);

  if (!deliverable) return <div className="p-8 text-[#6B6B8A]">Not found</div>;

  const visibleComments = [...comments].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play(); setPlaying(true); }
  }

  async function submitComment() {
    if (!commentText.trim() || !profile) return;
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
        timestamp_seconds: currentTime,
      },
    ]);

    if (error) {
      setCommentError(error.message);
      setSaving(false);
      return;
    }

    setCommentText('');
    setShowInput(false);
    await fetchComments();
    setSaving(false);
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

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0F]">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#1E1E2A] flex-shrink-0">
        <button onClick={() => router.back()} className="text-[#6B6B8A] hover:text-[#F0F0F8] transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="font-semibold text-sm">{deliverable.title}</h1>
          <p className="text-[#6B6B8A] text-xs">Review & Approve</p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video panel */}
        <div className="flex-1 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center">
            {deliverable.fileUrl ? (
              <video
                ref={videoRef}
                src={deliverable.fileUrl}
                className="max-h-full max-w-full"
                onTimeUpdate={() => videoRef.current && setCurrentTime(videoRef.current.currentTime)}
                onLoadedMetadata={() => videoRef.current && setDuration(videoRef.current.duration)}
                onEnded={() => setPlaying(false)}
              />
            ) : (
              <div className="text-[#6B6B8A]">No video file</div>
            )}
          </div>

          {/* Controls */}
          <div className="px-6 py-4 border-t border-[#1E1E2A]">
            {/* Timeline scrubber */}
            <div
              className="relative h-6 bg-[#1E1E2A] rounded-full mb-3 cursor-pointer"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect();
                const t = ((e.clientX - rect.left) / rect.width) * duration;
                if (videoRef.current) { videoRef.current.currentTime = t; setCurrentTime(t); }
              }}
            >
              <div className="absolute left-0 top-0 h-full bg-[#E8FF47]/20 rounded-full" style={{ width: `${pct}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-[#E8FF47]" style={{ left: `${pct}%` }} />
              {visibleComments.filter(c => c.timestamp != null).map(c => (
                <div
                  key={c.id}
                  title={`${formatTimestamp(c.timestamp || 0)} — ${c.body}`}
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border ${c.resolved ? 'border-emerald-400 bg-emerald-900' : 'border-[#E8FF47] bg-[#E8FF47]/30'}`}
                  style={{ left: `${duration > 0 ? ((c.timestamp || 0) / duration) * 100 : 0}%` }}
                />
              ))}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-full bg-[#E8FF47] text-black flex items-center justify-center hover:bg-[#d4eb3a] transition-colors"
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span className="text-xs text-[#6B6B8A] font-mono">
                {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => {
                  setShowInput(true);
                  if (videoRef.current) { videoRef.current.pause(); setPlaying(false); }
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1E1E2A] text-xs text-[#6B6B8A] hover:text-[#E8FF47] hover:border-[#E8FF47]/30 transition-colors"
              >
                <Plus size={12} /> Comment at {formatTimestamp(currentTime)}
              </button>
            </div>

            {/* Error display */}
            {commentError && (
              <p className="mt-2 text-xs text-red-400">{commentError}</p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-72 border-l border-[#1E1E2A] flex flex-col bg-[#13131A]">
          <div className="px-4 py-3 border-b border-[#1E1E2A]">
            <div className="font-semibold text-sm">Feedback</div>
          </div>

          {/* Comment input */}
          {showInput && (
            <div className="p-4 border-b border-[#1E1E2A] bg-[#0A0A0F]">
              <div className="text-xs text-[#E8FF47] mb-2">at {formatTimestamp(currentTime)}</div>
              <textarea
                autoFocus
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment(); }}
                placeholder="Leave feedback or request a change…"
                rows={3}
                className="w-full bg-[#13131A] border border-[#1E1E2A] rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:border-[#E8FF47]/50 placeholder:text-[#6B6B8A]"
              />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={submitComment}
                  disabled={!commentText.trim() || saving}
                  className="px-3 py-1.5 bg-[#E8FF47] text-black text-xs font-semibold rounded-lg disabled:opacity-40"
                >
                  {saving ? 'Posting…' : 'Post'}
                </button>
                <button
                  onClick={() => { setShowInput(false); setCommentText(''); }}
                  className="px-3 py-1.5 text-[#6B6B8A] text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E1E2A]">
            {visibleComments.map(c => (
              <div key={c.id} className={`p-4 ${c.resolved ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-6 h-6 rounded-full bg-[#E8FF47]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#E8FF47] text-[9px] font-bold">
                      {c.userName.split(' ').map((n: string) => n[0]).join('')}
                    </span>
                  </div>
                  <span className="text-xs font-medium">{c.userName}</span>
                  {c.timestamp != null && (
                    <button
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = c.timestamp!;
                          setCurrentTime(c.timestamp!);
                          videoRef.current.play();
                          setPlaying(true);
                        }
                      }}
                      className="ml-auto text-[10px] text-[#E8FF47] font-mono bg-[#E8FF47]/10 px-1.5 py-0.5 rounded hover:bg-[#E8FF47]/20 transition-colors"
                    >
                      ▶ {formatTimestamp(c.timestamp)}
                    </button>
                  )}
                </div>
                <p className="text-xs leading-relaxed">{c.body}</p>
                {!c.resolved && (
                  <button
                    onClick={() => resolveCommentById(c.id)}
                    className="flex items-center gap-1 text-[10px] text-[#6B6B8A] hover:text-emerald-400 mt-1.5 transition-colors"
                  >
                    <Check size={10} /> Mark resolved
                  </button>
                )}
              </div>
            ))}
            {visibleComments.length === 0 && (
              <div className="p-8 text-center text-[#6B6B8A] text-xs">No feedback yet.</div>
            )}
          </div>

          {/* Approve */}
          <div className="p-4 border-t border-[#1E1E2A]">
            <button className="w-full py-3 bg-[#E8FF47] text-black font-bold text-sm rounded-xl hover:bg-[#d4eb3a] transition-colors flex items-center justify-center gap-2">
              <ThumbsUp size={16} /> Approve This Deliverable
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
