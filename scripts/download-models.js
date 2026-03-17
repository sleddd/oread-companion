#!/usr/bin/env node

/**
 * Post-install script: downloads the emotion analysis model (GoEmotions).
 * Runs automatically after `npm install`.
 * Model is cached in ~/.cache/huggingface — subsequent installs are instant.
 */

async function downloadModels() {
  console.log('\n📥 Downloading emotion analysis model (GoEmotions)...');
  console.log('   (This is a one-time ~125MB download, cached for future use)\n');

  try {
    const { pipeline } = await import('@huggingface/transformers');
    const emotion = await pipeline('text-classification', 'SamLowe/roberta-base-go_emotions-onnx', {
      quantized: true,
    });

    // Warm-up inference to verify it works
    const result = await emotion('This is a test.');
    console.log(`✅ Emotion model downloaded and verified (test: ${result[0].label})\n`);
  } catch (err) {
    console.warn(`⚠️  Emotion model download failed (non-critical): ${err.message}`);
    console.warn('   The app will work without it — emotion features will be disabled.\n');
  }
}

downloadModels();
