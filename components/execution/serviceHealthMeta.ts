export interface ServiceHealthMeta {
  service_id?: string | null;
  service_name?: string | null;
  service_version?: string | null;
  build_version?: string | null;
  image_tag?: string | null;
  git_tag?: string | null;
  git_commit?: string | null;
  built_at?: string | null;
  version?: string | null;
}
