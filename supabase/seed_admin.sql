-- 관리자 1명을 서울시 담당자로 연결합니다.
-- 방법 A: 이메일로 연결 (계정 이메일을 실제 값으로 교체)
insert into admin_profiles (id, region_id, role)
select u.id, r.id, 'region_admin'
from auth.users u, regions r
where u.email = 'seoul-admin@example.com' -- 실제 이메일로 교체
  and r.slug = 'seoul';

-- 방법 B: 이미 알고 있는 UUID로 직접 연결
insert into admin_profiles (id, region_id, role)
select '1da4f5a8-dc7e-4942-8c1e-4eb77f7414e7'::uuid, r.id, 'region_admin'
from regions r
where r.slug = 'seoul';
