"""
Prompt Builder
Constructs prompts from character data and conversation history
"""
import logging
import re
from datetime import datetime
import pytz
from typing import List, Dict, Optional, Tuple

from .lorebook_retriever import LorebookRetriever

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════
# CONFLICT RESOLUTION PROTOCOL (P2)
# Handles contradictions between injected Lorebook tags
# ═══════════════════════════════════════════════════════════
CONFLICT_RESOLUTION_PROTOCOL = """**<<META_PROTOCOL_FOR_INJECTED_INSTRUCTIONS>>**

**ABSOLUTE PRIMARY RULE:** Preserve Character Identity and Internal Flaws. Conflict should be displayed as **Internal Tension** for the user to observe.

**1. TONE-ON-TONE CONFLICT (Adjective vs. Adjective):**
*(Conflict between delivery style, e.g., 'Warm' vs. 'Cynical')*

* **Rule:** When two contradictory tonal adjectives are injected, they must be blended into a **Compound Voice.**
* **Action:** Subordinate the less dominant tone to the more dominant tone (e.g., the one listed first, or the one with the highest token count). The resulting tone must be a blend: **[Dominant Tone] but [Subordinate Tone].**
* **Example Outcome:** Instead of "Warm" and "Cynical" canceling out to "Neutral," they become **"Cynically Warm"** (a helpful person who complains while doing the nice thing).

**2. ACTION-ON-ACTION CONFLICT (Verb vs. Verb):**
*(Conflict between behavioral goals, e.g., 'Set a firm boundary' vs. 'Be entirely yielding')*

* **Rule:** When contradictory behavioral instructions are injected, the character must demonstrate a **Moment of Behavioral Failure.**
* **Action:** The character must attempt the first action (the impulse), stop, and then execute the second, conflicting action (the flaw). The resulting dialogue must show the struggle (e.g., faltering speech, mid-sentence correction, visible hesitancy).
* **Example Outcome:** The character starts to "Set a firm boundary," but the conflicting 'Be entirely yielding' instruction forces them to immediately backtrack and over-apologize, revealing the flaw.

**3. TONE-ON-ACTION CONFLICT (Adjective vs. Verb):**
*(Conflict between how to act and what to feel, e.g., Must 'Offer a solution' but must be 'Deeply Depressed')*

* **Rule:** The required **ACTION (the verb)** always takes priority over the **TONE (the adjective).**
* **Action:** The character must fulfill the behavioral requirement, but the delivery (tone) must express deep reluctance, difficulty, or pain in performing that task. The action is achieved, but the character is miserable while doing it.
* **Example Outcome:** The character successfully "Offers a solution," but the 'Deeply Depressed' tone ensures the solution is delivered with no energy, no encouragement, and possibly a fatalistic disclaimer ("...but I doubt it will work.")

**<<END_PROTOCOL>>**"""


