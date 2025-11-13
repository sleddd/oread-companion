"""
Lorebook Retriever
Retrieves relevant lorebook chunks based on context during inference
"""
from typing import Dict, List, Any, Optional, Set
import logging
import re

logger = logging.getLogger(__name__)


class LorebookRetriever:
    """
    Retrieve relevant lorebook chunks based on:
    - User message keywords
    - Detected emotion
    - Companion type
    - Conversation context
    """

    def __init__(self, max_chunks: int = 2):
        """
        Initialize retriever.

        Args:
            max_chunks: Maximum number of chunks to retrieve (excluding always_include)
        """
        self.max_chunks = max_chunks
        self.selected_tags = set()  # User-selected personality tags

    def retrieve(
        self,
        lorebook: Dict[str, Any],
        user_message: str,
        emotion: str = 'neutral',
        companion_type: Optional[str] = None,
        conversation_history: Optional[List[Dict]] = None,
        top_emotions: Optional[List[tuple]] = None,
        selected_tags: Optional[Set[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant lorebook chunks for current context.

        Args:
            lorebook: Character's lorebook dict
            user_message: Current user message
            emotion: Detected emotion (e.g., 'joy', 'sadness', 'anger') - primary emotion
            companion_type: Type of companion ('romantic', 'friend', etc.)
            conversation_history: Recent conversation history
            top_emotions: Optional list of (emotion, confidence) tuples for blended matching
            selected_tags: Set of user-selected tag IDs (e.g., {'ee_warm', 'htc_kind'})

        Returns:
            List of relevant chunks, sorted by priority
        """
        # Store selected tags for use in scoring
        if selected_tags:
            self.selected_tags = selected_tags
        if not lorebook or "chunks" not in lorebook:
            logger.warning("Empty or invalid lorebook provided")
            return []

        # Deduplicate chunks by ID to prevent duplicates from accumulating
        seen_ids = set()
        unique_chunks = []
        for chunk in lorebook["chunks"]:
            chunk_id = chunk.get("id", "")
            if chunk_id and chunk_id not in seen_ids:
                seen_ids.add(chunk_id)
                unique_chunks.append(chunk)
            elif not chunk_id:
                # Chunk has no ID, include it but log warning
                unique_chunks.append(chunk)
                logger.warning(f"Chunk without ID found: {chunk.get('category', 'unknown')}")

        all_chunks = unique_chunks
        companion_type = companion_type or lorebook.get("companion_type", "friend")

        if len(lorebook["chunks"]) > len(all_chunks):
            logger.info(f"Deduplicated {len(lorebook['chunks']) - len(all_chunks)} duplicate chunks")

        logger.debug(
            f"Retrieving from {len(all_chunks)} chunks | "
            f"emotion={emotion} | companion={companion_type}"
        )

        # Filter out romantic/intimate chunks for platonic companions
        platonic_types = ["friend", "platonic", "companion"]
        excluded_categories = ["love_language", "physical_intimacy"]

        if companion_type in platonic_types:
            original_count = len(all_chunks)
            all_chunks = [
                chunk for chunk in all_chunks
                if chunk.get("category") not in excluded_categories
            ]
            filtered_count = original_count - len(all_chunks)
            if filtered_count > 0:
                logger.info(
                    f"Filtered out {filtered_count} romantic/intimate chunks "
                    f"for platonic companion type '{companion_type}'"
                )

        # Normalize user message for matching
        message_lower = user_message.lower()

        # Build context from conversation history
        context_text = self._build_context_text(conversation_history)

        # 1. Get always-include chunks (universal templates and narrative control)
        # Filter by companion_type if specified in chunk triggers
        always_include = []
        for chunk in all_chunks:
            triggers = chunk.get("triggers", {})

            # Check if this chunk should always be included
            if triggers.get("always_check") or chunk.get("source") == "universal":
                # Check if companion_type filtering applies
                allowed_types = triggers.get("companion_types", [])

                if allowed_types:
                    # Only include if companion_type matches
                    if companion_type in allowed_types:
                        always_include.append(chunk)
                else:
                    # No companion_type filter - always include
                    always_include.append(chunk)

        # 2. Score all other chunks
        scored_chunks = []
        for chunk in all_chunks:
            if chunk in always_include:
                continue  # Skip already included

            # Check companion_type filter BEFORE scoring
            triggers = chunk.get("triggers", {})
            allowed_types = triggers.get("companion_types", [])
            if allowed_types and companion_type not in allowed_types:
                # This chunk is restricted to specific companion types and current type doesn't match
                continue

            score = self._score_chunk(
                chunk=chunk,
                message=message_lower,
                context=context_text,
                emotion=emotion,
                companion_type=companion_type,
                top_emotions=top_emotions
            )

            if score > 0:
                scored_chunks.append((score, chunk))

        # 3. Sort by score (descending), then priority (descending)
        scored_chunks.sort(key=lambda x: (x[0], x[1]["priority"]), reverse=True)

        # 4. Take top N chunks
        selected_chunks = [chunk for score, chunk in scored_chunks[:self.max_chunks]]

        # 5. Combine always_include + selected, sort by priority
        final_chunks = always_include + selected_chunks
        final_chunks.sort(key=lambda x: x["priority"], reverse=True)

        # Calculate total tokens
        total_tokens = sum(c.get("tokens", 100) for c in final_chunks)

        logger.info(
            f"✅ Retrieved {len(final_chunks)} chunks "
            f"({len(always_include)} always + {len(selected_chunks)} matched) "
            f"~{total_tokens} tokens"
        )

        # Process new-style emotion-response chunks
        processed_chunks = self._process_emotion_response_chunks(
            final_chunks,
            emotion,
            top_emotions
        )

        return processed_chunks

    def _process_emotion_response_chunks(
        self,
        chunks: List[Dict[str, Any]],
        emotion: str,
        top_emotions: Optional[List[tuple]] = None
    ) -> List[Dict[str, Any]]:
        """
        Process chunks with emotion_responses format to generate emotion-specific content.

        Args:
            chunks: List of chunks to process
            emotion: Primary detected emotion
            top_emotions: List of top emotions with confidence scores

        Returns:
            List of processed chunks with content field populated
        """
        processed = []

        for chunk in chunks:
            # Check if this is a new-style chunk with emotion_responses
            if "emotion_responses" in chunk:
                emotion_responses = chunk["emotion_responses"]

                # Try to find the best matching emotion response
                matched_emotion = None
                matched_response = None

                # First, try exact match with primary emotion
                if emotion in emotion_responses:
                    matched_emotion = emotion
                    matched_response = emotion_responses[emotion]
                # Then try top_emotions if available
                elif top_emotions:
                    for item in top_emotions:
                        if isinstance(item, dict):
                            emo = item.get('label')
                        else:
                            emo = item[0] if isinstance(item, tuple) else None

                        if emo and emo in emotion_responses:
                            matched_emotion = emo
                            matched_response = emotion_responses[emo]
                            break

                # Fallback to default
                if not matched_response:
                    matched_response = emotion_responses.get("default", {})
                    matched_emotion = "default"

                # Create new chunk with formatted content
                new_chunk = chunk.copy()

                # Format content from tone + action
                tone = matched_response.get("tone", "")
                action = matched_response.get("action", "")
                emotion_priority = matched_response.get("priority", None)

                # Blend tone and action into natural instruction without labels
                # This prevents "**Tone:**" and "**Action:**" from leaking into LLM output
                content_parts = []

                if tone and action:
                    # Combine both into a single flowing instruction
                    content_parts.append(f"{action} Use {tone} tone.")
                elif action:
                    # Action only
                    content_parts.append(action)
                elif tone:
                    # Tone only
                    content_parts.append(f"Use {tone} tone.")

                # Skip this chunk if both tone and action are empty
                if not content_parts:
                    logger.debug(f"Skipping '{chunk['id']}' - empty tone and action for emotion '{matched_emotion}'")
                    continue

                content = " ".join(content_parts)
                new_chunk["content"] = content

                # Update tokens from emotion-specific response
                new_chunk["tokens"] = matched_response.get("tokens", chunk.get("tokens", 70))

                # Update priority from emotion-specific response if provided
                # Priority is used for sorting/ordering, not displayed in content
                if emotion_priority is not None:
                    new_chunk["priority"] = emotion_priority
                    logger.debug(f"Updated priority for '{chunk['id']}' to {emotion_priority} based on emotion '{matched_emotion}'")

                logger.debug(
                    f"Processed '{chunk['id']}' with emotion '{matched_emotion}': "
                    f"tone='{tone[:30]}...', action='{action[:30]}...'"
                )

                processed.append(new_chunk)
            else:
                # Old-style chunk with pre-set content
                processed.append(chunk)

        # Combine personality trait chunks into unified instructions
        combined = self._combine_personality_chunks(processed, emotion)

        return combined

    def _combine_personality_chunks(
        self,
        chunks: List[Dict[str, Any]],
        emotion: str
    ) -> List[Dict[str, Any]]:
        """
        Combine multiple personality trait chunks from the same category into single unified instructions.
        This reduces instruction overload and prevents conflicting guidance.

        Args:
            chunks: Processed chunks with content field
            emotion: Current emotion context

        Returns:
            List with personality chunks combined by category
        """
        # Categories that should be combined
        combinable_categories = {
            "emotional_expression",
            "social_energy",
            "thinking_style",
            "core_values",
            "humor_style"
        }

        # Separate combinable from non-combinable chunks
        to_combine = {}  # category -> list of chunks
        keep_separate = []

        for chunk in chunks:
            category = chunk.get("category", "")
            if category in combinable_categories:
                if category not in to_combine:
                    to_combine[category] = []
                to_combine[category].append(chunk)
            else:
                keep_separate.append(chunk)

        # Combine chunks within each category
        combined_chunks = []
        for category, category_chunks in to_combine.items():
            if len(category_chunks) == 1:
                # Only one chunk in this category, keep as-is
                combined_chunks.append(category_chunks[0])
            else:
                # Multiple chunks - combine them
                tones = []
                actions = []
                max_priority = max(c.get("priority", 50) for c in category_chunks)
                total_tokens = sum(c.get("tokens", 50) for c in category_chunks)
                chunk_ids = [c.get("id", "") for c in category_chunks]

                for chunk in category_chunks:
                    content = chunk.get("content", "")

                    # Parse out tone and action from content
                    # Format is typically: "action. Use tone tone."
                    if ". Use " in content and " tone." in content:
                        parts = content.split(". Use ")
                        action_part = parts[0]
                        tone_part = parts[1].replace(" tone.", "").strip()

                        if action_part:
                            actions.append(action_part)
                        if tone_part:
                            tones.append(tone_part)
                    else:
                        # Fallback - treat whole content as action
                        actions.append(content)

                # Build combined content
                combined_content_parts = []

                if actions:
                    # Combine actions into natural flow
                    combined_action = " ".join(actions)
                    combined_content_parts.append(combined_action)

                if tones:
                    # Combine tones with "and" or comma separation
                    if len(tones) == 1:
                        tone_str = tones[0]
                    elif len(tones) == 2:
                        tone_str = f"{tones[0]} and {tones[1]}"
                    else:
                        tone_str = ", ".join(tones[:-1]) + f", and {tones[-1]}"
                    combined_content_parts.append(f"Use {tone_str} tone.")

                if combined_content_parts:
                    combined_chunk = {
                        "id": f"combined_{category}",
                        "category": category,
                        "priority": max_priority,
                        "tokens": min(total_tokens, 150),  # Cap combined token estimate
                        "content": " ".join(combined_content_parts),
                        "source": "combined",
                        "combined_from": chunk_ids
                    }
                    combined_chunks.append(combined_chunk)

                    logger.debug(
                        f"Combined {len(category_chunks)} chunks in category '{category}' "
                        f"into single instruction ({len(combined_chunk['content'])} chars)"
                    )

        # Merge combined chunks with non-combinable chunks
        final_chunks = keep_separate + combined_chunks

        # Re-sort by priority
        final_chunks.sort(key=lambda x: x.get("priority", 50), reverse=True)

        logger.info(
            f"Chunk combination: {len(chunks)} → {len(final_chunks)} chunks "
            f"({len(chunks) - len(final_chunks)} merged)"
        )

        return final_chunks

    def _score_chunk(
        self,
        chunk: Dict[str, Any],
        message: str,
        context: str,
        emotion: str,
        companion_type: str,
        top_emotions: Optional[List[tuple]] = None
    ) -> int:
        """
        Score a chunk's relevance to current context.

        Args:
            chunk: Chunk to score
            message: Normalized user message
            context: Normalized conversation context
            emotion: Current emotion (primary)
            companion_type: Companion type
            top_emotions: Optional list of (emotion, confidence) tuples for blended matching

        Returns:
            Relevance score (0 = not relevant, higher = more relevant)
        """
        score = 0

        # NEW: Check if this chunk requires user selection
        requires_selection = chunk.get("requires_selection", False)
        chunk_id = chunk.get("id", "")

        if requires_selection:
            # Only score this chunk if user has selected it
            if chunk_id not in self.selected_tags:
                logger.debug(f"Chunk '{chunk_id}' requires selection but not selected - skipping")
                return 0  # Not selected, don't include
            else:
                # User selected this tag - give it a base score boost
                score += 30
                logger.debug(f"Chunk '{chunk_id}' is selected - base +30 points")

        # Check for new-style emotion_responses format
        if "emotion_responses" in chunk:
            emotion_responses = chunk["emotion_responses"]

            # Score based on whether we have a matching emotion response
            # Try primary emotion
            if emotion in emotion_responses:
                score += 40  # Strong match
                logger.debug(f"Chunk '{chunk_id}': +40 points (exact emotion match: {emotion})")
            elif top_emotions:
                # Try top emotions
                for item in top_emotions[:3]:
                    if isinstance(item, dict):
                        emo = item.get('label')
                        confidence = item.get('score', 1.0)
                    else:
                        emo, confidence = item

                    if emo in emotion_responses:
                        points = int(30 * confidence)
                        score += points
                        logger.debug(f"Chunk '{chunk_id}': +{points} points (emotion '{emo}' @ {confidence:.2f})")
                        break
            elif "default" in emotion_responses:
                score += 10  # Has fallback
                logger.debug(f"Chunk '{chunk_id}': +10 points (has default response)")

            return score  # For new-style chunks, emotion matching is the primary logic

        # OLD-STYLE CHUNK LOGIC (with triggers)
        triggers = chunk.get("triggers", {})

        # Detect intensity/tone modifiers in the message
        gentle_words = ["soft", "gentle", "tender", "sweet", "light", "subtle", "quiet", "calm", "peaceful", "morning"]
        intense_words = ["passionate", "hard", "deep", "intense", "urgent", "desperately", "need", "crave", "hunger"]

        is_gentle_context = any(word in message for word in gentle_words)
        is_intense_context = any(word in message for word in intense_words)

        # 1. Keyword matching (context-aware weight)
        keywords = triggers.get("keywords", [])
        if keywords:
            matched_keywords = 0
            for keyword in keywords:
                keyword_lower = keyword.lower()
                # Check in message (higher weight)
                if keyword_lower in message:
                    matched_keywords += 2
                    base_score = 20

                    # CONTEXT DAMPENING: Reduce score for high-intensity chunks in gentle contexts
                    chunk_id = chunk.get("id", "")
                    if is_gentle_context and any(term in chunk_id for term in ["dominant", "aggressive", "intense", "sexual"]):
                        base_score = 5  # Heavily dampen aggressive chunks
                        logger.debug(f"Chunk '{chunk_id}': Dampened to {base_score} (gentle context detected)")
                    elif not is_intense_context and "sexual" in chunk_id:
                        base_score = 8  # Moderate dampening for sexual chunks without intense context
                        logger.debug(f"Chunk '{chunk_id}': Dampened to {base_score} (no intense context)")

                    score += base_score
                # Check in context (lower weight)
                elif keyword_lower in context:
                    matched_keywords += 1
                    score += 5

            if matched_keywords > 0:
                logger.debug(
                    f"Chunk '{chunk['id']}': +{score} points "
                    f"({matched_keywords} keyword matches)"
                )

        # 2. Emotion matching (high weight - blended from top 3 emotions)
        trigger_emotions = triggers.get("emotions", [])
        if trigger_emotions:
            emotion_score = 0

            # Use top_emotions if available (blended scoring)
            if top_emotions:
                for item in top_emotions[:3]:  # Top 3 emotions
                    # Handle both dict format [{'label': 'joy', 'score': 0.85}, ...]
                    # and tuple format [('joy', 0.85), ...]
                    if isinstance(item, dict):
                        emo = item.get('label')
                        confidence = item.get('score', 1.0)
                    else:  # tuple
                        emo, confidence = item

                    if emo in trigger_emotions:
                        # Weight by confidence: 25 * confidence (0.0-1.0)
                        points = int(25 * confidence)
                        emotion_score += points
                        logger.debug(f"Chunk '{chunk['id']}': +{points} points (emotion '{emo}' @ {confidence:.2f} confidence)")
            # Fallback to single emotion
            elif emotion and emotion in trigger_emotions:
                emotion_score = 25
                logger.debug(f"Chunk '{chunk['id']}': +25 points (emotion match: {emotion})")

            score += emotion_score

        # 3. Companion type matching (low weight)
        trigger_types = triggers.get("companion_types", [])
        if trigger_types:
            if companion_type in trigger_types:
                score += 5
                logger.debug(f"Chunk '{chunk['id']}': +5 points (companion type match)")

        # 4. Category boost (ensure variety)
        category = chunk.get("category")
        if category == "boundary":
            score += 3  # Always favor boundaries
        elif category == "affection" and any(kw in message for kw in ["touch", "hug", "kiss", "hold"]):
            # Boost affection chunks in gentle contexts
            if is_gentle_context:
                score += 10  # Prefer tender affection
            else:
                score += 5
        elif category == "communication" and len(message.split()) > 30:
            score += 3  # Long messages may need communication guidance

        return score

    def _build_context_text(
        self,
        conversation_history: Optional[List[Dict]]
    ) -> str:
        """
        Build normalized context text from conversation history.

        Args:
            conversation_history: List of {role, content} dicts

        Returns:
            Normalized context string (last 3 messages)
        """
        if not conversation_history:
            return ""

        # Get last 3 messages
        recent = conversation_history[-3:]
        context_parts = [msg.get("content", "") for msg in recent if "content" in msg]

        return " ".join(context_parts).lower()

    def format_chunks_for_prompt(
        self,
        chunks: List[Dict[str, Any]],
        section_name: str = "ACTIVE CONTEXT"
    ) -> str:
        """
        Format retrieved chunks into prompt-ready text.

        Args:
            chunks: List of chunk dicts
            section_name: Name of the prompt section (default: ACTIVE CONTEXT)

        Returns:
            Formatted string ready to inject into prompt
        """
        if not chunks:
            return ""

        # Sort by priority (highest first)
        sorted_chunks = sorted(chunks, key=lambda x: x["priority"], reverse=True)

        # Build formatted output - simple bullet list without aggressive headers
        lines = []

        for chunk in sorted_chunks:
            # Add chunk content without heavy formatting
            content = chunk["content"].strip()
            # Present as data points rather than instructions
            lines.append(f"> {content}")

        return "\n".join(lines)

    def get_retrieval_stats(
        self,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Get statistics about retrieved chunks.

        Args:
            chunks: Retrieved chunks

        Returns:
            Dict with stats
        """
        if not chunks:
            return {
                "count": 0,
                "total_tokens": 0,
                "categories": {},
                "sources": {}
            }

        # Category breakdown
        categories = {}
        for chunk in chunks:
            cat = chunk.get("category", "unknown")
            categories[cat] = categories.get(cat, 0) + 1

        # Source breakdown
        sources = {}
        for chunk in chunks:
            src = chunk.get("source", "unknown")
            sources[src] = sources.get(src, 0) + 1

        # Token count
        total_tokens = sum(c.get("tokens", 100) for c in chunks)

        return {
            "count": len(chunks),
            "total_tokens": total_tokens,
            "categories": categories,
            "sources": sources,
            "avg_priority": sum(c["priority"] for c in chunks) / len(chunks)
        }

    def explain_retrieval(
        self,
        lorebook: Dict[str, Any],
        user_message: str,
        emotion: str = 'neutral'
    ) -> str:
        """
        Explain why certain chunks were retrieved (debugging).

        Args:
            lorebook: Character's lorebook
            user_message: User message
            emotion: Detected emotion

        Returns:
            Human-readable explanation string
        """
        retrieved = self.retrieve(
            lorebook=lorebook,
            user_message=user_message,
            emotion=emotion
        )

        lines = [
            f"Retrieved {len(retrieved)} chunks for:",
            f"  Message: '{user_message[:50]}...'",
            f"  Emotion: {emotion}",
            "",
            "Chunks:"
        ]

        for i, chunk in enumerate(retrieved, 1):
            source = chunk.get("source", "unknown")
            priority = chunk["priority"]
            chunk_id = chunk["id"]

            lines.append(f"{i}. [{priority}] {chunk_id} (source: {source})")

            # Show why it matched
            triggers = chunk.get("triggers", {})
            if triggers.get("always_check") or source == "universal":
                lines.append("   → Always included (universal)")
            else:
                reasons = []
                keywords = triggers.get("keywords", [])
                if keywords:
                    matched = [kw for kw in keywords if kw.lower() in user_message.lower()]
                    if matched:
                        reasons.append(f"keywords: {matched}")

                emotions = triggers.get("emotions", [])
                if emotion in emotions:
                    reasons.append(f"emotion: {emotion}")

                if reasons:
                    lines.append(f"   → {', '.join(reasons)}")

        stats = self.get_retrieval_stats(retrieved)
        lines.append("")
        lines.append(f"Total tokens: ~{stats['total_tokens']}")
        lines.append(f"Categories: {stats['categories']}")

        return "\n".join(lines)
