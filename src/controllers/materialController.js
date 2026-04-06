import supabase from '../utils/supabaseClient.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// ── GET /materials ─────────────────────────────────────────────────────────────
// Paginated list filtered by course or class
export async function getMaterials(req, res) {
  const { course_id, class_id, page = 1, limit = 20, type } = req.query;

  if (!course_id) {
    return res.status(400).json({ error: 'course_id is required' });
  }

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
  const from = (pageNum - 1) * limitNum;

  try {
    let query = supabase
      .from('materials')
      .select(`
        id, title, description, file_url, file_type, file_size,
        course_id, class_id, uploaded_by,
        created_at,
        profiles:uploaded_by ( id, full_name, avatar_url )
      `, { count: 'exact' })
      .eq('course_id', course_id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(from, from + limitNum - 1);

    if (class_id) query = query.eq('class_id', class_id);
    if (type) query = query.eq('file_type', type);

    const { data, error, count } = await query;

    if (error) {
      console.error('[getMaterials] DB error:', error);
      return res.status(500).json({ error: 'Failed to fetch materials' });
    }

    return res.json({
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (err) {
    console.error('[getMaterials] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── GET /materials/:id ─────────────────────────────────────────────────────────
export async function getMaterialById(req, res) {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('materials')
      .select(`
        id, title, description, file_url, file_type, file_size,
        course_id, class_id, uploaded_by, created_at,
        profiles:uploaded_by ( id, full_name, avatar_url )
      `)
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Material not found' });
    }

    return res.json(data);
  } catch (err) {
    console.error('[getMaterialById] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── POST /materials ────────────────────────────────────────────────────────────
// Metadata only — client uploads file directly to Supabase Storage,
// then calls this endpoint with the resulting file_url
export async function createMaterial(req, res) {
  const { title, description, file_url, file_type, file_size, course_id, class_id } = req.body;

  // Validate required fields
  if (!title?.trim()) return res.status(400).json({ error: 'title is required' });
  if (!file_url?.trim()) return res.status(400).json({ error: 'file_url is required' });
  if (!file_type?.trim()) return res.status(400).json({ error: 'file_type is required' });
  if (!course_id) return res.status(400).json({ error: 'course_id is required' });

  if (title.trim().length > 200) return res.status(400).json({ error: 'title too long (max 200)' });
  if (description && description.length > 1000) return res.status(400).json({ error: 'description too long (max 1000)' });
  if (file_size && file_size > MAX_FILE_SIZE) return res.status(400).json({ error: 'File exceeds 50MB limit' });
  if (!ALLOWED_TYPES.includes(file_type)) return res.status(400).json({ error: `File type not allowed. Allowed: ${ALLOWED_TYPES.join(', ')}` });

  try {
    const { data, error } = await supabase
      .from('materials')
      .insert({
        title: title.trim(),
        description: description?.trim() ?? null,
        file_url,
        file_type,
        file_size: file_size ?? null,
        course_id,
        class_id: class_id ?? null,
        uploaded_by: req.user.id,
        is_deleted: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[createMaterial] DB insert error:', error);
      return res.status(500).json({ error: 'Failed to save material' });
    }

    // Fire push notification async — don't block the response
    triggerMaterialPush({
      material_id: data.id,
      title: data.title,
      course_id: data.course_id,
      class_id: data.class_id,
      uploaded_by: req.user.id,
    }).catch(err => console.error('[createMaterial] Push notification failed:', err));

    return res.status(201).json(data);
  } catch (err) {
    console.error('[createMaterial] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── DELETE /materials/:id ──────────────────────────────────────────────────────
// Soft delete — only the uploader can delete their own material
export async function deleteMaterial(req, res) {
  const { id } = req.params;

  try {
    // Verify ownership first
    const { data: existing, error: fetchError } = await supabase
      .from('materials')
      .select('id, uploaded_by')
      .eq('id', id)
      .eq('is_deleted', false)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Material not found' });
    }

    if (existing.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this material' });
    }

    const { error } = await supabase
      .from('materials')
      .update({ is_deleted: true })
      .eq('id', id);

    if (error) {
      console.error('[deleteMaterial] DB error:', error);
      return res.status(500).json({ error: 'Failed to delete material' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('[deleteMaterial] Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Helper: fire push notification via Supabase Edge Function ─────────────────
async function triggerMaterialPush({ material_id, title, course_id, class_id, uploaded_by }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/send-material-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ material_id, title, course_id, class_id, uploaded_by }),
  });

  if (!res.ok) {
    throw new Error(`Push function returned ${res.status}: ${await res.text()}`);
  }
}