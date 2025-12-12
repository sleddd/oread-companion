"""Emotion detection processor."""
from transformers import pipeline
from optimum.onnxruntime import ORTModelForSequenceClassification
from transformers import AutoTokenizer, pipeline
import logging
from typing import Dict, Any, Optional, List
from pathlib import Path
import os

logger = logging.getLogger(__name__)

# Set HuggingFace cache to project's models folder (before any model loading)
_models_dir = Path(__file__).resolve().parent.parent.parent / "models" / "huggingface"
_models_dir.mkdir(parents=True, exist_ok=True)
os.environ['HF_HOME'] = str(_models_dir)
os.environ['TRANSFORMERS_CACHE'] = str(_models_dir)

class EmotionDetector:
    """Handles emotion detection from text."""

    # Maximum characters for emotion detection (emotion is evident in first few sentences)
    MAX_EMOTION_TEXT_LENGTH = 240

    def __init__(self, model_path: Optional[str] = None):
        """Initialize emotion classifier."""
        self.classifier = None
        self.initialized = False

        try:
            # 1. Determine the model path using the argument passed by FastAPI,
            #    falling back to the hardcoded relative path if not provided.
            if model_path:
                quantized_path = Path(model_path)
            else:
                # Use path relative to this file's location as a fallback
                quantized_path = Path(__file__).parent.parent.parent / "models" / "roberta_emotions_onnx"

            # 2. Check if quantized model exists
            if quantized_path.exists() and (quantized_path / "model.onnx").exists():
                logger.info("Loading quantized emotion classifier...")
                model = ORTModelForSequenceClassification.from_pretrained(
                    str(quantized_path),
                    local_files_only=True
                )
                tokenizer = AutoTokenizer.from_pretrained(
                    str(quantized_path),
                    local_files_only=True
                )

                self.classifier = pipeline(
                    "text-classification",
                    model=model,
                    tokenizer=tokenizer,
                    top_k=None
                )
                logger.info("✅ Quantized emotion classifier loaded successfully")
            else:
                logger.warning("Quantized model not found, falling back to online model")
                logger.info(f"   Downloading to: {_models_dir}")
                self.classifier = pipeline(
                    "text-classification",
                    model="SamLowe/roberta-base-go_emotions",
                    top_k=None
                )
                logger.info("✅ Emotion classifier loaded successfully (online)")

            # --- ADDED: Set initialized flag on successful load ---
            if self.classifier:
                self.initialized = True

        except Exception as e:
            logger.error(f"❌ Failed to load emotion classifier: {e}")
            self.classifier = None

    # --- ADDED: Async initialize method to align with FastAPI's async setup ---
    # Since the model loading is done in __init__, this method just confirms the status.
    async def initialize(self):
        """A placeholder to satisfy the FastAPI async initialization pattern."""
        if not self.initialized:
            # If initialization failed in __init__, raise a descriptive error
            raise RuntimeError("Emotion Detector failed to initialize. Check logs for model path errors.")
        return True
    # -------------------------------------------------------------------------

    def detect(self, text: str) -> Dict[str, Any]:
        """
        Detect emotion from text with enhanced multi-emotion analysis.

        Args:
            text: Input text to analyze

        Returns:
            Dictionary with emotion label, confidence score, and additional emotions
        """
        try:
            # Replaced self.classifier check with self.initialized check for consistency
            if not self.initialized:
                # Raise an error if detector isn't ready instead of returning a misleading neutral result
                raise RuntimeError("Emotion detector is not ready. Initialization failed.")

            # Truncate text if too long for emotion detection
            # Emotion is typically evident in the first few sentences
            if len(text) > self.MAX_EMOTION_TEXT_LENGTH:
                logger.warning(f"Text too long ({len(text)} chars), truncating to {self.MAX_EMOTION_TEXT_LENGTH} chars for emotion detection")
                text = text[:self.MAX_EMOTION_TEXT_LENGTH]

            # Get emotion predictions
            # The classifier call must handle the input/output of the pipeline
            emotion_result = self.classifier(text)

            # Ensure the result is a list (pipelines usually return [list])
            if not emotion_result or not isinstance(emotion_result[0], list):
                raise ValueError("Classifier returned an unexpected format.")

            # Sort by score descending
            sorted_emotions = sorted(emotion_result[0], key=lambda x: x['score'], reverse=True)

            # Get top emotion
            top_emotion = sorted_emotions[0]

            # Get top 3 emotions (for context)
            top_3_emotions = sorted_emotions[:3]

            # Calculate intensity based on top score
            intensity = self._calculate_intensity(top_emotion['score'])

            # Categorize emotion
            category = self._categorize_emotion(top_emotion['label'])

            return {
                'label': top_emotion['label'],
                'score': top_emotion['score'],
                'top_emotions': top_3_emotions,
                'intensity': intensity,
                'category': category
            }

        except Exception as e:
            logger.error(f"Emotion detection failed: {e}")
            # Reraise the exception for the FastAPI wrapper to handle and return 500
            raise e

    def _calculate_intensity(self, score: float) -> str:
        """Calculate emotional intensity from confidence score."""
        if score >= 0.8:
            return 'very high'
        elif score >= 0.6:
            return 'high'
        elif score >= 0.4:
            return 'moderate'
        elif score >= 0.2:
            return 'low'
        else:
            return 'very low'

    def _categorize_emotion(self, emotion: str) -> str:
        """
        Categorize emotions into broader groups for better empathy.
        Based on RoBERTa go_emotions model labels.
        """
        emotion_categories = {
            'sadness': 'distress', 'grief': 'distress', 'disappointment': 'distress', 'remorse': 'distress',
            'fear': 'anxiety', 'nervousness': 'anxiety', 'embarrassment': 'anxiety',
            'anger': 'anger', 'annoyance': 'anger', 'disapproval': 'anger',
            'joy': 'positive', 'amusement': 'positive', 'excitement': 'positive', 'gratitude': 'positive',
            'love': 'positive', 'optimism': 'positive', 'pride': 'positive', 'relief': 'positive',
            'curiosity': 'engaged', 'surprise': 'engaged', 'realization': 'engaged', 'admiration': 'engaged',
            'neutral': 'neutral', 'approval': 'neutral', 'caring': 'neutral', 'desire': 'neutral', 'confusion': 'neutral'
        }

        return emotion_categories.get(emotion.lower(), 'neutral')

    def cleanup(self):
        """Clean up resources and close any open handles."""
        try:
            if self.classifier is not None:
                # Clean up the pipeline and model resources
                if hasattr(self.classifier, 'model'):
                    del self.classifier.model
                if hasattr(self.classifier, 'tokenizer'):
                    del self.classifier.tokenizer
                del self.classifier
                self.classifier = None
                logger.info("✅ Emotion detector resources cleaned up")
        except Exception as e:
            logger.warning(f"Error during emotion detector cleanup: {e}")