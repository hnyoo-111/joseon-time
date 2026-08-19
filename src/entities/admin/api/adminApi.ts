import { supabase } from '@/shared/lib/supabaseClient';
import type { AdminProfile } from '../model/types';

interface AdminProfileRow {
  id: string;
  role: string;
  region_id: string;
  regions: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

export async function fetchAdminProfile(userId: string): Promise<AdminProfile | null> {
  const { data, error } = await supabase
    .from('admin_profiles')
    .select('id, role, region_id, regions(name, slug)')
    .eq('id', userId)
    .single<AdminProfileRow>();

  if (error || !data) return null;
  const region = Array.isArray(data.regions) ? data.regions[0] : data.regions;

  return {
    id: data.id,
    role: data.role,
    regionId: data.region_id,
    regionName: region?.name ?? '',
    regionSlug: region?.slug ?? '',
  };
}
