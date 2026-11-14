import { createClient } from "@supabase/supabase-js";

/**
 * A single row from `public.posts`.
 */
export interface Post {
  id: string;
  author_name: string;
  message: string;
  image_url: string | null;
  created_at: string;
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * `false` when the environment variables are missing. The UI uses this to show
 * a helpful offline state instead of throwing during render or on submit.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = createClient(
  SUPABASE_URL || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-anon-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
);
