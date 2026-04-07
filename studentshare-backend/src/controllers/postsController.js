// postsController.js — used by src/routes/posts.js
// Mirrors postController.js functionality
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * GET /posts
 */
export async function getPosts(req, res) {
  try {
    const { college_id, class_id, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('posts')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (college_id) query = query.eq('college_id', college_id);
    if (class_id) query = query.eq('class_id', class_id);

    const { data, error } = await query;

    if (error) throw error;

    return res.status(200).json({ data });
  } catch (err) {
    console.error('[PostsController] getPosts error:', err);
    return res.status(500).json({ error: 'Failed to fetch posts' });
  }
}

/**
 * POST /posts
 */
export async function createPost(req, res) {
  try {
    const userId = req.user?.id;
    const { title, content, college_id, class_id, type } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        title,
        content,
        college_id,
        class_id,
        type: type || 'general',
        deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({ data });
  } catch (err) {
    console.error('[PostsController] createPost error:', err);
    return res.status(500).json({ error: 'Failed to create post' });
  }
}