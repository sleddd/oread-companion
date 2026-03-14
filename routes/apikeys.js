import express from 'express';
import apiKeyService from '../services/apiKeyService.js';
import { getProviderService, clearProviderCache } from '../services/providerRouter.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import Joi from 'joi';

const router = express.Router();

const VALID_PROVIDERS = ['openai', 'anthropic'];

const apiKeySchema = Joi.object({
  apiKey: Joi.string().min(10).max(500).required()
});

const providerParamSchema = (req, res, next) => {
  if (!VALID_PROVIDERS.includes(req.params.provider)) {
    return res.status(400).json({
      success: false,
      error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}`
    });
  }
  next();
};

// GET /api/keys - List which providers have keys configured
router.get('/', asyncHandler(async (req, res) => {
  const providers = await apiKeyService.getConfiguredProviders();
  res.json({ success: true, providers });
}));

// PUT /api/keys/:provider - Save an API key
router.put('/:provider', providerParamSchema, validate(apiKeySchema), asyncHandler(async (req, res) => {
  const { provider } = req.params;
  const { apiKey } = req.body;

  await apiKeyService.saveKey(provider, apiKey);

  // Clear cached provider instances so new key is picked up
  clearProviderCache(provider);

  res.json({ success: true });
}));

// DELETE /api/keys/:provider - Remove an API key
router.delete('/:provider', providerParamSchema, asyncHandler(async (req, res) => {
  const { provider } = req.params;
  await apiKeyService.deleteKey(provider);
  clearProviderCache(provider);
  res.json({ success: true });
}));

// POST /api/keys/:provider/verify - Verify an API key works
router.post('/:provider/verify', providerParamSchema, asyncHandler(async (req, res) => {
  const { provider } = req.params;

  const apiKey = await apiKeyService.getKey(provider);
  if (!apiKey) {
    return res.status(404).json({
      success: false,
      error: `No API key configured for ${provider}`
    });
  }

  const service = getProviderService(provider, apiKey);
  const health = await service.checkHealth();

  res.json({
    success: health.status === 'ok',
    status: health.status,
    message: health.message
  });
}));

export default router;
