/**
 * Public client config (anon key). Prefer VITE_* env in .env for rotation.
 * Falls back to project defaults so the app runs without a local .env file.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
/** Full URL to the fetch-all-data edge function */
export const FETCH_ALL_DATA_URL = import.meta.env.VITE_FETCH_ALL_DATA_URL;
