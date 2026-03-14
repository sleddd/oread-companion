// Template API routes
import express from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, settingsSchema } from '../middleware/validation.js';
import {
  getAllDefaultTemplates,
  getDefaultTemplate,
  getActiveTemplate,
  saveActiveTemplate,
  deleteActiveTemplate
} from '../controllers/templateController.js';

const router = express.Router();

// ─── Active Template (Settings) ───────────────────────────────────────────────
// Must be registered before /:id to prevent "active" being captured as a template ID

router.get('/active', asyncHandler(getActiveTemplate));
router.put('/active', validate(settingsSchema), asyncHandler(saveActiveTemplate));
router.delete('/active', asyncHandler(deleteActiveTemplate));

// ─── Default Templates ────────────────────────────────────────────────────────

router.get('/', getAllDefaultTemplates);
router.get('/:id', getDefaultTemplate);

export default router;
