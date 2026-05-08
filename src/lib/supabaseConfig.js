/**
 * Public client config (anon key). Prefer VITE_* env in .env for rotation.
 * Falls back to project defaults so the app runs without a local .env file.
 */
const FALLBACK_SUPABASE_URL = "https://babuygaqjazdolpzivhe.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhYnV5Z2FxamF6ZG9scHppdmhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxNDYxMzUsImV4cCI6MjA5MzcyMjEzNX0._qqwN5jwiiOcQ6SU4QxdlnC7yzgTpWl4345JrzQEA3w";
const FALLBACK_FETCH_ALL_DATA_URL =
    "https://babuygaqjazdolpzivhe.functions.supabase.co/fetch-all-data";

export const SUPABASE_URL =
    FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
    FALLBACK_SUPABASE_ANON_KEY;
/** Full URL to the fetch-all-data edge function */
export const FETCH_ALL_DATA_URL =
    FALLBACK_FETCH_ALL_DATA_URL;
