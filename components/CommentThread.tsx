'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Comment = {
  id: string;
  body: string;
  author_name: string | null;
  timestamp_seconds: number | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

type Props = {
  assetId: string;
  assetType: 'video' | 'image';
  currentTimestamp?: number | null;   // passed in from video page
  onTimestampClick?: (ts: number) => void;
  geolocation?: { lat: number; lng: number } | null;
};

export default function CommentThread({
  assetId,
  assetType,
  currentTimestamp,
  onTimestampClick,
  geolocation,
}: Props) {
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [assetId]);

  async function fetchComments() {
    const { data } = await supabase
      .from('comments')
      .select('*')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: true });
    if (data) setComments(data);
  }

  async function submitComment() {
    if (!body.trim()) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('comments').insert({
      asset_id: assetId,
      asset_type: assetType,
      user_id: user?.id ?? null,
      author_name: user?.email ?? 'Anonymous',
      body: body.trim(),
      timestamp_seconds: assetType === 'video' ? (currentTimestamp ?? null) : null,
      lat: assetType === 'image' ? (geolocation?.lat ?? null) : null,
      lng: assetType === 'image' ? (geolocation?.lng ?? null) : null,
    });

    setBody('');
    setLoading(false);
    fetchComments();
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  return (
    <div className="flex flex-col gap-4 p-4 border rounded-lg bg-white">
      <h3 className="font-semibold text-lg">Comments</h3>

      <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
        {comments.length === 0 && (
          <p className="text-sm text-gray-400">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="border rounded p-3 text-sm bg-gray-50">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-gray-700">
                {c.author_name ?? 'Anonymous'}
              </span>
              {c.timestamp_seconds != null && onTimestampClick && (
                <button
                  onClick={() => onTimestampClick(c.timestamp_seconds!)}
                  className="text-blue-500 underline text-xs"
                >
                  ▶ {formatTime(c.timestamp_seconds)}
                </button>
              )}
              {c.lat != null && c.lng != null && (
                <span className="text-xs text-gray-400">
                  📍 {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
                </span>
              )}
            </div>
            <p className="text-gray-600">{c.body}</p>
            <p className="text-xs text-gray-300 mt-1">
              {new Date(c.created_at).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {assetType === 'video' && currentTimestamp != null && (
          <p className="text-xs text-gray-400">
            Will comment at <strong>{formatTime(currentTimestamp)}</strong>
          </p>
        )}
        {assetType === 'image' && geolocation && (
          <p className="text-xs text-gray-400">
            📍 Location: {geolocation.lat.toFixed(4)}, {geolocation.lng.toFixed(4)}
          </p>
        )}
        <textarea
          className="border rounded p-2 text-sm resize-none"
          rows={3}
          placeholder="Write a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button
          onClick={submitComment}
          disabled={loading || !body.trim()}
          className="self-end px-4 py-2 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          {loading ? 'Posting...' : 'Post Comment'}
        </button>
      </div>
    </div>
  );
}
