import express from 'express';
import { getPosts, createPost } from '../controllers/postsController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, getPosts);
router.post('/', authenticate, createPost);

export default router;

