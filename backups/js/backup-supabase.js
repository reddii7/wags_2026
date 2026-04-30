import { createClient } from '@supabase/supabase-js';
import { Parser } from 'json2csv';
import fs from 'fs';
import path from 'path';

// Set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file or environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Create timestamped backup directory
const backupDir = `backups/${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

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
  console.log(`Exporting ${table}...`);
  const { data, error } = await supabase.from(table).select('*');

  if (error) {
    console.error(`Error exporting ${table}:`, error.message);
    return null;
  }

  if (!data || data.length === 0) {
    console.log(`No data found for ${table}.`);
    return null;
  }

  // Export as CSV
  const parser = new Parser();
  const csv = parser.parse(data);
  const csvPath = path.join(backupDir, `${table}.csv`);
  fs.writeFileSync(csvPath, csv);

  // Export as JSON for full fidelity
  const jsonPath = path.join(backupDir, `${table}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

  console.log(`Exported ${table} (${data.length} rows) to ${backupDir}`);
  return { table, rows: data.length, csvPath, jsonPath };
}

async function createBackupManifest(backupResults) {
  const manifest = {
    timestamp: new Date().toISOString(),
    backupDir,
    tables: backupResults.filter(r => r !== null),
    totalTables: backupResults.filter(r => r !== null).length,
    totalRows: backupResults.reduce((sum, r) => sum + (r?.rows || 0), 0),
    supabaseUrl: SUPABASE_URL,
    version: '1.0'
  };

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Backup manifest created: ${manifestPath}`);
  return manifest;
}

async function runBackup() {
  console.log(`Starting backup to: ${backupDir}`);
  console.log('='.repeat(50));

  const backupResults = [];

  for (const table of tables) {
    const result = await exportTable(table);
    backupResults.push(result);
  }

  const manifest = await createBackupManifest(backupResults);

  console.log('='.repeat(50));
  console.log(`Backup completed successfully!`);
  console.log(`Location: ${backupDir}`);
  console.log(`Tables: ${manifest.totalTables}`);
  console.log(`Total Rows: ${manifest.totalRows}`);
  console.log(`Manifest: ${path.join(backupDir, 'manifest.json')}`);

  return manifest;
}

// Run backup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup().catch(console.error);
}

export { runBackup };
