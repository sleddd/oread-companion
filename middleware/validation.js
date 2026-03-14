import Joi from 'joi';

/**
 * Validation schemas for API endpoints
 */

// Chat message validation
export const chatSchema = Joi.object({
  model: Joi.string()
    .max(200)
    .required()
    .messages({
      'any.required': 'Model is required'
    }),

  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid('user', 'assistant', 'system').required(),
        content: Joi.string().max(100000).allow('').required().messages({
          'string.max': 'Message content too long (max: 100KB)'
        })
      })
    )
    .max(100)
    .required()
    .messages({
      'array.max': 'Too many messages (max: 100)'
    }),

  systemPrompt: Joi.string().max(50000).allow('').optional().messages({
    'string.max': 'System prompt too long (max: 50KB)'
  }),

  temperature: Joi.number().min(0).max(2).allow(null).optional(),
  topP: Joi.number().min(0).max(1).allow(null).optional(),
  maxTokens: Joi.number().min(1).max(100000).allow(null).optional(),

  sessionId: Joi.string()
    .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .allow(null)
    .optional()
    .messages({
      'string.pattern.base': 'Invalid session ID format'
    }),

  provider: Joi.string().valid('ollama', 'openai', 'anthropic').optional(),

  settings: Joi.object().optional()
});

// Model pull validation
export const modelPullSchema = Joi.object({
  modelName: Joi.string()
    .pattern(/^[^\s;&|`$<>\\]+$/)
    .max(200)
    .required()
    .messages({
      'string.pattern.base': 'Model name must not contain shell special characters',
      'any.required': 'Model name is required'
    })
});

// Session creation validation
export const sessionCreateSchema = Joi.object({
  name: Joi.string().max(200).required(),
  character_name: Joi.string().max(200).allow(null).optional(),
  character_mode: Joi.string().valid('single', 'multi').optional(),
  mode: Joi.string().valid('roleplay', 'normal').required(),
  settings_snapshot: Joi.object().optional()
});

// Session update validation
export const sessionUpdateSchema = Joi.object({
  name: Joi.string().max(200).optional(),
  archived: Joi.boolean().optional()
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

// Character ID validation (for path safety)
export const characterIdSchema = Joi.string()
  .pattern(/^[a-zA-Z0-9_-]+$/)
  .max(100)
  .required()
  .messages({
    'string.pattern.base': 'Character ID must contain only alphanumeric characters, hyphens, and underscores'
  });

// Settings validation
export const settingsSchema = Joi.object({
  settings: Joi.object({
    mode: Joi.string().valid('roleplay', 'normal').optional(),

    roleplay: Joi.object({
      world: Joi.object().optional(),
      characterMode: Joi.string().valid('single', 'multi').optional(),
      singleCharacterRef: Joi.string().max(100).allow('').optional(),
      multipleCharacterRefs: Joi.array().items(Joi.string().max(100)).optional()
    }).optional(),

    utility: Joi.object().optional(),
    userPersona: Joi.object().optional(),

    general: Joi.object({
      selectedModel: Joi.string().max(100).allow(null).optional(),
      modelProvider: Joi.string().valid('ollama', 'openai', 'anthropic').allow(null).optional(),
      webSearch: Joi.boolean().optional(),
      chatSearch: Joi.boolean().optional(),
      memory: Joi.boolean().optional(),
      temperature: Joi.number().min(0).max(2).optional(),
      topP: Joi.number().min(0).max(1).optional(),
      maxTokens: Joi.number().min(1).max(100000).optional()
    }).optional(),

    meta: Joi.object().optional()
  }).required()
});

// Memory embed validation
export const embedSchema = Joi.object({
  sessionId: Joi.string()
    .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .required()
    .messages({ 'string.pattern.base': 'Invalid session ID format' }),
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string().valid('user', 'assistant', 'system').required(),
        content: Joi.string().max(100000).required(),
        id: Joi.string().optional()
      })
    )
    .min(1)
    .required()
    .messages({ 'array.min': 'At least one message is required' })
});

// Memory text search validation
export const memorySearchSchema = Joi.object({
  sessionId: Joi.string()
    .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .required()
    .messages({ 'string.pattern.base': 'Invalid session ID format' }),
  query: Joi.string().max(10000).required(),
  topK: Joi.number().integer().min(1).max(100).optional().default(5)
});

// Vector search validation
export const vectorSearchSchema = Joi.object({
  sessionId: Joi.string()
    .pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    .required(),
  queryVector: Joi.array().items(Joi.number()).length(768).required(),
  topK: Joi.number().min(1).max(100).optional().default(5)
});

/**
 * Validation middleware factory
 */
export function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors
      });
    }

    // Replace req.body with validated and sanitized value
    req.body = value;
    next();
  };
}

/**
 * Validate UUID parameter
 */
export function validateUUID(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid UUID format'
      });
    }

    next();
  };
}

/**
 * Sanitize string for prompts (prevent injection)
 */
export function sanitizeForPrompt(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/[\r\n]+/g, ' ') // Remove newlines
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim()
    .slice(0, 10000); // Limit length
}

/**
 * Validate image upload (base64 data URL)
 */
export function validateImageUpload(base64Data) {
  if (!base64Data) {
    throw new Error('Image data is required');
  }

  // Check data URL format - only allow PNG, JPEG, GIF
  const match = base64Data.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image format. Only PNG, JPEG, and GIF allowed (no SVG).');
  }

  const [, mimeType, data] = match;

  // Decode and check size
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > 2 * 1024 * 1024) { // 2MB
    throw new Error('Image too large. Maximum size: 2MB');
  }

  // Validate magic bytes (file signature)
  const magicBytes = {
    'png': [0x89, 0x50, 0x4E, 0x47],
    'jpeg': [0xFF, 0xD8, 0xFF],
    'jpg': [0xFF, 0xD8, 0xFF],
    'gif': [0x47, 0x49, 0x46]
  };

  const signature = Array.from(buffer.slice(0, 4));
  const expectedMagic = magicBytes[mimeType];

  if (!expectedMagic) {
    throw new Error('Unsupported image type');
  }

  const isValid = expectedMagic.every((byte, i) => byte === signature[i]);

  if (!isValid) {
    throw new Error('Invalid image file signature - file may be corrupted or not a real image');
  }

  return true;
}

export default {
  validate,
  validateUUID,
  sanitizeForPrompt,
  validateImageUpload,
  chatSchema,
  modelPullSchema,
  sessionCreateSchema,
  sessionUpdateSchema,
  characterIdSchema,
  settingsSchema,
  embedSchema,
  memorySearchSchema,
  vectorSearchSchema
};
