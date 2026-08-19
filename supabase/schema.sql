-- 조선의 시간 — 관리자/유저 페이지 초기 스키마
-- Supabase SQL Editor에서 실행하세요. PostGIS 확장이 먼저 켜져 있어야 합니다.

-- 1) 지역 (행정구역 폴리곤)
create table regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,                       -- '서울특별시', '강원 영월군'
  slug text unique not null,                -- 'seoul', 'yeongwol'
  boundary geometry(MultiPolygon, 4326),    -- 행정구역 경계 (공공데이터포털 GeoJSON 임포트)
  created_at timestamptz default now()
);

-- 1차 시작 지역 2곳
insert into regions (name, slug) values
  ('서울특별시', 'seoul'),
  ('강원 영월군', 'yeongwol');

-- 2) 관리자 프로필 — region_id로 권한 범위를 제한
create table admin_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  region_id uuid references regions(id),    -- null이면 super_admin(전체 관리)
  role text not null default 'region_admin', -- 'region_admin' | 'super_admin'
  created_at timestamptz default now()
);

-- 3) 등록 콘텐츠 (3D 자산 / 유물)
create table assets (
  id uuid primary key default gen_random_uuid(),
  region_id uuid references regions(id) not null,
  title text not null,
  description text,
  category text,                             -- '3d_model' | 'artifact' | 'painting' 등
  location geometry(Point, 4326) not null,   -- 위경도 좌표
  model_url text,                            -- NAS/스토리지 3D 모델 or 이미지 URL
  thumbnail_url text,
  status text not null default 'draft',      -- 'draft' | 'in_review' | 'published'
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- Row Level Security ----------
alter table regions enable row level security;
alter table admin_profiles enable row level security;
alter table assets enable row level security;

-- 지역 정보는 누구나 읽기 가능 (유저 페이지 기본 레이어)
create policy "regions are publicly readable"
  on regions for select using (true);

-- 공개(published) 자산은 누구나 읽기 가능 (유저 페이지)
create policy "published assets are publicly readable"
  on assets for select using (status = 'published');

-- 관리자는 자기 프로필만 조회 가능
create policy "admins can read own profile"
  on admin_profiles for select using (auth.uid() = id);

-- 관리자는 자기 지역 자산만 등록/수정/삭제 가능 (super_admin은 전체)
create policy "region admins manage own region assets"
  on assets for all
  using (
    exists (
      select 1 from admin_profiles p
      where p.id = auth.uid()
        and (p.role = 'super_admin' or p.region_id = assets.region_id)
    )
  )
  with check (
    exists (
      select 1 from admin_profiles p
      where p.id = auth.uid()
        and (p.role = 'super_admin' or p.region_id = assets.region_id)
    )
  );
