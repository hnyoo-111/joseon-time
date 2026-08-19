-- migration_002의 버그 수정: 정책 안의 name이 storage.objects.name이 아니라
-- regions.name으로 잘못 해석되던 문제를 고칩니다. (컬럼명을 명시적으로 지정)

drop policy if exists "region admins upload to own region folder" on storage.objects;
drop policy if exists "region admins delete own region files" on storage.objects;

create policy "region admins upload to own region folder"
  on storage.objects for insert
  with check (
    bucket_id = 'assets'
    and exists (
      select 1 from admin_profiles p
      join regions r on r.id = p.region_id
      where p.id = auth.uid()
        and (p.role = 'super_admin' or (storage.foldername(objects.name))[1] = r.slug)
    )
  );

create policy "region admins delete own region files"
  on storage.objects for delete
  using (
    bucket_id = 'assets'
    and exists (
      select 1 from admin_profiles p
      join regions r on r.id = p.region_id
      where p.id = auth.uid()
        and (p.role = 'super_admin' or (storage.foldername(objects.name))[1] = r.slug)
    )
  );
