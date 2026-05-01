
import { createClient } from '@supabase/supabase-js';
import { Parser } from 'json2csv';
import fs from 'fs';

// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

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
