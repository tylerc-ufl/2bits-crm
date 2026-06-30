'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { createClient } from '@/lib/supabase/client';
import { LayoutDashboard, Users, Megaphone, CalendarDays, FileVideo, Zap, Bell, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

const INTERNAL_NAV = [
  { href: '/internal', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/internal/crm', label: 'CRM', icon: Users },
  { href: '/internal/campaigns', label: 'Campaigns', icon: Megaphone },
  { href: '/internal/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/internal/review', label: 'Review Queue', icon: FileVideo },
  { href: '/internal/automations', label: 'Automations', icon: Zap },
];

const CLIENT_NAV = [
  { href: '/client', label: 'My Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/client/campaigns', label: 'Campaigns', icon: Megaphone },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function reviewUrl(n: AppNotification) {
  return n.deliverableType === 'video'
    ? `/internal/review/video/${n.deliverableId}`
    : `/internal/review/image/${n.deliverableId}`;
}

export default function Sidebar({ mode }: { mode: 'internal' | 'client' }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, setProfile } = useAppStore();
  const nav = mode === 'internal' ? INTERNAL_NAV : CLIENT_NAV;

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter((n) => !n.read).length;

  function mapRow(row: any): AppNotification {
    return {
      id: row.id,
      userId: row.user_id,
      actorName: row.actor_name,
      type: row.type,
      deliverableId: row.deliverable_id,
      deliverableTitle: row.deliverable_title,
      deliverableType: row.deliverable_type,
      message: row.message,
      read: row.read,
      createdAt: row.created_at,
    };
  }

  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const json = await res.json();
      setNotifications((json.notifications ?? []).map(mapRow));
    } catch {}
  }

  useEffect(() => {
    if (mode !== 'internal') return;
    void fetchNotifications();
    const interval = setInterval(() => void fetchNotifications(), 30000);
    return () => clearInterval(interval);
  }, [mode]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!bellOpen) return;
    function onDown(e: MouseEvent) {
      if (
        bellRef.current && !bellRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [bellOpen]);

  async function markRead(n: AppNotification) {
    setBellOpen(false);
    if (!n.read) {
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read: true } : x))
      );
      try {
        await fetch(`/api/notifications/${n.id}`, { method: 'PATCH' });
      } catch {}
    }
    router.push(reviewUrl(n));
  }

  async function markAllRead() {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.allSettled(
      unreadIds.map((id) => fetch(`/api/notifications/${id}`, { method: 'PATCH' }))
    );
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setProfile(null);
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="w-56 flex-shrink-0 border-r border-[#1E1E2A] bg-[#0A0A0F] flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#1E1E2A]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[#E8FF47] flex items-center justify-center flex-shrink-0">
            <span className="text-black font-black text-xs">2B</span>
          </div>
          <div>
            <div className="text-sm font-bold leading-none">2 Bits</div>
            <div className="text-[10px] text-[#6B6B8A] mt-0.5">
              {mode === 'internal' ? 'Internal' : 'Client Portal'}
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                active
                  ? 'bg-[#E8FF47]/10 text-[#E8FF47] font-medium'
                  : 'text-[#6B6B8A] hover:text-[#F0F0F8] hover:bg-[#1E1E2A]'
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="p-3 border-t border-[#1E1E2A] space-y-0.5">
        {/* Bell */}
        {mode === 'internal' && (
          <div className="relative">
            <button
              ref={bellRef}
              onClick={() => setBellOpen((o) => !o)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
                bellOpen
                  ? 'bg-[#E8FF47]/10 text-[#E8FF47]'
                  : 'text-[#6B6B8A] hover:text-[#F0F0F8] hover:bg-[#1E1E2A]'
              )}
            >
              <Bell size={16} />
              Notifications
              {unread > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {bellOpen && (
              <div
                ref={dropdownRef}
                className="fixed z-50 w-80 rounded-xl border border-[#2D2D38] bg-[#0B0B11] shadow-2xl shadow-black/60 overflow-hidden"
                style={{ left: '224px', bottom: '56px' }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E1E2A]">
                  <span className="text-sm font-semibold">Notifications</span>
                  {unread > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-[10px] text-[#6B6B8A] hover:text-[#E8FF47] transition-colors"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto divide-y divide-[#1E1E2A]">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-xs text-[#6B6B8A]">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markRead(n)}
                        className={cn(
                          'w-full text-left px-4 py-3 hover:bg-[#1a1a24] transition-colors flex gap-3 items-start',
                          !n.read && 'bg-[#E8FF47]/3'
                        )}
                      >
                        {/* Unread dot */}
                        <span className={cn('mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0', n.read ? 'bg-transparent' : 'bg-[#E8FF47]')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[#F0F0F8] leading-snug">{n.message}</p>
                          <p className="text-[10px] text-[#6B6B8A] mt-0.5 truncate">{n.deliverableTitle}</p>
                          <p className="text-[10px] text-[#6B6B8A]/60 mt-0.5">{timeAgo(n.createdAt)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* User */}
        {profile && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-[#E8FF47]/10 flex items-center justify-center flex-shrink-0">
              <span className="text-[#E8FF47] text-xs font-bold">
                {profile.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{profile.name}</div>
              <div className="text-[10px] text-[#6B6B8A] truncate capitalize">
                {profile.role.replace('_', ' ')}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#6B6B8A] hover:text-red-400 hover:bg-red-900/10 transition-all"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
