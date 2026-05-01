import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function restoreTable(table, backupDir) {
  console.log(`Restoring ${table}...`);

  const jsonPath = path.join(backupDir, `${table}.json`);

  if (!fs.existsSync(jsonPath)) {
    console.log(`No backup found for ${table}, skipping...`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

    if (!data || data.length === 0) {
      console.log(`No data to restore for ${table}`);
      return null;
    }

    // Clear existing data (be careful with this!)
    console.log(`Clearing existing data from ${table}...`);
    const { error: deleteError } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');

    if (deleteError) {
      console.error(`Error clearing ${table}:`, deleteError.message);
      return null;
    }

    // Insert backup data
    console.log(`Inserting ${data.length} rows into ${table}...`);
    const { error: insertError } = await supabase.from(table).insert(data);

    if (insertError) {
      console.error(`Error inserting into ${table}:`, insertError.message);
      return null;
    }

    console.log(`Successfully restored ${table} (${data.length} rows)`);
    return { table, rows: data.length };

  } catch (error) {
    console.error(`Error processing ${table}:`, error.message);
    return null;
  }
}

async function readBackupManifest(backupDir) {
  const manifestPath = path.join(backupDir, 'manifest.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`No manifest found in ${backupDir}`);
    return null;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    console.log(`Found backup from: ${manifest.timestamp}`);
    console.log(`Tables: ${manifest.totalTables}, Total Rows: ${manifest.totalRows}`);
    return manifest;
  } catch (error) {
    console.error('Error reading manifest:', error.message);
    return null;
  }
}

async function confirmRestore(backupDir, manifest) {
  console.log('\n' + '='.repeat(60));
  console.log('⚠️  WARNING: THIS WILL REPLACE ALL CURRENT DATA ⚠️');
  console.log('='.repeat(60));
  console.log(`Backup: ${manifest.timestamp}`);
  console.log(`Tables to restore: ${manifest.tables.map(t => t.table).join(', ')}`);
  console.log(`Total rows: ${manifest.totalRows}`);
  console.log('='.repeat(60));

  // In a real script, you'd want user confirmation
  // For now, we'll require environment variable confirmation
  const confirm = process.env.CONFIRM_RESTORE;

  if (confirm !== 'YES_I_UNDERSTAND_THE_RISKS') {
    console.log('\n❌ Restore cancelled for safety.');
    console.log('To proceed, set environment variable: CONFIRM_RESTORE=YES_I_UNDERSTAND_THE_RISKS');
    return false;
  }

  return true;
}

async function runRestore(backupDir) {
  console.log(`Starting restore from: ${backupDir}`);

  const manifest = await readBackupManifest(backupDir);
  if (!manifest) {
    console.error('Invalid backup directory');
    return;
  }

  const confirmed = await confirmRestore(backupDir, manifest);
  if (!confirmed) {
    return;
  }

  console.log('\n🔄 Starting restore process...');

  const restoreResults = [];

  for (const tableInfo of manifest.tables) {
    const result = await restoreTable(tableInfo.table, backupDir);
    restoreResults.push(result);
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Restore completed!');
  console.log(`Tables restored: ${restoreResults.filter(r => r !== null).length}`);
  console.log(`Total rows restored: ${restoreResults.reduce((sum, r) => sum + (r?.rows || 0), 0)}`);
  console.log('='.repeat(50));

  return restoreResults;
}

// List available backups
async function listBackups() {
  const backupsDir = 'backups';

  if (!fs.existsSync(backupsDir)) {
    console.log('No backups directory found');
    return;
  }

  const backups = fs.readdirSync(backupsDir)
    .filter(dir => {
      const dirPath = path.join(backupsDir, dir);
      return fs.statSync(dirPath).isDirectory();
    })
    .sort()
    .reverse();

  if (backups.length === 0) {
    console.log('No backups found');
    return;
  }

  console.log('\nAvailable backups:');
  console.log('-'.repeat(60));

  for (const backup of backups) {
    const manifestPath = path.join(backupsDir, backup, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        console.log(`📁 ${backup}`);
        console.log(`   📅 ${new Date(manifest.timestamp).toLocaleString()}`);
        console.log(`   📊 ${manifest.totalTables} tables, ${manifest.totalRows} rows`);
        console.log('');
      } catch (error) {
        console.log(`📁 ${backup} (invalid manifest)`);
      }
    }
  }
}

// Command line interface
const command = process.argv[2];

if (command === 'list') {
  listBackups();
} else if (command === 'restore' && process.argv[3]) {
  runRestore(process.argv[3]).catch(console.error);
} else {
  console.log('Usage:');
  console.log('  node restore-supabase.js list                    # List available backups');
  console.log('  node restore-supabase.js restore <backup-dir>   # Restore from backup');
  console.log('');
  console.log('⚠️  Restore requires CONFIRM_RESTORE=YES_I_UNDERSTAND_THE_RISKS');
}

export { runRestore, listBackups };
