import supabase from '../utils/supabaseClient.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI_TIMEOUT_MS = 30_000; // 30s max per AI call

// ── Helper: call Supabase ai-proxy Edge Function ───────────────────────────────
async function callAiProxy(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI proxy error ${res.status}: ${text}`);
    }

    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// ── POST /ai/quiz ──────────────────────────────────────────────────────────────
// Generate quiz questions from a material or note
export async function generateQuiz(req, res) {
  const { material_id, note_id, num_questions = 5, difficulty = 'medium' } = req.body;

  if (!material_id && !note_id) {
    return res.status(400).json({ error: 'material_id or note_id is required' });
  }
  if (num_questions < 1 || num_questions > 20) {
    return res.status(400).json({ error: 'num_questions must be between 1 and 20' });
  }
  if (!['easy', 'medium', 'hard'].includes(difficulty)) {
    return res.status(400).json({ error: 'difficulty must be easy, medium, or hard' });
  }

  try {
    // Fetch source content
    const content = material_id
      ? await fetchMaterialContent(material_id, req.user.id)
      : await fetchNoteContent(note_id, req.user.id);

    if (!content) return res.status(404).json({ error: 'Source content not found' });

    const result = await callAiProxy({
      action: 'generate_quiz',
      content,
      num_questions,
      difficulty,
      user_id: req.user.id,
    });

    // Persist quiz to DB
    const { data, error } = await supabase
      .from('quizzes')
      .insert({
        user_id: req.user.id,
        material_id: material_id ?? null,
        note_id: note_id ?? null,
        questions: result.questions,
        difficulty,
      })
      .select()
      .single();

    if (error) {
      console.error('[generateQuiz] DB insert error:', error);
      // Still return the quiz even if save fails
      return res.json({ quiz: result.questions, saved: false });
    }

    return res.status(201).json({ quiz: data.questions, quiz_id: data.id, saved: true });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out, please try again' });
    }
    console.error('[generateQuiz] Error:', err);
    return res.status(500).json({ error: 'Failed to generate quiz' });
  }
}

// ── POST /ai/summarize ─────────────────────────────────────────────────────────
// Summarize a material or note
export async function summarize(req, res) {
  const { material_id, note_id, length = 'medium' } = req.body;

  if (!material_id && !note_id) {
    return res.status(400).json({ error: 'material_id or note_id is required' });
  }
  if (!['short', 'medium', 'long'].includes(length)) {
    return res.status(400).json({ error: 'length must be short, medium, or long' });
  }

  try {
    const content = material_id
      ? await fetchMaterialContent(material_id, req.user.id)
      : await fetchNoteContent(note_id, req.user.id);

    if (!content) return res.status(404).json({ error: 'Source content not found' });

    const result = await callAiProxy({
      action: 'summarize',
      content,
      length,
      user_id: req.user.id,
    });

    return res.json({ summary: result.summary });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out, please try again' });
    }
    console.error('[summarize] Error:', err);
    return res.status(500).json({ error: 'Failed to summarize content' });
  }
}

// ── POST /ai/chat ──────────────────────────────────────────────────────────────
// Conversational Q&A — stateless, client sends history each time
export async function chat(req, res) {
  const { messages, material_id, note_id } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: 'Too many messages in context (max 50)' });
  }

  // Validate message shape
  for (const msg of messages) {
    if (!['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string') {
      return res.status(400).json({ error: 'Invalid message format. Each message needs role and content.' });
    }
    if (msg.content.length > 4000) {
      return res.status(400).json({ error: 'Message content too long (max 4000 chars)' });
    }
  }

  try {
    // Optionally attach source context
    let context = null;
    if (material_id) context = await fetchMaterialContent(material_id, req.user.id);
    if (note_id) context = await fetchNoteContent(note_id, req.user.id);

    const result = await callAiProxy({
      action: 'chat',
      messages,
      context,
      user_id: req.user.id,
    });

    return res.json({ reply: result.reply });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out, please try again' });
    }
    console.error('[chat] Error:', err);
    return res.status(500).json({ error: 'Failed to get AI response' });
  }
}

// ── POST /ai/explain ──────────────────────────────────────────────────────────
// Explain a concept or piece of content
export async function explain(req, res) {
  const { text, material_id, note_id, level = 'normal' } = req.body;

  if (!text?.trim() && !material_id && !note_id) {
    return res.status(400).json({ error: 'text, material_id, or note_id is required' });
  }
  if (text && text.length > 5000) {
    return res.status(400).json({ error: 'text too long (max 5000 chars)' });
  }
  if (!['simple', 'normal', 'detailed'].includes(level)) {
    return res.status(400).json({ error: 'level must be simple, normal, or detailed' });
  }

  try {
    let content = text?.trim() ?? null;
    if (!content && material_id) content = await fetchMaterialContent(material_id, req.user.id);
    if (!content && note_id) content = await fetchNoteContent(note_id, req.user.id);
    if (!content) return res.status(404).json({ error: 'Content not found' });

    const result = await callAiProxy({
      action: 'explain',
      content,
      level,
      user_id: req.user.id,
    });

    return res.json({ explanation: result.explanation });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out, please try again' });
    }
    console.error('[explain] Error:', err);
    return res.status(500).json({ error: 'Failed to explain content' });
  }
}

// ── POST /ai/generate-notes ────────────────────────────────────────────────────
// Auto-generate a note from a material and save it to notes table
export async function generateNotes(req, res) {
  const { material_id, course_id, title } = req.body;

  if (!material_id) return res.status(400).json({ error: 'material_id is required' });

  try {
    const content = await fetchMaterialContent(material_id, req.user.id);
    if (!content) return res.status(404).json({ error: 'Material not found' });

    const result = await callAiProxy({
      action: 'generate_notes',
      content,
      user_id: req.user.id,
    });

    // Save to notes table with source = 'ai'
    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: req.user.id,
        title: title?.trim() || `Notes from material`,
        body: result.notes,
        source: 'ai',
        course_id: course_id ?? null,
        color: '#7B9FFF', // distinct color for AI-generated notes
      })
      .select()
      .single();

    if (error) {
      console.error('[generateNotes] DB insert error:', error);
      return res.json({ notes: result.notes, saved: false });
    }

    return res.status(201).json({ note: data, saved: true });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out, please try again' });
    }
    console.error('[generateNotes] Error:', err);
    return res.status(500).json({ error: 'Failed to generate notes' });
  }
}

// ── Private helpers ────────────────────────────────────────────────────────────
async function fetchMaterialContent(material_id, user_id) {
  const { data, error } = await supabase
    .from('materials')
    .select('title, description, file_url, file_type')
    .eq('id', material_id)
    .eq('is_deleted', false)
    .single();

  if (error || !data) return null;
  // Return a text representation — the ai-proxy Edge Function handles file fetching if needed
  return JSON.stringify(data);
}

async function fetchNoteContent(note_id, user_id) {
  const { data, error } = await supabase
    .from('notes')
    .select('title, body')
    .eq('id', note_id)
    .eq('user_id', user_id)
    .eq('is_deleted', false)
    .single();

  if (error || !data) return null;
  return `${data.title}\n\n${data.body}`;
}