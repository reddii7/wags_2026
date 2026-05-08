/**
 * Public client config (anon key). Prefer VITE_* env in .env for rotation.
 * Falls back to project defaults so the app runs without a local .env file.
 */
const FALLBACK_SUPABASE_URL = "https://fpulgnhtngvqdikbdkgv.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw";
const FALLBACK_FETCH_ALL_DATA_URL =
    "https://fpulgnhtngvqdikbdkgv.functions.supabase.co/fetch-all-data";

export const SUPABASE_URL =
    FALLBACK_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
    FALLBACK_SUPABASE_ANON_KEY;
/** Full URL to the fetch-all-data edge function */
export const FETCH_ALL_DATA_URL =
    FALLBACK_FETCH_ALL_DATA_URL;
