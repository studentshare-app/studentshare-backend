import supabase from '../utils/supabaseClient.js';

export async function getPosts(req, res) {
  const { data, error } = await supabase.from('posts').select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

export async function createPost(req, res) {
  const { title, content } = req.body;
  const { data, error } = await supabase.from('posts').insert({
    title,
    content,
    author_id: req.user.id,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}
