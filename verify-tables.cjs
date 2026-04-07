const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mxfrrikniesknhjgprpu.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14ZnJyaWtuaWVza25oamdwcnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzNDE5NDUsImV4cCI6MjA4NjkxNzk0NX0.37jrQ0OzFBoNoVns3hMGIclwX3lOT1RxsRRWuZDd9ig';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: ctData, error: ctError } = await supabase.from('ct_posts').select('id').limit(1);
  const { data: forumData, error: forumError } = await supabase.from('forum_posts').select('id').limit(1);
  
  console.log('ct_posts:', { data: ctData?.length, error: ctError?.message || ctError?.code });
  console.log('forum_posts:', { data: forumData?.length, error: forumError?.message || forumError?.code });
}

run();
