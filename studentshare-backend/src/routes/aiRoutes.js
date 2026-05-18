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
  tutorial,
  tutorialSession,
  tutorialNodeResult,
} from '../controllers/aiController.js';

const router = Router();

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please wait a moment' },
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests, please wait a moment' },
});

router.use(authenticate);

router.post('/chat', chatLimiter, chat);
router.post('/explain', aiLimiter, explain);

router.post('/tutorial', aiLimiter, tutorial);
router.post('/tutorial/session', aiLimiter, tutorialSession);
router.post('/tutorial/node-result', aiLimiter, tutorialNodeResult);

router.post('/quiz', aiLimiter, requirePremium, generateQuiz);
router.post('/summarize', aiLimiter, requirePremium, summarize);
router.post('/generate-notes', aiLimiter, requirePremium, generateNotes);

export default router;
