// Quick diagnostic script for contribute upload issues
// Run this in Node.js to check your Supabase setup

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Load environment variables from .env file
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  });
  Object.assign(process.env, envVars);
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function diagnose() {
  console.log('🔍 Diagnosing Contribute Upload Issues...\n');

  // 1. Check materials table
  console.log('1. Checking materials table...');
  try {
    const { data, error } = await supabase.from('materials').select('*').limit(1);
    if (error) {
      console.log('❌ Materials table error:', error.message);
      if (error.message.includes('does not exist')) {
        console.log('💡 SOLUTION: Run the contribute schema migration');
      }
    } else {
      console.log('✅ Materials table exists');
      if (data && data[0]) {
        const columns = Object.keys(data[0]);
        console.log('   Columns:', columns.join(', '));

        const requiredColumns = ['profile_id', 'title', 'description', 'type', 'file_url', 'course_id', 'status', 'is_public'];
        const missingColumns = requiredColumns.filter(col => !columns.includes(col));
        if (missingColumns.length > 0) {
          console.log('❌ Missing columns:', missingColumns.join(', '));
          console.log('💡 SOLUTION: Run the migration to add missing columns');
        } else {
          console.log('✅ All required columns present');
        }
      }
    }
  } catch (err) {
    console.log('❌ Error checking materials table:', err.message);
  }

  // 2. Check storage bucket
  console.log('\n2. Checking storage bucket...');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      console.log('❌ Storage error:', error.message);
    } else {
      const materialsBucket = buckets.find(b => b.name === 'materials');
      if (!materialsBucket) {
        console.log('❌ Materials storage bucket does not exist');
        console.log('💡 SOLUTION: Create a storage bucket named "materials" in Supabase Dashboard > Storage');
      } else {
        console.log('✅ Materials storage bucket exists');
        console.log('   Public:', materialsBucket.public ? 'Yes' : 'No (should be public)');
      }
    }
  } catch (err) {
    console.log('❌ Error checking storage:', err.message);
  }

  // 3. Check colleges/classes/courses tables
  console.log('\n3. Checking reference tables...');
  const tables = ['colleges', 'classes', 'courses'];
  for (const table of tables) {
    try {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`❌ ${table} table error:`, error.message);
      } else {
        console.log(`✅ ${table} table exists (${count} records)`);
      }
    } catch (err) {
      console.log(`❌ Error checking ${table}:`, err.message);
    }
  }

  // 4. Check profiles table
  console.log('\n4. Checking profiles table...');
  try {
    const { data, error } = await supabase.from('profiles').select('id, full_name').limit(1);
    if (error) {
      console.log('❌ Profiles table error:', error.message);
    } else {
      console.log('✅ Profiles table exists');
    }
  } catch (err) {
    console.log('❌ Error checking profiles:', err.message);
  }

  console.log('\n📋 SUMMARY:');
  console.log('If you see any ❌ errors above, fix them before trying to upload.');
  console.log('Most common issues:');
  console.log('1. Missing database migration (run the SQL I provided)');
  console.log('2. Missing storage bucket (create "materials" bucket in Supabase)');
  console.log('3. Missing table columns (run the column addition migration)');
}

diagnose().catch(console.error);