/**
 * Public client config (anon key). Prefer VITE_* env in .env.local for rotation.
 * Default fallbacks target the greenfield v3 Supabase project (iwzqzpzskawxrwhttufq).
 */
const FALLBACK_SUPABASE_URL = "https://iwzqzpzskawxrwhttufq.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3enF6cHpza2F3eHJ3aHR0dWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjcwMTIsImV4cCI6MjA5NDIwMzAxMn0.vtsmUKLuUXSMsipPH4KHcE7NhOGIV8BIPjHVkDhsOME";
const FALLBACK_FETCH_ALL_DATA_URL =
  "https://iwzqzpzskawxrwhttufq.functions.supabase.co/fetch-all-data";

export const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL || FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
    import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_ANON_KEY;
/** Full URL to the fetch-all-data edge function */
export const FETCH_ALL_DATA_URL =
    import.meta.env.VITE_FETCH_ALL_DATA_URL ||
    (SUPABASE_URL.includes('localhost')
        ? `${SUPABASE_URL.replace(':54321', ':54321/functions/v1')}/fetch-all-data`
        : SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co') + '/fetch-all-data'
    );
