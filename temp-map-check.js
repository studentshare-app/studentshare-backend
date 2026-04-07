import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mxfrrikniesknhjgprpu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZnJyaWtuaWVza25oamdwcnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDE5NDUsImV4cCI6MjA4NjkxNzk0NX0.37jrQ0OzFBoNoVns3hMGIclwX3lOT1RxsRRWuZDd9ig';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('materials').select('type');
  
  if (error) {
    console.error('Error fetching materials:', error);
    return;
  }
  
  const typeCounts = {};
  data.forEach(m => {
    const t = m.type || 'EMPTY/NULL';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  });
  
  console.log('Current material categories found in DB:');
  console.table(typeCounts);
}

run();
