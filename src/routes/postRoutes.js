import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { getPosts, createPost } from '../controllers/postController.js';

const router = Router();

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,              // 15 posts/min is generous enough
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Posting too fast, slow down' },
});

router.use(authenticate);

router.get('/',  readLimiter,  getPosts);
router.post('/', writeLimiter, createPost);

export default router;