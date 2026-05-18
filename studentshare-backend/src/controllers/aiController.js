import supabase from '../utils/supabaseClient.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AI_TIMEOUT_MS = 30_000;
const FREE_TUTORIAL_GENERATIONS = 5;
const MASTERY_UNLOCK_THRESHOLD = 70;

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

export async function chat(req, res) {
  const { messages, material_id, note_id } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  if (messages.length > 50) {
    return res.status(400).json({ error: 'Too many messages in context (max 50)' });
  }

  for (const msg of messages) {
    if (!['user', 'assistant'].includes(msg.role) || typeof msg.content !== 'string') {
      return res.status(400).json({ error: 'Invalid message format. Each message needs role and content.' });
    }
    if (msg.content.length > 4000) {
      return res.status(400).json({ error: 'Message content too long (max 4000 chars)' });
    }
  }

  try {
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

    const { data, error } = await supabase
      .from('notes')
      .insert({
        user_id: req.user.id,
        title: title?.trim() || 'Notes from material',
        body: result.notes,
        source: 'ai',
        course_id: course_id ?? null,
        color: '#7B9FFF',
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

export async function tutorial(req, res) {
  const { material_id } = req.body;
  if (!material_id) return res.status(400).json({ error: 'material_id is required' });

  try {
    const material = await fetchMaterialDetails(material_id);
    if (!material) return res.status(404).json({ error: 'Material not found' });

    const sourceHash = makeSourceHash(material);
    const userId = req.user.id;

    const existing = await getLatestTutorial(material_id);
    if (existing && existing.source_hash === sourceHash) {
      const reviewItems = await getReviewItems(userId, material_id);
      const masterySnapshot = await getMasterySnapshot(userId, material_id);
      const access = await getTutorialAccessState(userId, false);
      return res.json({
        tutorial: {
          blueprint: existing.blueprint,
          session_nodes: existing.session_nodes,
          review_items: reviewItems,
          mastery_snapshot: masterySnapshot,
        },
        access: { ...access, source: 'cached' },
      });
    }

    const accessCheck = await getTutorialAccessState(userId, true);
    if (accessCheck.is_premium_required) {
      return res.status(403).json({
        error: 'Premium required to generate new tutorial',
        tutorial: null,
        access: { ...accessCheck, source: 'blocked' },
      });
    }

    const generated = await generateTutorialPackage(material);
    await upsertTutorial(material, sourceHash, generated);
    await incrementTutorialUsage(userId);

    const reviewItems = await getReviewItems(userId, material_id);
    const masterySnapshot = await getMasterySnapshot(userId, material_id);
    const access = await getTutorialAccessState(userId, false);

    return res.status(201).json({
      tutorial: {
        blueprint: generated.blueprint,
        session_nodes: generated.session_nodes,
        review_items: reviewItems,
        mastery_snapshot: masterySnapshot,
      },
      access: { ...access, source: 'generated' },
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out, please try again' });
    }
    console.error('[tutorial] Error:', err);
    return res.status(500).json({ error: 'Failed to generate tutorial' });
  }
}

export async function tutorialSession(req, res) {
  const { material_id } = req.body;
  if (!material_id) return res.status(400).json({ error: 'material_id is required' });

  try {
    const stored = await getLatestTutorial(material_id);
    if (!stored) return res.status(404).json({ error: 'Tutorial not generated yet' });

    const mastery = await getMasterySnapshot(req.user.id, material_id);
    const sessionNodes = buildAdaptiveSession(stored.session_nodes ?? [], mastery);
    const reviewItems = await getReviewItems(req.user.id, material_id);

    return res.json({
      tutorial: {
        blueprint: stored.blueprint,
        session_nodes: sessionNodes,
        review_items: reviewItems,
        mastery_snapshot: mastery,
      },
    });
  } catch (err) {
    console.error('[tutorialSession] Error:', err);
    return res.status(500).json({ error: 'Failed to build tutorial session' });
  }
}

export async function tutorialNodeResult(req, res) {
  const { material_id, skill_id, node_id, outcome, confidence = null } = req.body;
  if (!material_id || !skill_id || !node_id || !outcome) {
    return res.status(400).json({ error: 'material_id, skill_id, node_id and outcome are required' });
  }
  if (!['correct', 'incorrect', 'unsure', 'skipped'].includes(outcome)) {
    return res.status(400).json({ error: 'Invalid outcome value' });
  }

  try {
    const userId = req.user.id;
    const deltaMap = { correct: 8, unsure: -2, incorrect: -6, skipped: -3 };
    const masteryRow = await getOrCreateMasteryRow(userId, material_id, skill_id);
    const nextMastery = clamp((masteryRow.mastery_score ?? 50) + deltaMap[outcome], 0, 100);
    const nextStreak = outcome === 'correct' ? (masteryRow.streak_count ?? 0) + 1 : 0;
    const nextAttempts = (masteryRow.attempts_count ?? 0) + 1;

    const { error: masteryError } = await supabase
      .from('user_skill_mastery')
      .update({
        mastery_score: nextMastery,
        streak_count: nextStreak,
        attempts_count: nextAttempts,
        last_outcome: outcome,
        last_confidence: confidence,
        updated_at: new Date().toISOString(),
      })
      .eq('id', masteryRow.id);
    if (masteryError) throw masteryError;

    const intervalDays = nextIntervalDays(nextMastery, outcome);
    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + intervalDays);

    const { data: existingReview } = await supabase
      .from('user_review_queue')
      .select('id, repetitions')
      .eq('user_id', userId)
      .eq('material_id', material_id)
      .eq('skill_id', skill_id)
      .limit(1)
      .maybeSingle();

    if (existingReview?.id) {
      const { error: reviewUpdateError } = await supabase
        .from('user_review_queue')
        .update({
          due_at: dueAt.toISOString(),
          interval_days: intervalDays,
          repetitions: (existingReview.repetitions ?? 0) + 1,
          last_node_id: node_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingReview.id);
      if (reviewUpdateError) throw reviewUpdateError;
    } else {
      const { error: reviewInsertError } = await supabase
        .from('user_review_queue')
        .insert({
          user_id: userId,
          material_id,
          skill_id,
          due_at: dueAt.toISOString(),
          interval_days: intervalDays,
          repetitions: 1,
          last_node_id: node_id,
        });
      if (reviewInsertError) throw reviewInsertError;
    }

    const { error: eventError } = await supabase
      .from('ai_tutorial_events')
      .insert({
        user_id: userId,
        material_id,
        skill_id,
        node_id,
        outcome,
        confidence,
      });
    if (eventError) {
      console.warn('[tutorialNodeResult] Could not write ai_tutorial_events:', eventError.message);
    }

    const masteryDelta = nextMastery - (masteryRow.mastery_score ?? 50);
    return res.json({
      ok: true,
      mastery: {
        skill_id,
        previous: masteryRow.mastery_score ?? 50,
        current: nextMastery,
        delta: masteryDelta,
        unlocked_next_lesson: nextMastery >= MASTERY_UNLOCK_THRESHOLD,
      },
      review: {
        due_at: dueAt.toISOString(),
        interval_days: intervalDays,
      },
      momentum: {
        xp_earned: outcome === 'correct' ? 20 : outcome === 'unsure' ? 6 : 2,
        streak_count: nextStreak,
      },
    });
  } catch (err) {
    console.error('[tutorialNodeResult] Error:', err);
    return res.status(500).json({ error: 'Failed to record node result' });
  }
}

async function fetchMaterialContent(material_id, user_id) {
  const { data, error } = await supabase
    .from('materials')
    .select('title, description, file_url, file_type, content_text')
    .eq('id', material_id)
    .eq('is_deleted', false)
    .single();

  if (error || !data) return null;
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

async function fetchMaterialDetails(material_id) {
  const { data, error } = await supabase
    .from('materials')
    .select('id, title, description, file_url, file_type, content_text, course_id, class_id')
    .eq('id', material_id)
    .eq('is_deleted', false)
    .single();
  if (error || !data) return null;
  return data;
}

function makeSourceHash(material) {
  const raw = [
    material.id ?? '',
    material.title ?? '',
    material.description ?? '',
    material.file_url ?? '',
    material.file_type ?? '',
    material.content_text ?? '',
  ].join('||');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `m_${Math.abs(hash)}`;
}

async function getLatestTutorial(materialId) {
  const { data } = await supabase
    .from('material_tutorials')
    .select('id, material_id, source_hash, blueprint, session_nodes, created_at')
    .eq('material_id', materialId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function upsertTutorial(material, sourceHash, generated) {
  const { data: existing } = await supabase
    .from('material_tutorials')
    .select('id')
    .eq('material_id', material.id)
    .eq('source_hash', sourceHash)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('material_tutorials')
      .update({
        blueprint: generated.blueprint,
        session_nodes: generated.session_nodes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return;
  }

  await supabase.from('material_tutorials').insert({
    material_id: material.id,
    course_id: material.course_id ?? null,
    class_id: material.class_id ?? null,
    source_hash: sourceHash,
    blueprint: generated.blueprint,
    session_nodes: generated.session_nodes,
    version: 2,
  });
}

async function getTutorialAccessState(userId, forGeneration) {
  const { data: usage } = await supabase
    .from('ai_tutorial_usage')
    .select('generations_used')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  const generationsUsed = usage?.generations_used ?? 0;
  const remaining = Math.max(FREE_TUTORIAL_GENERATIONS - generationsUsed, 0);

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_premium')
    .eq('id', userId)
    .limit(1)
    .maybeSingle();
  const isPremium = !!profile?.is_premium;

  const isPremiumRequired = forGeneration && !isPremium && generationsUsed >= FREE_TUTORIAL_GENERATIONS;
  return {
    remaining_free_generations: remaining,
    generations_used: generationsUsed,
    is_premium_required: isPremiumRequired,
    is_premium: isPremium,
  };
}

async function incrementTutorialUsage(userId) {
  const { data: usage } = await supabase
    .from('ai_tutorial_usage')
    .select('id, generations_used')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (!usage?.id) {
    await supabase.from('ai_tutorial_usage').insert({
      user_id: userId,
      generations_used: 1,
    });
    return;
  }

  await supabase
    .from('ai_tutorial_usage')
    .update({
      generations_used: (usage.generations_used ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', usage.id);
}

async function getOrCreateMasteryRow(userId, materialId, skillId) {
  const { data: existing } = await supabase
    .from('user_skill_mastery')
    .select('id, mastery_score, streak_count, attempts_count')
    .eq('user_id', userId)
    .eq('material_id', materialId)
    .eq('skill_id', skillId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing;

  const { data: created, error } = await supabase
    .from('user_skill_mastery')
    .insert({
      user_id: userId,
      material_id: materialId,
      skill_id: skillId,
      mastery_score: 50,
      streak_count: 0,
      attempts_count: 0,
    })
    .select('id, mastery_score, streak_count, attempts_count')
    .single();

  if (error) throw error;
  return created;
}

async function getMasterySnapshot(userId, materialId) {
  const { data } = await supabase
    .from('user_skill_mastery')
    .select('skill_id, mastery_score, streak_count, attempts_count, updated_at')
    .eq('user_id', userId)
    .eq('material_id', materialId)
    .order('updated_at', { ascending: false });
  return data ?? [];
}

async function getReviewItems(userId, materialId) {
  const { data } = await supabase
    .from('user_review_queue')
    .select('skill_id, due_at, interval_days, repetitions, last_node_id')
    .eq('user_id', userId)
    .eq('material_id', materialId)
    .order('due_at', { ascending: true })
    .limit(25);
  return data ?? [];
}

function nextIntervalDays(mastery, outcome) {
  if (outcome === 'incorrect') return 1;
  if (outcome === 'unsure') return mastery >= 70 ? 2 : 1;
  if (mastery >= 90) return 7;
  if (mastery >= 80) return 5;
  if (mastery >= 70) return 3;
  if (mastery >= 55) return 2;
  return 1;
}

function buildAdaptiveSession(nodeBank, masterySnapshot) {
  const masteryMap = new Map((masterySnapshot ?? []).map(row => [row.skill_id, row.mastery_score ?? 50]));

  const output = [];
  for (const node of nodeBank) {
    const skill = node.skill_id ?? 'general';
    const mastery = masteryMap.get(skill) ?? 50;

    if (mastery >= 80 && node.difficulty_tier === 'easy' && node.node_type !== 'diagnostic_quick_check') {
      continue;
    }
    output.push(node);

    if (mastery <= 45 && node.node_type === 'mcq_single') {
      output.push({
        id: `${node.id}_repair`,
        node_type: 'remediation_micro',
        skill_id: skill,
        difficulty_tier: 'easy',
        prompt: `Quick repair: revisit ${node.skill_label ?? skill}`,
        explanation: node.explanation ?? 'Review the key principle before continuing.',
        source_span_ids: node.source_span_ids ?? [],
        estimated_seconds: 25,
      });
    }
  }
  return output.slice(0, 24);
}

async function generateTutorialPackage(material) {
  const extracted = extractSourceSpans(material);
  const fallbackPack = buildFallbackTutorial(material, extracted);
  try {
    const aiRes = await callAiProxy({
      action: 'generate_tutorial_v2',
      content: JSON.stringify({
        material_id: material.id,
        title: material.title,
        description: material.description,
        content_text: material.content_text ?? '',
      }),
      constraints: {
        strict_grounding: true,
        allowed_node_types: [
          'diagnostic_quick_check',
          'concept_explain',
          'confidence_check',
          'tap_reveal',
          'mcq_single',
          'fill_blank',
          'ordering_steps',
          'matching_pairs',
          'true_false_rapid',
          'lesson_summary_template',
        ],
      },
    });

    const candidate = {
      blueprint: aiRes?.blueprint ?? fallbackPack.blueprint,
      session_nodes: aiRes?.session_nodes ?? fallbackPack.session_nodes,
    };
    return enforceGrounding(candidate, extracted);
  } catch (err) {
    console.warn('[generateTutorialPackage] Falling back to deterministic package:', err.message);
    return fallbackPack;
  }
}

function extractSourceSpans(material) {
  const body = `${material.title ?? ''}\n${material.description ?? ''}\n${material.content_text ?? ''}`.trim();
  const lines = body.split(/\n+/).map(s => s.trim()).filter(Boolean);
  return lines.slice(0, 80).map((line, idx) => ({
    id: `s${idx + 1}`,
    text: line.slice(0, 240),
  }));
}

function buildFallbackTutorial(material, spans) {
  const title = material.title ?? 'Study Material';
  const skillId = slugify(title).slice(0, 42) || 'core-skill';
  const coreFact = spans[0]?.text ?? title;
  const secondaryFact = spans[1]?.text ?? material.description ?? coreFact;

  const blueprint = {
    lesson_id: `lesson_${material.id}`,
    title,
    estimated_minutes: 8,
    topic_graph: [{ skill_id: skillId, skill_label: title, depends_on: [] }],
    difficulty_tiers: ['easy', 'medium', 'hard'],
    source_spans: spans,
    strict_grounding: true,
  };

  const session_nodes = [
    {
      id: 'n0',
      node_type: 'diagnostic_quick_check',
      skill_id: skillId,
      skill_label: title,
      difficulty_tier: 'easy',
      prompt: `Diagnostic: Which statement best reflects this material: "${title}"?`,
      options: [
        { id: 'a', text: coreFact, correct: true },
        { id: 'b', text: secondaryFact, correct: false },
      ],
      source_span_ids: [spans[0]?.id].filter(Boolean),
      estimated_seconds: 30,
    },
    {
      id: 'n1',
      node_type: 'concept_explain',
      skill_id: skillId,
      skill_label: title,
      difficulty_tier: 'medium',
      title: `Core concept: ${title}`,
      explanation: coreFact,
      source_span_ids: [spans[0]?.id].filter(Boolean),
      estimated_seconds: 40,
    },
    {
      id: 'n2',
      node_type: 'mcq_single',
      skill_id: skillId,
      skill_label: title,
      difficulty_tier: 'medium',
      prompt: 'Which line is directly supported by this slide?',
      options: [
        { id: 'a', text: coreFact, correct: true },
        { id: 'b', text: 'A claim not present in this slide excerpt', correct: false },
      ],
      explanation: 'Correct answer is grounded in the extracted source span.',
      source_span_ids: [spans[0]?.id].filter(Boolean),
      estimated_seconds: 30,
    },
    {
      id: 'n3',
      node_type: 'true_false_rapid',
      skill_id: skillId,
      skill_label: title,
      difficulty_tier: 'easy',
      items: [
        { statement: coreFact, answer: true, source_span_ids: [spans[0]?.id].filter(Boolean) },
        { statement: secondaryFact, answer: true, source_span_ids: [spans[1]?.id].filter(Boolean) },
      ],
      estimated_seconds: 30,
    },
    {
      id: 'n4',
      node_type: 'lesson_summary_template',
      skill_id: skillId,
      skill_label: title,
      difficulty_tier: 'medium',
      summary_prompt: `Summarize ${title} using only verified slide statements.`,
      source_span_ids: [spans[0]?.id, spans[1]?.id].filter(Boolean),
      estimated_seconds: 20,
    },
  ];

  return { blueprint, session_nodes };
}

function enforceGrounding(candidate, spans) {
  const sourceById = new Map((spans ?? []).map(s => [s.id, s.text]));
  const safeNodes = (candidate.session_nodes ?? []).map(node => ({
    ...node,
    source_span_ids: (node.source_span_ids ?? []).filter(id => sourceById.has(id)),
  }));

  const filteredNodes = safeNodes.filter(node => {
    const text = JSON.stringify(node);
    const hasNumericClaim = /\d/.test(text) || /[=+\-/*^]/.test(text);
    if (!hasNumericClaim) return true;
    return (node.source_span_ids?.length ?? 0) > 0;
  });

  return {
    blueprint: {
      ...(candidate.blueprint ?? {}),
      source_spans: spans ?? [],
      strict_grounding: true,
    },
    session_nodes: filteredNodes,
  };
}

function slugify(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
