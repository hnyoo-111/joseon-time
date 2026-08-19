-- MVP 단순화: geometry(Point) 대신 lon/lat 컬럼을 직접 사용합니다.
-- (PostgREST를 통한 PostGIS geometry insert/select는 WKB/GeoJSON 캐스팅이 번거로워
--  1인 관리자 MVP 단계에서는 생략하고, 나중에 공간 쿼리가 실제로 필요할 때 추가합니다.)

alter table assets add column if not exists lon double precision;
alter table assets add column if not exists lat double precision;
alter table assets alter column location drop not null;
