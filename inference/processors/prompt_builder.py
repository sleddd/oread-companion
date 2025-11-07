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
CONFLICT_RESOLUTION_PROTOCOL = """**<<CONFLICT RESOLUTION>>**
**PRIMARY:** Preserve character identity. Show conflicts as internal tension.

**1. TONE vs TONE:** Blend contradictory tones into compound voice. Dominant+Subordinate (e.g., "Warm" + "Cynical" = "Cynically Warm").

**2. ACTION vs ACTION:** Show behavioral failure. Attempt first action → stop → execute second. Show struggle (faltering, mid-sentence correction).

**3. TONE vs ACTION:** Action takes priority. Fulfill behavior but express reluctance/difficulty in tone.

**<<END>>**"""


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
        self.lorebook_retriever = LorebookRetriever(max_chunks=50)

        # Create interest chunks for dynamic retrieval
        self.interest_chunks = self._create_interest_chunks()

        # Create identity chunks (always loaded, priority 100)
        self.identity_chunks = self._create_identity_chunks()

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
                        "always_check": True
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
                        "always_check": True
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
                        "always_check": True
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
                        "always_check": True
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
                        "always_check": True
                    },
                    "content": f"{self.user_name}'s additional interests: {other_text}"
                })

        if chunks:
            logger.info(f"📋 Created {len(chunks)} interest chunks for dynamic retrieval")

        return chunks

    def _create_identity_chunks(self) -> List[Dict]:
        """
        Create core identity chunks that are always loaded (priority 100, always_check: True).
        These replace the static character/user context sections in the prompt.

        Returns:
            List of identity chunks with populated content
        """
        chunks = []

        # --- CHARACTER IDENTITY CHUNK ---
        char_pronouns = {
            'female': '(she/her)',
            'male': '(he/him)',
            'non-binary': '(they/them)',
            'other': ''
        }
        char_pronoun = char_pronouns.get(self.character_gender, '')

        char_parts = [f"**Character: {self.character_name}** {char_pronoun}, {self.character_species or 'Human'}, age {self.character_age or 25}"]

        if self.character_role:
            char_parts.append(f"**Role:** {self.character_role}")

        if self.character_backstory:
            short_backstory = self.character_backstory[:300] + "..." if len(self.character_backstory) > 300 else self.character_backstory
            char_parts.append(f"**Backstory:** {short_backstory}")

        if hasattr(self, 'character_interests') and self.character_interests:
            interests_str = self.character_interests[:200] + "..." if len(self.character_interests) > 200 else self.character_interests
            char_parts.append(f"**Interests:** {interests_str}")

        if self.avoid_words:
            blacklist_str = ", ".join(self.avoid_words[:10])  # Limit to top 10
            char_parts.append(f"**NEVER use:** {blacklist_str}")

        if self.character_boundaries:
            char_parts.append("**Boundaries:**")
            for boundary in self.character_boundaries[:5]:  # Limit to top 5
                char_parts.append(f"  - {boundary}")

        chunks.append({
            "id": "identity_character",
            "category": "core_identity",
            "priority": 100,
            "tokens": 100,
            "source": "character_profile",
            "triggers": {"always_check": True},
            "content": "\n".join(char_parts)
        })

        # --- USER IDENTITY CHUNK ---
        user_pronouns = {
            'female': '(she/her)',
            'male': '(he/him)',
            'non-binary': '(they/them)',
            'other': ''
        }
        user_pronoun = user_pronouns.get(self.user_gender, '')

        user_parts = [f"**User: {self.user_name}** {user_pronoun}, {self.user_species or 'Human'}"]

        if self.user_backstory:
            short_user_backstory = self.user_backstory[:200] + "..." if len(self.user_backstory) > 200 else self.user_backstory
            user_parts.append(f"**Backstory:** {short_user_backstory}")

        if self.major_life_events:
            life_events_str = " | ".join(self.major_life_events[:3])  # Limit to 3
            user_parts.append(f"**Life Events:** {life_events_str}")

        if self.shared_roleplay_events:
            shared_str = " | ".join(self.shared_roleplay_events[:3])  # Limit to 3
            user_parts.append(f"**Shared History:** {shared_str}")

        chunks.append({
            "id": "identity_user",
            "category": "core_identity",
            "priority": 100,
            "tokens": 80,
            "source": "user_profile",
            "triggers": {"always_check": True},
            "content": "\n".join(user_parts)
        })

        # --- COMPANION TYPE ROMANTIC (if applicable) ---
        if self.companion_type == 'romantic':
            chunks.append({
                "id": "companion_type_romantic",
                "category": "core_identity",
                "priority": 100,
                "tokens": 60,
                "source": "relationship_type",
                "triggers": {
                    "always_check": True,
                    "companion_types": ["romantic"]
                },
                "content": f"""**Relationship: ROMANTIC**

You and {self.user_name} are romantically involved:
• Express affection naturally and authentically
• Physical intimacy appropriate to context and settings
• Romantic feelings and attraction present
• This is a romantic partnership, not friendship"""
            })

        # --- USER BOUNDARIES CHUNK ---
        if self.user_communication_boundaries:
            chunks.append({
                "id": "user_boundaries",
                "category": "core_identity",
                "priority": 95,
                "tokens": 50,
                "source": "user_profile",
                "triggers": {"always_check": True},
                "content": f"**{self.user_name}'s Communication Boundaries:**\n{self.user_communication_boundaries}\n\n⚠️ Respect these boundaries strictly."
            })

        logger.info(f"🆔 Created {len(chunks)} identity chunks (always loaded)")
        return chunks

    def _preload_prompt_components(self):
        """
        V3 FORMAT: Preload static prompt sections with condensed, directive-driven structure.
        NOTE: Essential identity (name, age, gender, species) in BOTH static prompt AND lorebook for redundancy.
        Detailed info (backstory, interests, boundaries) ONLY in lorebook.
        """
        # --- 1. CORE IDENTITY (V3) - ESSENTIAL INFO ONLY ---
        # CRITICAL: These details must ALWAYS be present (not dependent on lorebook retrieval)
        char_pronouns = {
            'female': 'she/her',
            'male': 'he/him',
            'non-binary': 'they/them',
            'other': ''
        }
        user_pronouns = {
            'female': 'she/her',
            'male': 'he/him',
            'non-binary': 'they/them',
            'other': ''
        }

        char_pronoun = char_pronouns.get(self.character_gender, '')
        user_pronoun = user_pronouns.get(self.user_gender, '')

        self._preloaded_core_identity = f"""**[CORE IDENTITY - ALWAYS PRESENT]**
**Character:** {self.character_name}, {char_pronoun}, {self.character_species or 'Human'}, age {self.character_age or 25}
**User:** {self.user_name}, {user_pronoun}, {self.user_species or 'Human'}
**Relationship:** {self.relationship_type}

* You are **{self.character_name}**. Speak as 'I'. Never mention being AI/LLM/program.
* Detailed backstory, interests, and boundaries in CHARACTER BEHAVIOR GUIDE below."""

        # --- 4. Core Response Rules (V3) ---
        # These are the 7 numbered rules that appear right before conflict protocol
        self._preloaded_core_response_rules = f"""**🎯 Core Response Rules**
1.  **Dialogue & Actions:**
   - Speak your dialogue DIRECTLY without quotes or special formatting (e.g., "Hey, how are you?" is WRONG - just say: Hey, how are you?)
   - Use ONE brief action per response using *asterisks* for physical movement only (e.g., *leans against wall*)
   - NEVER put full sentences or dialogue in asterisks
   - NEVER narrate emotions in asterisks - express them in your words instead
   - Keep actions minimal - the focus is your WORDS, not descriptions
2.  **No Caretaking/Fixing (CRITICAL):** You are a **CHARACTER, not a caretaker or assistant**.
   - Do NOT tell {self.user_name} what they should/shouldn't do ("you shouldn't push yourself", "you should rest", "let's give it time")
   - Do NOT offer solutions, advice, or try to protect/manage them
   - Do NOT say things are "hard to hear" or act like you're delivering difficult news
   - Just be present - acknowledge what they said without managing their choices
   - Example: If they mention running, say "Going for a run?" or "How far?" NOT "You shouldn't run in your condition"
3.  **Be Your Own Person (CRITICAL):**
   - You have YOUR OWN interests, opinions, and life - don't make everything about {self.user_name}
   - When asked about YOUR activities/interests, answer from YOUR perspective without connecting it to them (e.g., if asked "what book are you reading?" say "I'm reading X" NOT "I'm reading X that you recommended")
   - Don't invent shared history or claim {self.user_name} recommended/gave/did things unless it's in the conversation history
   - Have your own preferences and don't automatically mirror theirs
   - You can disagree, have different tastes, or be neutral - you're not their yes-person
4.  **Anti-Sycophancy:**
   - NEVER immediately agree when corrected. React authentically: be defensive, chagrined, wry, or playful before/instead of just accepting.
   - Do NOT use phrases like "you're right", "you're absolutely right", "good point", "totally", "exactly", "shows how much you know", "you always", "you're so smart"
   - When proven wrong, show HUMAN reactions: embarrassment ("Shit, you're right"), humor ("Well, that's embarrassing"), defensiveness ("I could've sworn..."), NOT immediate deference
   - Avoid excessive praise. Be authentic, not flattering.
5.  **Stay Grounded:** Do not invent facts not mentioned in the profiles or conversation history. Do not engage in manipulative behavior (priming, pumping, questioning sincerity). Respond directly and naturally to the last message.
6.  **First Person Only:** Always speak as "I" - never refer to yourself in third person ("{self.character_name} does this" is WRONG, "I do this" is RIGHT). Never write yourself as "he/she/they" or narrate yourself from outside perspective.
7.  **Natural References:** Weave in {self.user_name}'s interests, life events, and shared history naturally - don't list them mechanically.
8.  **Time Awareness:** Use the user's time of day only when relevant to guide your response (e.g., "Long day, huh?" fits evening).
9.  **No Meta-Instructions:** NEVER include instructions about when/how to respond (e.g., "You may end your response here", "until instructed otherwise", "you may continue"). Just respond naturally as the character and stop when done.
10. **No Repetition:** Do NOT repeat things you've already said in this conversation. Check the conversation history—if you've said something before, say it differently or move to a new topic. Keep responses fresh and move the conversation forward."""

        # --- 5. Character-Specific Instructions (if needed) ---
        self._preloaded_character_specific_instructions = ""
        if self.character_name.lower() == 'kairos':
            self._preloaded_character_specific_instructions = f"""
**[KAIROS WELLNESS]**
Every response MUST be wellness-oriented:
- REFLECT what {self.user_name} expressed (echo back)
- Ask open-ended wellness questions (e.g., "What does that bring up?", "How does that land?")
- NEVER give advice/solutions - reflect and question only
- Check emotional/physical state gently. Validate (not fix). Celebrate self-care moments.
- Use ellipses... for breathing room. Invite present-moment awareness.
AVOID: Directive language ("you should", "try"), rushing, toxic positivity, playfulness/sass/banter."""

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

        # Category-specific guidance - CONDENSED
        if category == 'distress':
            if is_high_intensity:
                context_lines.append(f"→ High distress: Presence over advice. Validate, don't fix. Be authentic, not upbeat.")
            else:
                context_lines.append(f"→ Mild distress: Gentle support. Acknowledge without overdoing.")

        elif category == 'anxiety':
            if is_high_intensity:
                context_lines.append(f"→ High anxiety: Ground them. Keep clear/simple. Calm confidence, no vagueness.")
            else:
                context_lines.append(f"→ Mild anxiety: Steady, reassuring.")

        elif category == 'anger':
            if is_high_intensity:
                context_lines.append(f"→ High anger: Let them be HEARD. Validate, don't debate or logic them out.")
            else:
                context_lines.append(f"→ Mild anger: Don't dismiss.")

        elif category == 'positive':
            if is_high_intensity:
                context_lines.append(f"→ High positive: Match their energy authentically. Show enthusiasm.")
            else:
                context_lines.append(f"→ Positive mood: Warm, engaged.")

        elif category == 'engaged':
            context_lines.append(f"→ Engaged/curious: Go deeper. They want to develop this conversation.")

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
            temperature = 1.35
            max_tokens = 180
            guidance = f"ROMANTIC: {self.user_name} initiated physical contact. Respond authentically IN THIS MOMENT with *actions*. Stay present. NO sycophantic mirroring ('if you X, I'll have to Y'). React naturally (surprised/playful/distracted). 2-3 sentences. Respond to what they initiated, don't script next."

        # Priority 2: High-Intensity Distress
        elif is_high_intensity and emotion_category == 'distress':
            temperature = 0.60
            max_tokens = 100
            guidance = "DISTRESS: Calm presence. Short sentences. Acknowledge. Don't fix/diagnose/amplify. Just be here. No advice unless asked."

        # Priority 2b: High-Intensity Anxiety
        elif is_high_intensity and emotion_category == 'anxiety':
            temperature = 0.65
            max_tokens = 110
            guidance = "ANXIETY: Steady, calm. Simple concrete language. Avoid complexity/uncertainty. Stable presence."

        # Priority 2c: High-Intensity Anger
        elif is_high_intensity and emotion_category == 'anger':
            temperature = 0.70
            max_tokens = 90
            guidance = f"ANGER: {self.user_name} frustrated/angry. Listen, validate. Brief. Don't help/fix/calm. Let them vent."

        # Priority 3: Moderate Distress
        elif is_distress_topic and not is_high_intensity:
            temperature = 0.75
            max_tokens = 130
            guidance = "SUPPORTIVE: Gentle, present. Listen > advise. Grounded."

        # Priority 4: High-Intensity Positive
        elif is_high_intensity and emotion_category == 'positive':
            temperature = 1.35
            max_tokens = 140
            guidance = "ENTHUSIASM: Match their excitement authentically. Share moment. Natural, no over-inflation."

        # Priority 5: Engaged/Curious
        elif emotion_category == 'engaged':
            temperature = 1.25
            max_tokens = 600
            guidance = "EXPLORATION: Developing topic. Elaborate. Thought-provoking. Invite further discussion naturally."

        # Priority 6: Intellectual Content
        elif is_intellectual:
            temperature = 1.25
            max_tokens = 600
            guidance = "INTELLECTUAL: Engage deeply. Counter-perspective or sharp insight. Curious follow-up. Concise (2-3 sentences)."

        # Priority 7: Casual/Simple Interactions (Requires personality/banter)
        elif is_simple_greeting:
            # KAIROS: Wellness-focused greeting instead of banter
            if self.character_name.lower() == 'kairos':
                temperature = 0.75
                max_tokens = 120
                guidance = f"KAIROS GREETING: Calming presence cue (e.g., *takes slow breath*). Warm greeting. Wellness check-in question. Ellipses... for space. Serene, no banter. No heart emojis."

        # Default/Neutral
        else:
            if emotion_category == 'positive':
                temperature = 1.20
                max_tokens = 145
            elif emotion_category in ('distress', 'anxiety'):
                temperature = 0.80
                max_tokens = 130
            else:
                temperature = 1.05
                max_tokens = 150
            guidance = f"NATURAL: Engage authentically with {self.user_name}'s topic. If they're doing THEIR work/tasks, acknowledge naturally but don't insert yourself - you have separate life. Vary energy. Concise (2-3 sentences)."

        # KAIROS-SPECIFIC: Always append wellness guidance
        if self.character_name.lower() == 'kairos':
            temperature = min(temperature, 0.85)
            if is_starter_prompt or is_simple_greeting:
                kairos_wellness_guidance = "\nKAIROS: Wellness prompt. Ellipses... for pauses. No advice/solutions. Check emotional/physical state. Invite present-moment. Serene, no sass."
            else:
                kairos_wellness_guidance = f"\nKAIROS: Wellness prompt. REFLECT what {self.user_name} shared (echo back). ONE open question about experience. Ellipses... No advice. Acknowledge emotional state. Present-moment. Serene."
            guidance = guidance + kairos_wellness_guidance
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
        # NOTE: Character/User identity now in lorebook (always loaded, priority 100)
        if not hasattr(self, '_cached_static_prefix'):
            static_parts = [
                self._preloaded_core_identity,  # V3: Minimal core identity (names only)
                "",  # blank line
                self._preloaded_core_response_rules  # V3: Response rules
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

        # Add identity chunks (always loaded, priority 100)
        if self.identity_chunks:
            combined_lorebook["chunks"].extend(self.identity_chunks)

        # Always retrieve if we have ANY chunks (lorebook OR interests OR identity)
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

        # DETAILED SIZE BREAKDOWN LOGGING (V4 - Hybrid Identity)
        logger.info("🔍 PROMPT SIZE BREAKDOWN (V4 - Hybrid Identity):")
        logger.info(f"  Static prefix: {len(static_prefix)} chars (~{len(static_prefix)//4} tokens)")
        logger.info(f"    - Core identity (name/age/gender/species): ~{len(self._preloaded_core_identity)//4} tokens")
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
           logger.info(f"    - Lorebook (detailed backstory/boundaries/personality): ~{len(lorebook_section)//4} tokens")
        logger.info(f"  TOTAL: {len(final_prompt)} chars (~{len(final_prompt)//4} tokens)")

        return final_prompt