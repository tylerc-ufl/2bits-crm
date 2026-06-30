-- Comments for video (timestamped) and image (geolocated) review
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  asset_id text not null,
  asset_type text not null check (asset_type in ('video', 'image')),
  user_id uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null,
  timestamp_seconds float,   -- video only
  lat float,                 -- image only
  lng float,                 -- image only
  created_at timestamptz default now()
);

alter table comments enable row level security;

create policy "Anyone authenticated can read comments"
  on comments for select using (auth.role() = 'authenticated');

create policy "Anyone authenticated can insert comments"
  on comments for insert with check (auth.role() = 'authenticated');
