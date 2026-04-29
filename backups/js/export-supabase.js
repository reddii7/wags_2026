
import { createClient } from '@supabase/supabase-js';
import { Parser } from 'json2csv';
import fs from 'fs';

const DEFAULT_URL = 'https://fpulgnhtngvqdikbdkgv.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwdWxnbmh0bmd2cWRpa2Jka2d2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIyMzcwNTAsImV4cCI6MjA2NzgxMzA1MH0.0e8Cs9bDKTdI9RLa8o3UNBh_ARGh6AlYO9dm16TYPdw';

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || DEFAULT_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const tables = [
  'announcements',
  'archives',
  'competitions',
  'financial_transactions',
  'handicap_history',
  'matchplay_matches',
  'matchplay_tournaments',
  'profiles',
  'rounds',
  'season_league_memberships',
  'seasons',
  'winter_competitions',
  'winter_players',
  'winter_scores'
];

async function exportTable(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    console.error(`Error exporting ${table}:`, error.message);
    return;
  }
  if (!data || data.length === 0) {
    console.log(`No data found for ${table}.`);
    return;
  }
  const parser = new Parser();
  const csv = parser.parse(data);
  fs.writeFileSync(`${table}.csv`, csv);
  console.log(`Exported ${table} (${data.length} rows)`);
}

(async () => {
  for (const table of tables) {
    await exportTable(table);
  }
  console.log('All tables exported.');
})();
