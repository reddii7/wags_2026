import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fpulgnhtngvqdikbdkgv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { SUPABASE_URL };
