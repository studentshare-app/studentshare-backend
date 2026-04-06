import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { requirePremium } from '../middleware/premium.js';
import {
  generateQuiz,
  summarize,
  chat,
  explain,
  generateNotes,
} from '../controllers/aiController.js';

const router = Router();

// AI calls are expensive — strict rate limits
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10,              // 10 AI requests/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please wait a moment' },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,              // chat can be slightly more frequent
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please wait a moment' },
});

// All AI routes require auth
router.use(authenticate);

// Core AI features — available to all users
router.post('/chat',           chatLimiter, chat);
router.post('/explain',        aiLimiter,   explain);

// Premium-only features
router.post('/quiz',           aiLimiter, requirePremium, generateQuiz);
router.post('/summarize',      aiLimiter, requirePremium, summarize);
router.post('/generate-notes', aiLimiter, requirePremium, generateNotes);

export default router;