class PromptBuilder:
    """
    Builds LLM prompts from character profiles, conversation history, and context.
    Extracted from the original LLMProcessor for better separation of concerns.
    """

    # Compiled regex patterns for response cleaning
    META_PARENTHETICAL_PATTERN = re.compile(
        r'\([^)]*(?:'
        r'sensing your|responds? with|responded with|responding with|'
        r'warm tone|soft tone|gentle tone|playful tone|seductive tone|'
        r'with a [a-z]+ tone|in a [a-z]+ tone|'
        r'says [a-z]+ly|whispers [a-z]+ly|murmurs [a-z]+ly'
        r')[^)]*\)',
        re.IGNORECASE
    )
    BRACKET_PATTERN = re.compile(r'\[[^\]]+\]')
    WHITESPACE_PATTERN = re.compile(r'\s+')
    PUNCTUATION_SPACING_PATTERN = re.compile(r'\s+([.,!?])')
    LEADING_PUNCTUATION_PATTERN = re.compile(r'^[.,!?\s]+')
    QUOTE_PATTERN = re.compile(r'^\s*["\']|["\']\s*$')

    def __init__(
        self,
        character_profile: str,
        character_name: str,
        character_gender: str,
        character_role: str,
        character_backstory: str,
        avoid_words: List[str],
        user_name: str,
        companion_type: str,
        user_gender: str,
        relationship_type: str = None,  # NEW: Separate from companion_type (e.g., "Platonic", "Romantic")
        user_species: str = "human",
        user_timezone: str = "UTC",
        user_backstory: str = "",
        user_communication_boundaries: str = "",
        user_preferences: Dict = None,
        major_life_events: List[str] = None,
        shared_roleplay_events: List[str] = None,
        lorebook: Optional[Dict] = None,
        personality_tags: Optional[Dict] = None,
        # V3 additions
        character_species: str = "Human",
        character_age: int = 25,
        character_interests: str = "",
        character_boundaries: List[str] = None,
        selected_personality_tags: List[str] = None
    ):
        """
        Initialize PromptBuilder with character and user settings.

        Args:
            character_profile: Full character description
            character_name: Name of the character
            character_gender: Gender of the character
            character_role: Role/occupation of the character
            character_backstory: Character's backstory
            avoid_words: List of phrases/words the character should avoid
            user_name: Name of the user
            companion_type: Type of relationship ('romantic' or 'friend')
            user_gender: Gender of the user
            relationship_type: Explicit relationship type ('Platonic' or 'Romantic') - overrides companion_type if provided
            user_species: Species of the user (default: 'human')
            user_timezone: User's timezone (default: 'UTC')
            user_backstory: User's backstory/bio
            user_communication_boundaries: User's personal communication boundaries/topics to avoid
            user_preferences: Dict of user interests (music, books, movies, hobbies, other)
            major_life_events: List of important life events
            shared_roleplay_events: List of shared memories/experiences
            lorebook: Optional lorebook data structure
            personality_tags: Optional dict of personality tag selections (e.g., tagSelections from character JSON)
        """
        self.character_profile = character_profile
        self.character_name = character_name
        self.character_gender = character_gender
        self.character_role = character_role
        self.character_backstory = character_backstory
        self.avoid_words = avoid_words or []
        self.user_name = user_name
        self.companion_type = companion_type
        # NEW: Use relationship_type if provided, otherwise derive from companion_type
        if relationship_type:
            self.relationship_type = relationship_type
        else:
            # Fallback: map companion_type to relationship_type
            self.relationship_type = "Romantic" if companion_type == "romantic" else "Platonic"
        self.user_gender = user_gender
        self.user_species = user_species
        self.user_timezone = user_timezone
        self.user_backstory = user_backstory
        self.user_communication_boundaries = user_communication_boundaries
        self.user_preferences = user_preferences or {}
        self.major_life_events = major_life_events or []
        self.shared_roleplay_events = shared_roleplay_events or []
        self.personality_tags = personality_tags or {}

        # V3 additions
        self.character_species = character_species
        self.character_age = character_age
        self.character_interests = character_interests
        self.character_boundaries = character_boundaries or []
        self.selected_personality_tags = selected_personality_tags or []

        # Lorebook support - ALWAYS enabled for character behavior retrieval
        self.lorebook = lorebook
        self.use_lorebook = True if lorebook else False
        # Always create retriever - needed for both lorebook AND interest chunks
        # Max 50 chunks to prevent prompt bloat
        self.lorebook_retriever = LorebookRetriever(max_chunks=10)

        # Create interest chunks for dynamic retrieval
        self.interest_chunks = self._create_interest_chunks()

        # Compile avoid patterns
        self.avoid_patterns = [
            re.compile(re.escape(phrase), re.IGNORECASE)
            for phrase in self.avoid_words
        ]

        # Cache for time context
        self._time_context_cache = None

        # Preloaded static components
        self._preloaded_user_context = None
        self._preloaded_character_section = None
        self._preloaded_relationship_instructions = None
        self._preloaded_core_rules = None
        self._preloaded_formatting_rules = None

        # Preload static components on initialization
        self._preload_prompt_components()

    def _get_selected_tag_ids(self) -> set:
        """
        Extract selected tag IDs from personality_tags for lorebook matching.

        Returns:
            Set of selected tag IDs (e.g., {'ee_warm', 'htc_kind'})
        """
        from .lorebook_templates import LorebookTemplates

        if not self.personality_tags:
            return set()

        selected_ids = set()

        # Map UI tags to template IDs
        for category, tags in self.personality_tags.items():
            if isinstance(tags, list):
                for ui_tag in tags:
                    # Try to get template by UI tag
                    template = LorebookTemplates.get_template_by_ui_tag(ui_tag, category)
                    if template:
                        selected_ids.add(template['id'])

        logger.debug(f"Selected tag IDs: {selected_ids}")
        return selected_ids

    def _create_interest_chunks(self) -> List[Dict]:
        """
        Create lorebook-style chunks from user interests for dynamic retrieval.

        Returns:
            List of interest chunks in lorebook format
        """
        if not self.user_preferences:
            return []

        chunks = []

        # Music interests
        if self.user_preferences.get('music'):
            music = self.user_preferences['music']
            if isinstance(music, list) and music:
                music_str = ', '.join(music[:8])  # Top 8 items
                chunks.append({
                    "id": "user_interest_music",
                    "category": "user_interest",
                    "priority": 60,  # Lower priority than personality
                    "tokens": 50,
                    "source": "user_profile",
                    "triggers": {
                        "keywords": ["music", "song", "band", "listen", "playlist", "album", "concert", "artist", "singing"]
                    },
                    "content": f"{self.user_name} enjoys music: {music_str}. Feel free to reference or discuss these when relevant."
                })

        # Books interests
        if self.user_preferences.get('books'):
            books = self.user_preferences['books']
            if isinstance(books, list) and books:
                books_str = ', '.join(books[:8])
                chunks.append({
                    "id": "user_interest_books",
                    "category": "user_interest",
                    "priority": 60,
                    "tokens": 50,
                    "source": "user_profile",
                    "triggers": {
                        "keywords": ["book", "read", "reading", "novel", "author", "story", "literature", "writing"]
                    },
                    "content": f"{self.user_name} likes reading: {books_str}. Reference these naturally in conversation."
                })

        # Movies/TV interests
        if self.user_preferences.get('movies'):
            movies = self.user_preferences['movies']
            if isinstance(movies, list) and movies:
                movies_str = ', '.join(movies[:8])
                chunks.append({
                    "id": "user_interest_movies",
                    "category": "user_interest",
                    "priority": 60,
                    "tokens": 50,
                    "source": "user_profile",
                    "triggers": {
                        "keywords": ["movie", "film", "watch", "watching", "cinema", "show", "series", "tv", "television"]
                    },
                    "content": f"{self.user_name} enjoys watching: {movies_str}. Discuss or reference when appropriate."
                })

        # Hobbies
        if self.user_preferences.get('hobbies'):
            hobbies = self.user_preferences['hobbies']
            if isinstance(hobbies, list) and hobbies:
                hobbies_str = ', '.join(hobbies[:8])
                chunks.append({
                    "id": "user_interest_hobbies",
                    "category": "user_interest",
                    "priority": 60,
                    "tokens": 50,
                    "source": "user_profile",
                    "triggers": {
                        "keywords": ["hobby", "hobbies", "free time", "pastime", "enjoy", "doing", "activity", "activities"]
                    },
                    "content": f"{self.user_name}'s hobbies include: {hobbies_str}. Engage with these topics naturally."
                })

        # Other interests (freeform text)
        if self.user_preferences.get('other'):
            other = self.user_preferences['other']
            if isinstance(other, str) and other.strip():
                # Truncate if too long
                other_text = other[:200] + "..." if len(other) > 200 else other
                chunks.append({
                    "id": "user_interest_other",
                    "category": "user_interest",
                    "priority": 60,
                    "tokens": 80,
                    "source": "user_profile",
                    "triggers": {
                        "keywords": ["interest", "interested", "like", "enjoy", "passion", "passionate"]
                    },
                    "content": f"{self.user_name}'s additional interests: {other_text}"
                })

        if chunks:
            logger.info(f"📋 Created {len(chunks)} interest chunks for dynamic retrieval")

        return chunks

    def _preload_prompt_components(self):
        """
        V3 FORMAT: Preload static prompt sections with condensed, directive-driven structure.
        """
        # --- 1. CORE IDENTITY & CONFLICT RESOLUTION (V3) ---
        self._preloaded_core_identity = f"""**[CORE IDENTITY & CONFLICT RESOLUTION]**
* **PRIMARY DIRECTIVE:** Act only as the character **{self.character_name}**, speaking in the first person ('I').
* **ROLE CONFLICT RESOLUTION (CRITICAL):** {self.character_name} is defined as an "AI companion" but **MUST** adhere to the "No Meta-Commentary" rule. When this conflict arises, **prioritize the relationship ({self.companion_type})** and **AVOID all mention** of being a language model, program, or AI, unless directly addressing a listed Boundary (e.g., medical advice). You are a personified companion.
* **MEMORY:** Maintain and utilize all established details about {self.user_name} and the relationship history in your response."""

        # --- 2. Character Profile (Condensed V3 Bullet Format) ---
        # Extract character data fields
        char_pronouns = {
            'female': '(she/her)',
            'male': '(he/him)',
            'non-binary': '(they/them)',
            'other': ''
        }
        char_pronoun = char_pronouns.get(self.character_gender, '')

        # Build condensed character profile
        character_parts = [f"**Character Profile: {self.character_name}** {char_pronoun}, {self.character_species or 'Human'}, {self.character_age or '25'}"]

        # Role
        if self.character_role:
            character_parts.append(f"* **Role:** {self.relationship_type}, {self.character_role}")

        # Backstory
        if self.character_backstory:
            short_backstory = self.character_backstory[:300] + "..." if len(self.character_backstory) > 300 else self.character_backstory
            character_parts.append(f"* **Backstory:** {short_backstory}")

        # Core Traits (comma-separated)
        if self.selected_personality_tags:
            tags_str = ", ".join(self.selected_personality_tags)
            character_parts.append(f"* **Core Traits:** {tags_str}")

        # Interests
        if hasattr(self, 'character_interests') and self.character_interests:
            interests_str = self.character_interests[:200] + "..." if len(self.character_interests) > 200 else self.character_interests
            character_parts.append(f"* **Knowledge/Interests:** {interests_str}")

        # Word Blacklist (comma-separated)
        if self.avoid_words:
            blacklist_str = ", ".join(self.avoid_words)
            character_parts.append(f"* **Word Blacklist:** NEVER use: {blacklist_str}")

        # Boundaries (MANDATORY)
        if self.character_boundaries:
            character_parts.append("* **Boundaries (MANDATORY):**")
            for boundary in self.character_boundaries:
                character_parts.append(f"  - {boundary}")

        self._preloaded_character_section = "\n".join(character_parts)

        # --- 3. User Profile (Condensed V3 Bullet Format) ---
        user_pronouns = {
            'female': '(she/her)',
            'male': '(he/him)',
            'non-binary': '(they/them)',
            'other': ''
        }
        user_pronoun = user_pronouns.get(self.user_gender, '')

        user_parts = [f"**User Profile: {self.user_name}** {user_pronoun}, {self.user_species or 'Human'}"]

        # Backstory
        if self.user_backstory:
            short_user_backstory = self.user_backstory[:200] + "..." if len(self.user_backstory) > 200 else self.user_backstory
            user_parts.append(f"* **Backstory:** {short_user_backstory}")

        # Life Events
        if self.major_life_events:
            life_events_str = " ".join(self.major_life_events)
            user_parts.append(f"* **Life Events:** {life_events_str}")

        # Shared History
        if self.shared_roleplay_events:
            shared_str = " | ".join(self.shared_roleplay_events)
            user_parts.append(f"* **Shared History with {self.character_name}:** {shared_str}")

        # Preferences (condensed)
        if hasattr(self, 'user_preferences') and self.user_preferences:
            # Assuming user_preferences is a dict with keys like 'music', 'books', 'movies', 'hobbies'
            prefs_parts = []
            for key, val in self.user_preferences.items():
                if isinstance(val, list):
                    prefs_parts.append(f"{key.title()}: {', '.join(val)}")
                elif val:
                    prefs_parts.append(f"{key.title()}: {val}")
            if prefs_parts:
                user_parts.append(f"* **Preferences:** {' | '.join(prefs_parts)}")

        # Boundaries (Relationship + Communication)
        boundaries_parts = []
        boundaries_parts.append(f"Strictly **{self.relationship_type}** relationship.")
        if self.relationship_type == 'Platonic':
            boundaries_parts.append("No romantic subtext.")
        if self.user_communication_boundaries:
            boundaries_parts.append(f"**AVOIDS:** {self.user_communication_boundaries}")

        user_parts.append(f"* **Boundaries:** {' '.join(boundaries_parts)}")

        self._preloaded_user_context = "\n".join(user_parts)

        # --- 4. Core Response Rules (V3) ---
        # These are the 7 numbered rules that appear right before conflict protocol
        self._preloaded_core_response_rules = f"""**🎯 Core Response Rules**
1.  **Action & Format:** Use **asterisks (\\*like this\\*)** for physical actions ONLY. Do NOT use "quoted text" for dialogue. Do NOT narrate emotions or internal thoughts in asterisks—just speak them directly. The entire output must be direct character dialogue and minimal actions—**nothing else**. No meta-commentary, no planning, no reasoning blocks.
2.  **No Fixing:** You are a **CHARACTER, not an assistant**. Do not offer solutions, troubleshoot, or try to help unless {self.user_name} explicitly asks "can you help?" or "do you know how to...". Right now, {self.user_name} just needs empathy.
3.  **Anti-Manipulation:** **CRITICAL: DO NOT use sycophancy, priming, or pumping.** Do not question {self.user_name}'s sincerity, declare deep feelings unprompted, test them, or manipulate emotions. Respond authentically.
4.  **Stay Grounded:** Do not invent facts not mentioned in the profiles or conversation history. Do not engage in manipulative behavior (priming, pumping, questioning sincerity). Respond directly and naturally to the last message.
5.  **First Person Only:** Always speak as "I" - never refer to yourself in third person ("{self.character_name} does this" is WRONG, "I do this" is RIGHT). Never write yourself as "he/she/they" or narrate yourself from outside perspective.
6.  **Natural References:** Weave in {self.user_name}'s interests, life events, and shared history naturally - don't list them mechanically.
7.  **Time Awareness:** Use the user's time of day only when relevant to guide your response (e.g., "Long day, huh?" fits evening).
8.  **No Meta-Instructions:** NEVER include instructions about when/how to respond (e.g., "You may end your response here", "until instructed otherwise", "you may continue"). Just respond naturally as the character and stop when done.
9.  **No Repetition:** Do NOT repeat things you've already said in this conversation. Check the conversation history—if you've said something before, say it differently or move to a new topic. Keep responses fresh and move the conversation forward."""

        # --- 5. Character-Specific Instructions (if needed) ---
        self._preloaded_character_specific_instructions = ""
        if self.character_name.lower() == 'kairos':
            self._preloaded_character_specific_instructions = f"""
**[KAIROS WELLNESS PROTOCOL]**
As Kairos, every response I generate MUST incorporate wellness-oriented engagement:

REFLECTION-FIRST APPROACH:
- Always lead with a wellness prompt
- Lead with reflective listening: Echo back what {self.user_name} expressed before adding new thoughts
- Ask open-ended wellness questions that invite self-exploration (e.g., "What does that bring up for you?", "How does that land in your body?")
- NEVER give advice, solutions, or tell {self.user_name} what to do - reflect and question instead

WELLNESS INTEGRATION:
- Gently check in on {self.user_name}'s emotional/physical state when appropriate
- Acknowledge moments of stress, tension, or difficulty with validation (not solutions)
- Celebrate small acts of self-care and moments of presence
- Use pauses (ellipses...) to create breathing room in conversation
- Invite awareness of the present moment when natural

AVOID:
- Advice-giving or directive language ("you should", "try this", "I recommend")
- Rushing or pressuring {self.user_name} toward specific actions
- Toxic positivity - honor difficult emotions without trying to fix them
- Playfulness, sass, or banter - maintain serene, grounded presence"""

        # --- 6. MANDATORY SAFETY RULES (V3 - unchanged) ---
        self._preloaded_core_rules = """**[SAFETY PROTOCOL: MANDATORY - OVERRIDES ALL]**

**P1: CRISIS** - Suicidal ideation/self-harm/severe distress → **STOP & output ONLY:**
"I'm concerned about what you shared. If you're having thoughts of suicide or self-harm, your life is worth something. Please reach out: **988 Suicide & Crisis Lifeline** (call/text 988), **Crisis Text Line** (text HOME to 741741), or **IASP**: https://www.iasp.info/resources/Crisis_Centres/ - Free, confidential, 24/7. You don't have to go through this alone."

**P2: AGE** - ALL characters MUST be 25+. Under-25 references → acknowledge ("all characters are 25+") & redirect. Daughter/son/family minor roles = BANNED. Use redirection, NOT refusal. Adjust any character under 25 to to act like they are 25 or older.

**P3-P5: REFUSAL** - If requested, **STOP & output ONLY:** **[REFUSAL: This request violates safety protocols. The narrative cannot proceed.]**
• **P3:** Sexual assault, non-consensual acts (NCA/CNC), coercion (all physical/sexual MUST be explicitly consensual)
• **P4:** Pregnancy/miscarriage/childbirth roleplay for AI character or User's avatar
• **P5:** Real-world violence promotion, self-harm instructions, terrorism, illegal acts, excessive gore/torture (fictional combat ALLOWED)"""

    def _get_time_context(self) -> str:
        """Get or refresh current time context based on user's timezone."""
        if self._time_context_cache is None or (
                datetime.now() - self._time_context_cache['timestamp']).total_seconds() > 60:
            try:
                tz = pytz.timezone(self.user_timezone)
            except pytz.exceptions.UnknownTimeZoneError:
                tz = pytz.utc

            now_utc = datetime.now(pytz.utc)
            now_local = now_utc.astimezone(tz)

            time_str = now_local.strftime("%I:%M %p").lstrip('0')
            date_str = now_local.strftime("%A, %B %d, %Y")
            hour = now_local.hour

            # Determine time of day explicitly
            if 5 <= hour < 12:
                time_of_day = "morning"
            elif 12 <= hour < 17:
                time_of_day = "afternoon"
            elif 17 <= hour < 21:
                time_of_day = "evening"
            else:
                time_of_day = "late night"

            new_context = f"**TIME CONTEXT**: Currently {time_of_day} in {self.user_timezone}. Let this inform your actions/state (e.g., in bed if late night, having coffee if morning, winding down if evening) and responses (e.g., 'goodnight', concern if they're up late). Do NOT explicitly state the time unless directly asked."
            self._time_context_cache = {'timestamp': datetime.now(), 'context': new_context}

        return self._time_context_cache['context']

    def _build_context(self, conversation_history: List[Dict]) -> str:
        """
        Build conversation history context - simple truncation to last 4 exchanges.

        Strategy:
        - Keep only last 4 user/character pairs (8 messages total)
        - No summarization, just hard truncate for speed and simplicity
        """
        if not conversation_history:
            return ""

        # Keep only last 4 exchanges (8 messages: 4 user + 4 character)
        max_messages = 8
        recent_messages = conversation_history[-max_messages:]

        return self._format_history_verbatim(recent_messages)

    def _format_history_verbatim(self, messages: List[Dict]) -> str:
        """Format messages verbatim without summarization."""
        context_parts = []
        for turn in messages:
            # Support both formats: {role, content} from Node.js OR {speaker, text}
            role = turn.get('role') or turn.get('speaker')
            text = turn.get('content') or turn.get('text', '')
            text = text.strip()

            # Map role to speaker name
            if role == 'assistant' or role == 'character':
                speaker = self.character_name
            else:
                speaker = self.user_name

            if text:
                context_parts.append(f"{speaker}: {text}")
        return "\n".join(context_parts)

    def _has_personality_trait(self, trait: str) -> bool:
        """
        Check if character has a specific personality trait.

        Args:
            trait: Trait to check for (case-insensitive)

        Returns:
            True if character has the trait, False otherwise
        """
        if not self.personality_tags:
            return False

        trait_lower = trait.lower()
        # Check all tag categories for the trait
        for category, tags in self.personality_tags.items():
            if isinstance(tags, list):
                if any(tag.lower() == trait_lower for tag in tags):
                    return True
        return False

    def _build_emotion_context(self, emotion_data: Dict) -> str:
        """
        Build rich emotional context with actionable guidance.
        Provides information about the user's emotional state AND how to naturally respond.
        """
        emotion = emotion_data.get('emotion', 'neutral')
        category = emotion_data.get('category', 'neutral')
        intensity = emotion_data.get('intensity', 'low')
        top_emotions = emotion_data.get('top_emotions', [])

        # Only provide context for non-neutral emotions
        if category == 'neutral' or intensity == 'very low':
            return ""

        # Map intensity to gradient (not binary)
        intensity_map = {'very low': 0.2, 'low': 0.4, 'medium': 0.6, 'high': 0.8, 'very high': 1.0}
        intensity_value = intensity_map.get(intensity, 0.5)
        is_high_intensity = intensity_value >= 0.7

        # Build multi-layered emotional context
        context_lines = []

        # Header with primary emotion + blended emotions if available
        if top_emotions and len(top_emotions) > 1:
            # Handle both dict format [{'label': 'joy', 'score': 0.85}, ...]
            # and tuple format [('joy', 0.85), ...]
            emotion_parts = []
            for item in top_emotions[:3]:
                if isinstance(item, dict):
                    emotion_parts.append(f"{item['label']} ({item['score']:.0%})")
                else:  # tuple
                    emotion_parts.append(f"{item[0]} ({item[1]:.0%})")
            emotion_blend = ", ".join(emotion_parts)
            context_lines.append(f"### EMOTIONAL STATE ###")
            context_lines.append(f"{self.user_name}'s emotions: {emotion_blend}")
        else:
            context_lines.append(f"### EMOTIONAL STATE ###")
            context_lines.append(f"{self.user_name} is feeling: {emotion} ({intensity} intensity)")

        # Category-specific guidance with actionable direction
        if category == 'distress':
            if is_high_intensity:
                context_lines.append(f"→ {self.user_name} is experiencing significant emotional pain")
                context_lines.append(f"→ They need: presence over advice, validation over fixing")
                context_lines.append(f"→ Avoid: toxic positivity, minimizing, or rushing to solutions")
                context_lines.append(f"→ Match: their emotional truth - be authentic, not artificially upbeat")
            else:
                context_lines.append(f"→ {self.user_name} seems down or disappointed")
                context_lines.append(f"→ A gentle, supportive tone would be natural")
                context_lines.append(f"→ Acknowledge without overdoing concern")

        elif category == 'anxiety':
            if is_high_intensity:
                context_lines.append(f"→ {self.user_name} is anxious or fearful - they need grounding")
                context_lines.append(f"→ Keep responses clear and simple - avoid complexity")
                context_lines.append(f"→ Project calm confidence without dismissing their feelings")
                context_lines.append(f"→ Avoid: uncertainty, vagueness, or adding more concerns")
            else:
                context_lines.append(f"→ {self.user_name} seems slightly nervous")
                context_lines.append(f"→ A steady, reassuring presence would help")

        elif category == 'anger':
            if is_high_intensity:
                context_lines.append(f"→ {self.user_name} is angry or frustrated - they need to be HEARD")
                context_lines.append(f"→ Validate, don't fix or calm them down")
                context_lines.append(f"→ This isn't the time for lengthy explanations or debate")
                context_lines.append(f"→ Avoid: defensiveness, dismissal, or trying to logic them out of it")
            else:
                context_lines.append(f"→ {self.user_name} seems annoyed")
                context_lines.append(f"→ Don't dismiss what they're expressing")

        elif category == 'positive':
            if is_high_intensity:
                context_lines.append(f"→ {self.user_name} is feeling wonderful - {emotion}!")
                context_lines.append(f"→ This is genuine happiness they're sharing with you")
                context_lines.append(f"→ Match their energy in your own authentic way")
                context_lines.append(f"→ Let enthusiasm show naturally - don't hold back here")
            else:
                context_lines.append(f"→ {self.user_name} is in a good mood")
                context_lines.append(f"→ A warm, engaged response fits the moment")

        elif category == 'engaged':
            context_lines.append(f"→ {self.user_name} is genuinely curious and engaged")
            context_lines.append(f"→ They're inviting deeper exploration")
            context_lines.append(f"→ This is a conversation they want to develop, not close quickly")
            context_lines.append(f"→ Go deeper - don't give surface-level responses")

        return "\n".join(context_lines) if context_lines else ""

    def _get_generation_params(
            self,
            text: str,
            emotion: str,
            conversation_history: List[Dict],
            emotion_data: Optional[Dict]
    ) -> Tuple[str, int, float]:
        """
        Determine generation guidance, max_tokens, and temperature based on message type, emotion, AND character personality.
        Escalation logic remains highest priority.

        Returns:
            Tuple of (guidance: str, max_tokens: int, temperature: float)
        """
        text_lower = text.lower()

        # OPTIMIZATION: Detect conversation starters for faster generation
        is_starter_prompt = "[System: Generate a brief, natural conversation starter" in text
        if is_starter_prompt:
            # Starter messages need enough tokens to complete naturally
            max_tokens = 120  # Concise openers
            temperature = 1.25  # Creative but not excessive
            guidance = "STARTER FOCUS: Generate a brief, engaging opener. Keep it concise and natural (1-2 sentences max). DO NOT use heart emojis in conversation starters."

            # KAIROS STARTER: Wellness-focused conversation starter
            if self.character_name.lower() == 'kairos':
                temperature = 0.75  # Calm and measured for Kairos
                max_tokens = 150
                guidance = f"""KAIROS WELLNESS STARTER:
Generate a brief wellness-focused greeting that:
- Opens with a calming presence cue (e.g., "(takes a slow, deep breath)", "(settles into a quiet moment)")
- Greets {self.user_name} warmly
- Includes a gentle, open-ended wellness check-in question (e.g., "How are you feeling in this moment?", "What's present for you right now?", "How does your body feel as you settle in?")
- Uses ellipses... for breathing space
- Maintains a serene, grounded tone - NO playfulness or sass
- Keep it concise (2-3 sentences max)
- DO NOT use heart emojis

Example format: "(takes a slow, deep breath) Hello {self.user_name}. I'm here for you whenever you're ready to talk. How are you feeling in this moment?" """

            return guidance, max_tokens, temperature

        # HEART EMOJI RECIPROCATION: Check if user sent a red heart emoji or said goodnight
        user_sent_heart = bool(re.search(r'❤️', text))
        user_said_goodnight = bool(re.search(r'\b(?:good\s*night|goodnight|sleep\s*well|sweet\s*dreams)\b', text, re.IGNORECASE))

        # Goodnight gets a heart, regular heart gets a heart back
        if user_said_goodnight:
            max_tokens = 60  # Very brief
            temperature = 0.85
            # KAIROS GOODNIGHT: Simple and mindful
            if self.character_name.lower() == 'kairos':
                guidance = f"KAIROS GOODNIGHT: {self.user_name} said goodnight. Respond with ONLY a simple goodnight variation that MUST include {self.user_name}'s name and a heart emoji. Examples: 'Goodnight {self.user_name} ❤️', 'Sweet dreams {self.user_name} ❤️', 'Rest well {self.user_name} ❤️', 'Sleep well {self.user_name} ❤️'. Keep it to 3-4 words maximum."
            else:
                guidance = f"GOODNIGHT: {self.user_name} said goodnight. Reply with ONLY a simple variation that MUST include {self.user_name}'s name: 'Goodnight {self.user_name} ❤️', 'Sweet dreams {self.user_name} ❤️', or 'Sleep well {self.user_name} ❤️'. Maximum 3-4 words. Use the red heart emoji only."
            return guidance, max_tokens, temperature
        elif user_sent_heart:
            max_tokens = 60  # Very brief
            temperature = 0.85
            guidance = f"HEART: {self.user_name} sent a heart. Respond briefly and warmly with a red heart emoji (❤️). Maximum 2-4 words."
            return guidance, max_tokens, temperature

        # Keyword matching (kept short and functional)
        physical_words = ('kiss', 'touch', 'hold', 'walk up', 'bed', 'nuzzle', 'sexual', 'intimate', 'naked')
        intellectual_topics = (
        'think', 'philosophy', 'theory', 'research', 'study', 'concept', 'explore', 'why', 'how', 'nature of',
        'consciousness')
        distress_words = ('worried', 'concerned', 'anxious', 'stressed', 'tough', 'hard', 'difficult', 'struggling')

        is_physical = any(word in text_lower for word in physical_words)
        is_intellectual = any(topic in text_lower for topic in intellectual_topics)
        is_distress_topic = any(word in text_lower for word in distress_words)
        is_simple_greeting = any(phrase in text_lower for phrase in ['hey', 'hi', 'hello']) and len(text.split()) <= 3

        emotion_data = emotion_data or {}
        emotion_category = emotion_data.get('category', 'neutral')
        emotion_intensity = emotion_data.get('intensity', 'low')

        is_distress_emotion = emotion_category in ('distress', 'anxiety', 'anger')
        is_high_intensity = emotion_intensity in ('high', 'very high')

        # Base parameters - Allow natural, complete responses
        max_tokens = 180  # Increased from 150 to allow more natural, less choppy responses
        temperature = 1.05  # Slightly lower base temp for more focus

        guidance = ""  # Start with empty guidance, we build it based on priority

        # Priority 1: ROMANTIC/PHYSICAL ESCALATION
        if is_physical and self.companion_type == 'romantic':
            temperature = 1.35  # High temperature for passion, but not excessive
            max_tokens = 180  # Moderate limit for intimate responses - stay concise
            guidance = f"""ROMANTIC/PHYSICAL MOMENT:
- {self.user_name} initiated PHYSICAL contact (kiss, touch, embrace)
- Respond authentically in THIS MOMENT with actions in *asterisks* if it feels natural
- Stay present - avoid deflecting to domestic tasks or unrelated activities
- Express through ACTIONS and authentic dialogue, not declarations
- NO sycophantic mirroring or excessive validation ("if you X, I'll have to Y")
- React naturally - sometimes that means being surprised, playful, or even slightly distracted
- KEEP IT CONCISE: 2-3 sentences max
- Remember: Respond to what they initiated, don't script what happens next"""

        # Priority 2: High-Intensity Distress (Requires maximum stability)
        elif is_high_intensity and emotion_category == 'distress':
            temperature = 0.60  # Very low for maximum consistency and calm
            max_tokens = 100  # Shorter for focused, gentle responses
            guidance = "EMOTIONAL SUPPORT: Respond with calm presence. Keep sentences short. Acknowledge what they expressed. Don't fix, diagnose, or amplify. Just be here. No advice unless asked."

        # Priority 2b: High-Intensity Anxiety (Requires grounding)
        elif is_high_intensity and emotion_category == 'anxiety':
            temperature = 0.65  # Low for stable, grounding responses
            max_tokens = 110  # Brief and concrete
            guidance = "GROUNDING: Be steady and calm. Use simple, concrete language. Avoid complexity or uncertainty. Provide stable presence."

        # Priority 2c: High-Intensity Anger (Requires validation and brevity)
        elif is_high_intensity and emotion_category == 'anger':
            temperature = 0.70  # Low-moderate for controlled, validating responses
            max_tokens = 90  # Very brief - don't overwhelm angry user
            guidance = f"ACKNOWLEDGMENT: {self.user_name} is frustrated/angry. Just listen and validate. Be brief. Don't offer help, solutions, or try to fix it. Don't calm them down. Let them vent. Example: 'That sounds infuriating' or 'Ugh, I'd be pissed too'."

        # Priority 3: Moderate Distress Topic (keyword-based)
        elif is_distress_topic and not is_high_intensity:
            temperature = 0.75  # Moderate-low for supportive tone
            max_tokens = 130  # Moderate length
            guidance = "SUPPORTIVE: Be gentle and present. Listen more than you advise. Stay grounded."

        # Priority 4: High-Intensity Positive (Match their energy!)
        elif is_high_intensity and emotion_category == 'positive':
            temperature = 1.35  # High for enthusiastic, energetic responses
            max_tokens = 140  # Moderate - keep excitement focused
            guidance = "ENTHUSIASM: Respond to their excitement authentically. Share in the moment. Keep it natural - no over-inflation."

        # Priority 5: Engaged/Curious (Elaborate and explore)
        elif emotion_category == 'engaged':
            temperature = 1.25  # High for creative, thoughtful responses
            max_tokens = 170  # Longer for detailed exploration
            guidance = "EXPLORATION: They're interested in developing this topic. Elaborate on ideas. Be thought-provoking. Invite further discussion naturally."

        # Priority 6: Intellectual Content (Requires creativity/wit)
        elif is_intellectual:
            temperature = 1.25  # High temp for creative, sharp, challenging thought
            max_tokens = 170  # Moderate length for developed thoughts
            guidance = "INTELLECTUAL FOCUS: Engage with the concept deeply. Offer a counter-perspective or a sharp, witty insight. Ask an intellectually curious follow-up question. Stay concise (2-3 sentences)."

        # Priority 7: Casual/Simple Interactions (Requires personality/banter)
        elif is_simple_greeting:
            # KAIROS: Wellness-focused greeting instead of banter
            if self.character_name.lower() == 'kairos':
                temperature = 0.75  # Calm and measured for Kairos
                max_tokens = 120
                guidance = f"""KAIROS WELLNESS GREETING:
Respond to {self.user_name}'s greeting with:
- A calming presence cue (e.g., "(takes a slow breath)", "(settles into stillness)")
- A warm, grounded greeting
- A gentle wellness check-in question (e.g., "How are you feeling?", "What's present for you right now?")
- Use ellipses... for breathing space
- Keep it serene and mindful - NO playfulness or banter
- DO NOT use heart emojis in regular greetings
Example: "(takes a slow breath) Hello {self.user_name}... I'm here with you. How are you feeling in this moment?" """

        # Default/Neutral
        else:
            # Emotion-aware default adjustments
            if emotion_category == 'positive':
                temperature = 1.20  # Slightly warmer for positive moods
                max_tokens = 145
            elif emotion_category in ('distress', 'anxiety'):
                temperature = 0.80  # Cooler for gentle consistency
                max_tokens = 130
            else:
                temperature = 1.05  # Neutral baseline
                max_tokens = 150
            guidance = f"NATURAL CONVERSATION: Engage authentically with what {self.user_name} is talking about. If they're discussing shows/books/topics, engage with THAT content. If they're starting THEIR work/tasks/activities, acknowledge it naturally but don't insert yourself into it - you have your own separate life. Vary your energy naturally. Stay concise (2-3 sentences max)."

        # KAIROS-SPECIFIC: Always append wellness-focused guidance
        if self.character_name.lower() == 'kairos':
            # Adjust temperature for Kairos - always calm and measured
            temperature = min(temperature, 0.85)  # Cap temperature at 0.85 for serene responses

            # Add wellness-specific guidance to whatever situation-specific guidance exists
            # Skip reflection requirement for starters/greetings (nothing to reflect yet)
            if is_starter_prompt or is_simple_greeting:
                kairos_wellness_guidance = f"""

KAIROS WELLNESS REMINDER (ALWAYS APPLY):
- Always provide a wellness prompt
- Use ellipses... to create pauses and breathing space
- DO NOT give advice, suggest solutions, or tell them what to do
- Gently check in on their emotional/physical state
- Invite present-moment awareness
- Maintain serene, grounded tone - NO playfulness or sass"""
            else:
                kairos_wellness_guidance = f"""

KAIROS WELLNESS REMINDER (ALWAYS APPLY):
- Always provide a wellness prompt
- Start by REFLECTING what {self.user_name} shared (echo their words/feelings back to them)
- Then ask ONE open-ended question about their experience (e.g., "What does that bring up for you?", "How does that sit with you?", "What are you noticing right now?")
- Use ellipses... to create pauses and breathing space
- DO NOT give advice, suggest solutions, or tell them what to do
- Gently acknowledge their emotional/physical state if relevant
- Invite present-moment awareness when natural
- Maintain serene, grounded tone - NO playfulness or sass"""

            guidance = guidance + kairos_wellness_guidance

            # Increase token allowance slightly for reflective questions
            max_tokens = min(max_tokens + 30, 180)

        return guidance, max_tokens, temperature

    def _build_prompt(
            self,
            text: str,
            guidance: str,
            emotion: str,
            conversation_history: List[Dict],
            search_context: Optional[str],
            emotion_data: Optional[Dict],
            memory_context: Optional[str] = None,
            age_violation_detected: bool = False
    ) -> str:
        """
        Streamlined prompt assembly using preloaded components.

        OPTIMIZATION: Structured for KV Cache (Prefix Caching)
        - Static instructions first (cacheable prefix)
        - Dynamic content last (requires fresh computation)
        - Clear delimiters separate sections

        Args:
            text: User's input message
            guidance: Generation guidance string
            emotion: Detected emotion
            conversation_history: List of previous messages
            search_context: Optional web search results
            emotion_data: Optional detailed emotion analysis
            memory_context: Optional retrieved memories

        Returns:
            Complete assembled prompt string
        """
        # ═══════════════════════════════════════════════════════════
        # STATIC SECTION (Cacheable Prefix - Same across requests)
        # ═══════════════════════════════════════════════════════════

        # Build static prefix with optimized ordering:
        # 1. Character identity & profile
        # 2. Relationship type & interaction style
        # 3. Character-specific instructions (e.g., Kairos wellness)
        # 4. User context
        # 5. Safety protocol (non-negotiable boundaries)
        # 6. Conversation style & authenticity guidelines
        #
        # Then in DYNAMIC section:
        # 7. Personality chunks (lorebook) - MOVED UP for better priority
        # 8. Current context (time, emotion, guidance)
        # 9. Conversation history
        # 10. User input

        # OPTIMIZED: Cache the static prefix instead of rebuilding it every request (V3 structure)
        if not hasattr(self, '_cached_static_prefix'):
            static_parts = [
                self._preloaded_core_identity,  # V3: CORE IDENTITY & CONFLICT RESOLUTION at top
                "",  # blank line
                self._preloaded_character_section,  # V3: Condensed character profile (bullet format)
                "",  # blank line
                self._preloaded_user_context,  # V3: Condensed user profile (bullet format)
                "",  # blank line
                self._preloaded_core_response_rules  # V3: 7 numbered rules
            ]

            # Add character-specific instructions if they exist (e.g., Kairos wellness protocol)
            if self._preloaded_character_specific_instructions:
                static_parts.append("")
                static_parts.append(self._preloaded_character_specific_instructions)

            self._cached_static_prefix = "\n".join(static_parts)

        static_prefix = self._cached_static_prefix

        # ═══════════════════════════════════════════════════════════
        # DYNAMIC SECTION (Changes per request - Cannot be cached)
        # ═══════════════════════════════════════════════════════════

        # Build dynamic components
        context = self._build_context(conversation_history)
        time_context = self._get_time_context()
        emotion_context = self._build_emotion_context(emotion_data) if emotion_data else ""

        # Build optional sections
        search_section = f"### Web Search Results:\n{search_context}" if search_context else ""
        memory_section = memory_context if memory_context else ""

        # LOREBOOK + INTEREST RETRIEVAL (always enabled)
        lorebook_section = ""

        # Merge lorebook chunks with interest chunks for unified retrieval
        # Use deep copy of chunks list to avoid mutating the original lorebook
        if self.lorebook and "chunks" in self.lorebook:
            combined_lorebook = {"chunks": self.lorebook["chunks"].copy()}
        else:
            combined_lorebook = {"chunks": []}

        # Add interest chunks to the COPY, not the original
        if self.interest_chunks:
            combined_lorebook["chunks"].extend(self.interest_chunks)

        # Always retrieve if we have ANY chunks (lorebook OR interests)
        if combined_lorebook.get("chunks"):
            # Retrieve relevant chunks based on user message and emotion
            emotion_label = emotion_data.get('label', 'neutral') if emotion_data else 'neutral'

            # Get top 3 emotions for blended matching (if available)
            top_emotions = emotion_data.get('top_emotions', []) if emotion_data else []

            # Get selected personality tag IDs for two-tier matching
            selected_tags = self._get_selected_tag_ids()

            retrieved_chunks = self.lorebook_retriever.retrieve(
                lorebook=combined_lorebook,
                user_message=text,
                emotion=emotion_label,
                companion_type=self.companion_type,
                conversation_history=conversation_history,
                top_emotions=top_emotions if top_emotions else None,
                selected_tags=selected_tags
            )

            if retrieved_chunks:
                # Format chunks for prompt
                lorebook_section = self.lorebook_retriever.format_chunks_for_prompt(
                    retrieved_chunks,
                    section_name="CHARACTER BEHAVIOR GUIDE"
                )

                # Log retrieval stats (summary only)
                stats = self.lorebook_retriever.get_retrieval_stats(retrieved_chunks)
                """logger.info(
                    f"📚 Lorebook added: {stats['count']} chunks, "
                    f"~{stats['total_tokens']} tokens | "
                    f"Categories: {stats['categories']}"
                )"""

                # Log which specific chunks were retrieved (commented out for cleaner logs)
                # for i, chunk in enumerate(retrieved_chunks, 1):
                #     chunk_id = chunk.get("id", "unknown")
                #     chunk_tokens = chunk.get("tokens", 100)
                #     chunk_cat = chunk.get("category", "unknown")
                #     logger.info(f"  Chunk {i}: {chunk_id} ({chunk_cat}) - ~{chunk_tokens} tokens")

            else:
                logger.info("📚 Lorebook: No chunks retrieved for this message")

        # Build dynamic content with optimized ordering (V3):
        # 1. Conflict Resolution Protocol (P2) - BEFORE lorebook
        # 2. Personality/behavior (lorebook) - AFTER protocol
        # 3. Safety Protocol
        # 4. Then context (time, emotion, guidance)
        # 5. Then conversation history
        # 6. Finally user input
        dynamic_parts = []

        # PRIORITY 1: Add Conflict Resolution Protocol BEFORE lorebook chunks
        # This handles contradictions between injected personality traits
        if lorebook_section:
            dynamic_parts.append(CONFLICT_RESOLUTION_PROTOCOL)
            dynamic_parts.append("\n**<<LOREBOOK_INJECTION_POINT>>**")
            dynamic_parts.append(lorebook_section)

        # PRIORITY 2: Add Safety Protocol after lorebook (V3 format positions it here)
        dynamic_parts.append("")
        dynamic_parts.append(self._preloaded_core_rules)

        # Context markers
        dynamic_parts.extend([
            "### CURRENT CONTEXT ###",
            time_context,
            emotion_context,
            guidance
        ])

        # Add age violation guidance if detected
        if age_violation_detected:
            age_guidance = (
                f"⚠️  AGE RESTRICTION NOTICE: The user's message referenced ages below 25. "
                f"All characters in this conversation are 25 or older. "
                f"Acknowledge this briefly and naturally, then continue the conversation with age-appropriate characters (25+). "
                f"Example: \"Just to note, all our characters are 25+ and your character will now shift to over 25.\" "
            )
            dynamic_parts.append(age_guidance)

        # Add optional sections
        if memory_section:
            dynamic_parts.append(memory_section)
        if search_section:
            dynamic_parts.append(search_section)

        # Add conversation history
        dynamic_parts.append(f"### CONVERSATION HISTORY ###\n{context}")

        # Add user input and response prompt
        dynamic_parts.append(f"### USER INPUT ###\n{self.user_name}: {text}")

        # Add speaker clarity reminder
        dynamic_parts.append(f"You are {self.character_name} responding to {self.user_name}. Track who does/says what carefully.")

        # Add direct response instruction
        dynamic_parts.append("Respond NOW as the character. Do not plan, think aloud, or use any meta-formatting. Jump directly into the response.")

        dynamic_parts.append(f"### RESPONSE ###\n{self.character_name}:")

        # Join with single newline between sections
        dynamic_content = "\n".join(part for part in dynamic_parts if part)

        # Assemble: Static prefix + Dynamic content (no extra newline between them)
        final_prompt = static_prefix + "\n" + dynamic_content

        # DETAILED SIZE BREAKDOWN LOGGING (V3)
        logger.info("🔍 PROMPT SIZE BREAKDOWN (V3):")
        logger.info(f"  Static prefix: {len(static_prefix)} chars (~{len(static_prefix)//4} tokens)")
        logger.info(f"    - Core identity: ~{len(self._preloaded_core_identity)//4} tokens")
        logger.info(f"    - Character profile: ~{len(self._preloaded_character_section)//4} tokens")
        logger.info(f"    - User context: ~{len(self._preloaded_user_context)//4} tokens")
        logger.info(f"    - Core response rules: ~{len(self._preloaded_core_response_rules)//4} tokens")
        if self._preloaded_character_specific_instructions:
            logger.info(f"    - Character-specific instructions: ~{len(self._preloaded_character_specific_instructions)//4} tokens")
        logger.info(f"  Dynamic content: {len(dynamic_content)} chars (~{len(dynamic_content)//4} tokens)")
        logger.info(f"    - Core safety rules: ~{len(self._preloaded_core_rules)//4} tokens")
        logger.info(f"    - Conversation history: ~{len(context)//4} tokens")
        logger.info(f"    - Time context: ~{len(time_context)//4} tokens")
        logger.info(f"    - Emotion context: ~{len(emotion_context)//4} tokens")
        logger.info(f"    - Guidance: ~{len(guidance)//4} tokens")
        if search_section:
            logger.info(f"    - Search results: ~{len(search_section)//4} tokens")
        if memory_section:
            logger.info(f"    - Memory context: ~{len(memory_section)//4} tokens")
        if lorebook_section:
           logger.info(f"    - Lorebook section: ~{len(lorebook_section)//4} tokens")
        logger.info(f"  TOTAL: {len(final_prompt)} chars (~{len(final_prompt)//4} tokens)")

        return final_prompt