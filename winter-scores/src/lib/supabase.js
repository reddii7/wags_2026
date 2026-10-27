import { createClient } from "@supabase/supabase-js";

const FALLBACK_SUPABASE_URL = "https://iwzqzpzskawxrwhttufq.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3enF6cHpza2F3eHJ3aHR0dWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjcwMTIsImV4cCI6MjA5NDIwMzAxMn0.vtsmUKLuUXSMsipPH4KHcE7NhOGIV8BIPjHVkDhsOME";

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "wags-winter-scores-auth",
  },
});
