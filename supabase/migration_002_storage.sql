-- assets 버킷 업로드/조회 정책
-- 파일 경로 규칙: {region-slug}/{asset-id}/{filename} (예: seoul/abc123/model.glb)
-- (재실행해도 안전하도록 drop if exists 후 재생성합니다.)

drop policy if exists "public can view asset files" on storage.objects;
drop policy if exists "region admins upload to own region folder" on storage.objects;
drop policy if exists "region admins delete own region files" on storage.objects;

-- 공개 버킷이므로 조회는 누구나 가능
create policy "public can view asset files"
  on storage.objects for select
  using (bucket_id = 'assets');

-- 로그인한 관리자는 자기 지역 폴더 하위에만 업로드 가능
create policy "region admins upload to own region folder"
  on storage.objects for insert
  with check (
    bucket_id = 'assets'
    and exists (
      select 1 from admin_profiles p
      join regions r on r.id = p.region_id
      where p.id = auth.uid()
        and (p.role = 'super_admin' or (storage.foldername(name))[1] = r.slug)
    )
  );

-- 같은 규칙으로 삭제도 허용
create policy "region admins delete own region files"
  on storage.objects for delete
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from admin_profiles p
      join regions r on r.id = p.region_id
      where p.id = auth.uid()
        and (p.role = 'super_admin' or (storage.foldername(name))[1] = r.slug)
    )
  );

-- 진단용: 지금 storage.objects 에 걸려있는 정책 전체를 확인
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects';
