'use client';
import { use, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import { formatTimestamp } from '@/lib/utils';
import { ArrowLeft, Play, Pause, MessageSquare, Check, Plus } from 'lucide-react';
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

export default function VideoReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { campaigns, profile } = useAppStore();
  const supabase = createClient();

  const deliverable = campaigns.flatMap(c => c.deliverables).find(d => d.id === id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [newCommentAt, setNewCommentAt] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [saving, setSaving] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  useEffect(() => {
    if (!deliverable) return;
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

    void fetchComments();
  }, [id, deliverable, supabase]);

  if (!deliverable) return <div className="p-8 text-[#6B6B8A]">Deliverable not found</div>;

  const visibleComments = comments.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  function togglePlay() {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play(); setPlaying(true); }
  }

  function onTimeUpdate() {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  }

  function onLoadedMetadata() {
    if (videoRef.current) setDuration(videoRef.current.duration);
  }

  function seekTo(t: number) {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  }

  function onTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const t = pct * duration;
    seekTo(t);
  }

  function onTimelineRightClick(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const t = pct * duration;
    setNewCommentAt(t);
    if (videoRef.current) { videoRef.current.pause(); setPlaying(false); }
    seekTo(t);
  }

  async function fetchComments() {
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
  }

  async function submitComment() {
    if (!commentText.trim() || !profile) return;
    setSaving(true);
    setCommentError(null);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setCommentError(userError?.message ?? 'Unable to identify current user.');
      setSaving(false);
      return;
    }

    const { error } = await (supabase.from('comments' as const) as any).insert([
      {
        deliverable_id: id,
        user_id: userData.user.id,
        body: commentText.trim(),
        resolved: false,
        timestamp_seconds: newCommentAt ?? currentTime,
      },
    ]);

    if (error) {
      setCommentError(error.message);
      setSaving(false);
      return;
    }

    setCommentText('');
    setNewCommentAt(null);
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

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0F]">
      {/* Top bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#1E1E2A] flex-shrink-0">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-[#6B6B8A] hover:text-[#F0F0F8] text-sm transition-colors">
          <ArrowLeft size={14} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate">{deliverable.title}</h1>
          <p className="text-[#6B6B8A] text-xs">Video Review · Right-click timeline to pin a comment</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6B6B8A]">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          In Review
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Video + controls */}
        <div className="flex-1 flex flex-col bg-black">
          {/* Video */}
          <div className="flex-1 flex items-center justify-center relative">
            {deliverable.fileUrl ? (
              <video
                ref={videoRef}
                src={deliverable.fileUrl}
                className="max-h-full max-w-full"
                onTimeUpdate={onTimeUpdate}
                onLoadedMetadata={onLoadedMetadata}
                onEnded={() => setPlaying(false)}
              />
            ) : (
              <div className="text-[#6B6B8A] text-sm">No video file attached</div>
            )}
          </div>

          {/* Controls */}
          <div className="px-6 py-4 border-t border-[#1E1E2A] flex-shrink-0">
            {/* Timeline */}
            <div
              ref={timelineRef}
              className="relative h-8 bg-[#1E1E2A] rounded-full cursor-pointer mb-3 group"
              onClick={onTimelineClick}
              onContextMenu={onTimelineRightClick}
            >
              {/* Progress */}
              <div className="absolute left-0 top-0 h-full bg-[#E8FF47]/20 rounded-full" style={{ width: `${pct}%` }} />
              {/* Playhead */}
              <div className="absolute top-0 h-full w-0.5 bg-[#E8FF47]" style={{ left: `${pct}%` }} />
              {/* Comment pins */}
              {comments.filter(c => c.timestamp != null).map(comment => {
                const pinPct = duration > 0 ? ((comment.timestamp || 0) / duration) * 100 : 0;
                return (
                  <button
                    key={comment.id}
                    title={`${formatTimestamp(comment.timestamp || 0)} — ${comment.userName}: ${comment.body}`}
                    onClick={e => { e.stopPropagation(); seekTo(comment.timestamp || 0); setActiveComment(comment.id); }}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-transform hover:scale-150 z-10 ${comment.resolved ? 'border-emerald-400 bg-emerald-900' : 'border-[#E8FF47] bg-[#E8FF47]/30'}`}
                    style={{ left: `${pinPct}%` }}
                  />
                );
              })}
            </div>

            <div className="flex items-center gap-4">
              <button onClick={togglePlay} className="w-9 h-9 rounded-full bg-[#E8FF47] text-black flex items-center justify-center hover:bg-[#d4eb3a] transition-colors flex-shrink-0">
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <span className="text-xs text-[#6B6B8A] font-mono flex-shrink-0">
                {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => { setNewCommentAt(currentTime); if (videoRef.current) { videoRef.current.pause(); setPlaying(false); } }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1E1E2A] text-xs text-[#6B6B8A] hover:text-[#E8FF47] hover:border-[#E8FF47]/30 transition-colors"
              >
                <Plus size={12} /> Comment at {formatTimestamp(currentTime)}
              </button>
            </div>
          </div>
        </div>

        {/* Comment sidebar */}
        <div className="w-80 flex-shrink-0 border-l border-[#1E1E2A] flex flex-col bg-[#13131A]">
          <div className="px-4 py-3 border-b border-[#1E1E2A] flex items-center gap-2">
            <MessageSquare size={14} className="text-[#6B6B8A]" />
            <span className="text-sm font-semibold">{comments.length} Comments</span>
            <span className="ml-auto text-xs text-amber-400">{comments.filter(c => !c.resolved).length} open</span>
          </div>

          {/* New comment input */}
          {newCommentAt !== null && (
            <div className="p-4 border-b border-[#1E1E2A] bg-[#0A0A0F]">
              <div className="text-xs text-[#E8FF47] mb-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#E8FF47]" />
                Comment at {formatTimestamp(newCommentAt)}
              </div>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                placeholder="Add a comment… (@ to mention)"
                rows={3}
                className="w-full bg-[#13131A] border border-[#1E1E2A] rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:border-[#E8FF47]/50 placeholder:text-[#6B6B8A]"
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submitComment(); }}
              />
              <div className="flex items-center gap-2 mt-2">
                <button onClick={submitComment} disabled={!commentText.trim()} className="px-3 py-1.5 bg-[#E8FF47] text-black text-xs font-semibold rounded-lg disabled:opacity-40 hover:bg-[#d4eb3a] transition-colors">
                  Post
                </button>
                <button onClick={() => { setNewCommentAt(null); setCommentText(''); }} className="px-3 py-1.5 text-[#6B6B8A] text-xs hover:text-[#F0F0F8] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Comment list */}
          <div className="flex-1 overflow-y-auto divide-y divide-[#1E1E2A]">
            {comments.map(comment => (
              <div
                key={comment.id}
                className={`p-4 cursor-pointer transition-colors ${activeComment === comment.id ? 'bg-[#E8FF47]/5' : 'hover:bg-[#1a1a24]'} ${comment.resolved ? 'opacity-50' : ''}`}
                onClick={() => { seekTo(comment.timestamp || 0); setActiveComment(comment.id); }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full bg-[#E8FF47]/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-[#E8FF47] text-[9px] font-bold">{comment.userName.split(' ').map(n => n[0]).join('')}</span>
                  </div>
                  <span className="text-xs font-medium">{comment.userName}</span>
                  {comment.timestamp != null && (
                    <button
                      onClick={e => { e.stopPropagation(); seekTo(comment.timestamp || 0); }}
                      className="ml-auto text-[10px] text-[#E8FF47] font-mono bg-[#E8FF47]/10 px-1.5 py-0.5 rounded hover:bg-[#E8FF47]/20 transition-colors"
                    >
                      {formatTimestamp(comment.timestamp)}
                    </button>
                  )}
                </div>
                <p className="text-xs text-[#F0F0F8] leading-relaxed">{comment.body}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={e => { e.stopPropagation(); resolveCommentById(comment.id); }}
                    className={`flex items-center gap-1 text-[10px] transition-colors ${comment.resolved ? 'text-emerald-400' : 'text-[#6B6B8A] hover:text-emerald-400'}`}
                  >
                    <Check size={10} />
                    {comment.resolved ? 'Resolved' : 'Resolve'}
                  </button>
                </div>
                {(comment.replies || []).length > 0 && (
                  <div className="mt-2 pl-3 border-l border-[#1E1E2A] space-y-1">
                    {comment.replies!.map(r => (
                      <div key={r.id} className="text-[10px] text-[#6B6B8A]">
                        <span className="font-medium text-[#F0F0F8]">{r.userName}:</span> {r.body}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {comments.length === 0 && (
              <div className="p-8 text-center text-[#6B6B8A] text-xs">
                No comments yet. Right-click the timeline or use "Comment at" to add one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
