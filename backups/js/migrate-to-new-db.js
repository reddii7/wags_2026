import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration for NEW Supabase project
const NEW_SUPABASE_URL = process.env.NEW_SUPABASE_URL;
const NEW_SUPABASE_KEY = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;

if (!NEW_SUPABASE_URL || !NEW_SUPABASE_KEY) {
  console.error('❌ Missing new Supabase configuration');
  console.log('Set environment variables:');
  console.log('  NEW_SUPABASE_URL=your-new-project.supabase.co');
  console.log('  NEW_SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key');
  process.exit(1);
}

const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_KEY);

// Tables to migrate (in dependency order)
const tables = [
  'seasons',
  'profiles', 
  'competitions',
  'rounds',
  'handicap_history',
  'financial_transactions',
  'season_league_memberships',
  'winter_competitions',
  'winter_players',
  'winter_scores',
  'matchplay_tournaments',
  'announcements',
  'archives'
];

async function checkNewDatabase() {
  console.log('🔍 Checking new database connection...');
  
  try {
    const { data, error } = await newSupabase.from('profiles').select('count').single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist
      console.error('❌ Cannot connect to new database:', error.message);
      return false;
    }
    
    console.log('✅ New database connection successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function migrateTable(tableName, backupDir) {
  console.log(`📦 Migrating ${tableName}...`);
  
  const jsonPath = path.join(backupDir, `${tableName}.json`);
  
  if (!fs.existsSync(jsonPath)) {
    console.log(`⚠️  No backup found for ${tableName}, skipping...`);
    return null;
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    if (!data || data.length === 0) {
      console.log(`ℹ️  No data to migrate for ${tableName}`);
      return { table: tableName, rows: 0 };
    }
    
    // Insert data in batches to avoid rate limits
    const batchSize = 100;
    let totalInserted = 0;
    
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      const { error } = await newSupabase.from(tableName).insert(batch);
      
      if (error) {
        console.error(`❌ Error inserting batch for ${tableName}:`, error.message);
        return null;
      }
      
      totalInserted += batch.length;
      console.log(`  ✅ Inserted ${totalInserted}/${data.length} rows`);
    }
    
    console.log(`✅ Successfully migrated ${tableName} (${totalInserted} rows)`);
    return { table: tableName, rows: totalInserted };
    
  } catch (error) {
    console.error(`❌ Error migrating ${tableName}:`, error.message);
    return null;
  }
}

async function runMigration(backupDir) {
  console.log(`🚀 Starting migration to new database`);
  console.log(`📂 Backup source: ${backupDir}`);
  console.log(`🎯 Target: ${NEW_SUPABASE_URL}`);
  console.log('='.repeat(60));
  
  // Check new database connection
  const connected = await checkNewDatabase();
  if (!connected) {
    return;
  }
  
  console.log('\n📋 Migration Plan:');
  console.log('1. Create table structures manually in Supabase dashboard');
  console.log('2. Migrate data in dependency order');
  console.log('3. Verify migration');
  console.log('');
  
  const confirmation = process.env.CONFIRM_MIGRATION;
  if (confirmation !== 'YES_I_UNDERSTAND_THIS_IS_IRREVERSIBLE') {
    console.log('❌ Migration cancelled for safety.');
    console.log('To proceed, set environment variable: CONFIRM_MIGRATION=YES_I_UNDERSTAND_THIS_IS_IRREVERSIBLE');
    return;
  }
  
  console.log('\n📦 Starting data migration...\n');
  
  const migrationResults = [];
  
  for (const table of tables) {
    const result = await migrateTable(table, backupDir);
    migrationResults.push(result);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Migration completed!');
  console.log(`Tables migrated: ${migrationResults.filter(r => r !== null).length}`);
  console.log(`Total rows migrated: ${migrationResults.reduce((sum, r) => sum + (r?.rows || 0), 0)}`);
  console.log('='.repeat(60));
  
  console.log('\n📝 Next steps:');
  console.log('1. Update your app configuration to use the new database');
  console.log('2. Test all admin features');
  console.log('3. Update edge functions if needed');
  console.log('4. Consider keeping the old database as backup');
  
  return migrationResults;
}

// Command line interface
const backupDir = process.argv[2];

if (!backupDir) {
  console.log('Usage: node migrate-to-new-db.js <backup-directory>');
  console.log('');
  console.log('Example: node migrate-to-new-db.js backups/2026-04-27T18-33-10');
  console.log('');
  console.log('Required environment variables:');
  console.log('  NEW_SUPABASE_URL=your-new-project.supabase.co');
  console.log('  NEW_SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key');
  console.log('  CONFIRM_MIGRATION=YES_I_UNDERSTAND_THIS_IS_IRREVERSIBLE');
  process.exit(1);
}

runMigration(backupDir).catch(console.error);

export { runMigration };
