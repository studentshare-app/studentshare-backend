import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import {
  getMaterials,
  getMaterialById,
  createMaterial,
  deleteMaterial,
} from '../controllers/materialController.js';

const router = Router();

// Rate limiters
const readLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 60,               // 60 reads/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down' },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,               // 10 uploads/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads, slow down' },
});

// All material routes require auth
router.use(authenticate);

router.get('/',     readLimiter,  getMaterials);
router.get('/:id',  readLimiter,  getMaterialById);
router.post('/',    writeLimiter, createMaterial);
router.delete('/:id', writeLimiter, deleteMaterial);

export default router;