/**
 * Public client config (anon key). Prefer VITE_* env in .env for rotation.
 * Falls back to project defaults so the app runs without a local .env file.
 */
const DEFAULT_PROJECT_REF = "fpulgnhtngvqdikbdkgv";
const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw";

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  `https://${DEFAULT_PROJECT_REF}.supabase.co`;

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON_KEY;

/** Full URL to the fetch-all-data edge function */
export const FETCH_ALL_DATA_URL =
  import.meta.env.VITE_FETCH_ALL_DATA_URL ||
  `https://${DEFAULT_PROJECT_REF}.functions.supabase.co/fetch-all-data`;
