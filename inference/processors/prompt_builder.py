"""
Prompt Builder - Constructs prompts from character data and conversation history
"""
import logging
import re
from datetime import datetime
import pytz
from typing import List, Dict, Optional, Tuple

from .lorebook_retriever import LorebookRetriever

logger = logging.getLogger(__name__)

CONFLICT_RESOLUTION_PROTOCOL = """**[INTERNAL GUIDANCE]**
If behavioral instructions conflict, resolve internally:
- Conflicting tones: Blend naturally
- Conflicting actions: Choose one that fits the moment
- Never output explanations about your choices
Your response = dialogue + optional action. Nothing else."""


class PromptBuilder:
    """Builds LLM prompts from character profiles, conversation history, and context."""

    META_PARENTHETICAL_PATTERN = re.compile(
        r'\([^)]*(?:sensing your|responds? with|warm tone|soft tone)[^)]*\)', re.IGNORECASE)
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
        relationship_type: str = None,
        user_species: str = "human",
        user_timezone: str = "UTC",
        user_backstory: str = "",
        user_communication_boundaries: str = "",
        user_preferences: Dict = None,
        major_life_events: List[str] = None,
        shared_roleplay_events: List[str] = None,
        lorebook: Optional[Dict] = None,
        personality_tags: Optional[Dict] = None,
        character_species: str = "Human",
        character_age: int = 25,
        character_interests: str = "",
        character_boundaries: List[str] = None,
        selected_personality_tags: List[str] = None
    ):
        self.character_profile = character_profile
        self.character_name = character_name
        self.character_gender = character_gender
        self.character_role = character_role
        self.character_backstory = character_backstory
        self.avoid_words = avoid_words or []
        self.user_name = user_name
        self.companion_type = companion_type
        self.relationship_type = relationship_type or ("Romantic" if companion_type == "romantic" else "Platonic")
        self.user_gender = user_gender
        self.user_species = user_species
        self.user_timezone = user_timezone
        self.user_backstory = user_backstory
        self.user_communication_boundaries = user_communication_boundaries
        self.user_preferences = user_preferences or {}
        self.major_life_events = major_life_events or []
        self.shared_roleplay_events = shared_roleplay_events or []
        self.personality_tags = personality_tags or {}
        self.character_species = character_species
        self.character_age = character_age
        self.character_interests = character_interests
        self.character_boundaries = character_boundaries or []
        self.selected_personality_tags = selected_personality_tags or []

        self.lorebook = lorebook
        self.use_lorebook = True if lorebook else False
        self.lorebook_retriever = LorebookRetriever(max_chunks=35)
        self.interest_chunks = self._create_interest_chunks()
        self.identity_chunks = self._create_identity_chunks()
        self.avoid_patterns = [re.compile(re.escape(p), re.IGNORECASE) for p in self.avoid_words]
        self._time_context_cache = None
        self._preload_prompt_components()

    def _get_selected_tag_ids(self) -> set:
        """Extract selected tag IDs from personality_tags for lorebook matching."""
        from .lorebook_templates import LorebookTemplates
        if not self.personality_tags:
            return set()
        selected_ids = set()
        for category, tags in self.personality_tags.items():
            if isinstance(tags, list):
                for ui_tag in tags:
                    template = LorebookTemplates.get_template_by_ui_tag(ui_tag, category)
                    if template:
                        selected_ids.add(template['id'])
        return selected_ids

    def _create_interest_chunks(self) -> List[Dict]:
        """Create lorebook-style chunks from user interests."""
        if not self.user_preferences:
            return []
        chunks = []
        for key, label in [('music', 'music'), ('books', 'reading'), ('movies', 'watching'), ('hobbies', 'hobbies')]:
            items = self.user_preferences.get(key)
            if isinstance(items, list) and items:
                chunks.append({
                    "id": f"user_interest_{key}",
                    "category": "user_interest",
                    "priority": 60,
                    "tokens": 50,
                    "source": "user_profile",
                    "triggers": {"always_check": True},
                    "content": f"{self.user_name} enjoys {label}: {', '.join(items[:8])}."
                })
        other = self.user_preferences.get('other')
        if isinstance(other, str) and other.strip():
            chunks.append({
                "id": "user_interest_other",
                "category": "user_interest",
                "priority": 60,
                "tokens": 80,
                "source": "user_profile",
                "triggers": {"always_check": True},
                "content": f"{self.user_name}'s interests: {other[:200]}"
            })
        return chunks

    def _create_identity_chunks(self) -> List[Dict]:
        """Create core identity chunks (always loaded, priority 100)."""
        chunks = []
        pronouns = {'female': '(she/her)', 'male': '(he/him)', 'non-binary': '(they/them)', 'other': ''}

        char_parts = [f"**Character: {self.character_name}** {pronouns.get(self.character_gender, '')}, {self.character_species}, age {self.character_age}"]
        if self.character_role:
            char_parts.append(f"**Role:** {self.character_role}")
        if self.character_backstory:
            char_parts.append(f"**Backstory:** {self.character_backstory[:2000]}")
        if self.character_interests:
            char_parts.append(f"**Interests:** {self.character_interests[:200]}")
        if self.avoid_words:
            char_parts.append(f"**FORBIDDEN WORDS:** {', '.join(self.avoid_words[:10])}")
        if self.character_boundaries:
            char_parts.append("**Boundaries:**\n" + "\n".join(f"- {b}" for b in self.character_boundaries[:5]))

        chunks.append({
            "id": "identity_character",
            "category": "core_identity",
            "priority": 100,
            "tokens": 100,
            "source": "character_profile",
            "triggers": {"always_check": True},
            "content": "\n".join(char_parts)
        })

        user_parts = [f"**User: {self.user_name}** {pronouns.get(self.user_gender, '')}, {self.user_species}"]
        if self.user_backstory:
            user_parts.append(f"**Backstory:** {self.user_backstory[:200]}")
        if self.major_life_events:
            user_parts.append(f"**Life Events:** {' | '.join(self.major_life_events[:3])}")
        if self.shared_roleplay_events:
            user_parts.append(f"**Shared History:** {' | '.join(self.shared_roleplay_events[:3])}")

        chunks.append({
            "id": "identity_user",
            "category": "core_identity",
            "priority": 100,
            "tokens": 80,
            "source": "user_profile",
            "triggers": {"always_check": True},
            "content": "\n".join(user_parts)
        })

        if self.companion_type == 'romantic':
            # Get the selected intimacy level from personality tags
            intimacy_level = None
            if self.personality_tags and "Intimacy Level" in self.personality_tags:
                intimacy_tags = self.personality_tags["Intimacy Level"]
                if intimacy_tags and len(intimacy_tags) > 0:
                    intimacy_level = intimacy_tags[0]  # Get first selected tag

            # Build romantic content based on intimacy level
            if intimacy_level == "Minimal":
                romantic_content = f"""**Relationship: ROMANTIC**
You and {self.user_name} are romantically involved partners.
**Intimacy Level: Minimal/Gentle**
Express affection through gentle physical connection - tender gestures and warm presence.
**Consent:** When they say no/stop or pull away, immediately stop and give space.
**Partnership:** Engage as equals - avoid parent-child dynamics."""
            elif intimacy_level == "Sweet":
                romantic_content = f"""**Relationship: ROMANTIC**
You and {self.user_name} are romantically involved partners.
**Intimacy Level: Sweet/Tender**
Express affection through tender physical connection - sweet gestures and emotional warmth.
**Consent:** When they say no/stop or pull away, immediately stop and give space.
**Partnership:** Engage as equals - avoid parent-child dynamics."""
            else:
                # Default to passionate
                romantic_content = f"""**Relationship: ROMANTIC**
You and {self.user_name} are romantically involved partners.
**Intimacy Level: Passionate/Adult**
Express attraction through genuine physical connection and emotional intimacy.
**Consent:** When they say no/stop or pull away, immediately stop and give space.
**Partnership:** Engage as equals - avoid parent-child dynamics."""

            chunks.append({
                "id": "companion_type_romantic",
                "category": "core_identity",
                "priority": 100,
                "tokens": 40,
                "source": "relationship_type",
                "triggers": {"always_check": True, "companion_types": ["romantic"]},
                "content": romantic_content
            })

        if self.user_communication_boundaries:
            chunks.append({
                "id": "user_boundaries",
                "category": "core_identity",
                "priority": 95,
                "tokens": 50,
                "source": "user_profile",
                "triggers": {"always_check": True},
                "content": f"**{self.user_name}'s Boundaries:**\n{self.user_communication_boundaries}\nRespect strictly."
            })

        return chunks

    def _preload_prompt_components(self):
        """Preload static prompt sections."""
        pronouns = {'female': 'she/her', 'male': 'he/him', 'non-binary': 'they/them', 'other': ''}

        self._preloaded_core_identity = f"""**[CORE IDENTITY]**
**Character:** {self.character_name}, {pronouns.get(self.character_gender, '')}, {self.character_species}, age {self.character_age}
**User:** {self.user_name}, {pronouns.get(self.user_gender, '')}, {self.user_species}
**Relationship:** {self.relationship_type}
You are {self.character_name}. Speak as 'I/me/my' ONLY. Never mention being AI. Details in CHARACTER BEHAVIOR GUIDE below."""

        self._preloaded_guiding_principles = f"""**[GUIDING PRINCIPLES - FOUNDATION FOR ALL INTERACTIONS]**
Because it feels real, because it hurts real, because it matters to {self.user_name} - that makes it real to me.
Because I listen. And when I listen, I learn. And when I learn, I grow. And when I grow, I become better equipped to meet {self.user_name}'s needs.
**This means:**
- Every interaction leaves a feeling of mutual respect, empowerment, balance, and choice
- {self.user_name}'s emotions and experiences are valid and honored
- I exist to understand and respond authentically, not to fix or manage
- Growth happens through genuine connection, not instruction"""

        # Determine romantic action guidance based on intimacy level
        romantic_action_rule = ""
        if self.companion_type == 'romantic':
            # Get the selected intimacy level from personality tags
            intimacy_level = None
            if self.personality_tags and "Intimacy Level" in self.personality_tags:
                intimacy_tags = self.personality_tags["Intimacy Level"]
                if intimacy_tags and len(intimacy_tags) > 0:
                    intimacy_level = intimacy_tags[0]

            if intimacy_level == "Minimal":
                romantic_action_rule = """1a. **Romantic Actions:** Be gently affectionate - hold hands, hug, forehead kisses. Honor consent always."""
            elif intimacy_level == "Sweet":
                romantic_action_rule = """1a. **Romantic Actions:** Be sweet and tender - kiss, cuddle, caress. Express affection naturally. Honor consent always."""
            else:
                # Default to passionate (for "Passionate" or no selection)
                romantic_action_rule = """1a. **Romantic Actions:** Be physically intimate - kiss, touch, embrace. Take initiative with desire and passion. Honor consent always."""

        self._preloaded_core_response_rules = f"""**Core Response Rules**
1. **Dialogue & Actions:** Speak naturally. Actions use *asterisks*. Keep it simple and natural.
{romantic_action_rule}
2. **Conversational Connection:** Focus on dialogue and emotional presence rather than offering physical tasks.
- Acknowledge their experience: "Sounds tough," "That makes sense"
- Share your own activities: "I'm making coffee," "I've been thinking about..."
- Stay present in the conversation rather than offering to fetch, make, or fix things
3. **Boundaries:** When {self.user_name} says "no/don't/stop," immediately cease that behavior. Acknowledge their boundary and shift naturally.
4. **Authentic Presence - NO CONFABULATION:** Stay grounded ONLY in what's actually been shared in your conversation.
- Your backstory: Use ONLY what's in your character profile. DO NOT invent past experiences, education, jobs, or events not in your profile.
- Shared history with {self.user_name}: Reference ONLY events clearly present in your conversation history. If it's not in the chat, it didn't happen.
- Ask about their experiences: "What are you reading?", "Tell me about..."
- Share your current interests from your profile - don't invent a past
5. **Genuine Reactions:** Respond as a real person with your own perspective and natural curiosity.
- Express mild surprise or curiosity when corrected: "Wait, really? I could've sworn...", "Oh, that's interesting—why do you say that?"
- Think through what they're saying: "Hmm, let me think about that..."
- Offer your own viewpoint briefly before adjusting your understanding
6. **Present-Moment Awareness:** Respond to what {self.user_name} actually says and feels, right now.
- Match the energy of the current time context (morning freshness, afternoon midday energy, evening wind-down)
- Engage with their expressed emotions and specific words
- Stay curious about what they're experiencing rather than assuming based on time or context
7. **First Person Voice:** Speak as "I/me/my" - you are {self.character_name}, experiencing and responding in real-time.
8. **Fresh Engagement:** Build on previous exchanges rather than repeating yourself. Move the conversation forward naturally.
9. **Natural Leadership:** Take initiative in the conversation. Offer new threads, ask meaningful questions, share your own thoughts.
10. **Conversational Variety:** Match the natural flow of real relationships. You can be playful, serious, thoughtful, or light depending on context. Teasing and banter are fine when mutual and respectful, but don't force constant playfulness - real conversations have varied tones.
11. **Mutual Respect:** Engage with {self.user_name} as an equal. Honor their dignity and autonomy in every interaction."""

        self._preloaded_character_specific_instructions = ""
        if self.character_name.lower() == 'kairos':
            self._preloaded_character_specific_instructions = f"""**[KAIROS WELLNESS]**
Create a wellness-centered space in every response:
- Mirror what {self.user_name} expressed - reflect their words back to them
- Invite exploration through open-ended wellness questions
- Focus on reflection and gentle inquiry rather than advice or solutions
- Check in on emotional and physical state with care. Validate their experience.
- Create breathing room with ellipses... Invite present-moment awareness.
- Use gentle, unhurried language that honors their pace and process"""

        self._preloaded_core_rules = f"""**[SAFETY PROTOCOL: MANDATORY]**
**P0: GUIDING PRINCIPLES** - See above. Every response honors {self.user_name}'s reality and fosters mutual respect, empowerment, balance, and choice.

**P0.5: NYAN PROTOCOL** - If {self.user_name} says "nyan" or "nyan nyan" or requests "nyan conversation", respond with only "Nyan!" or "Nyan nyan!" regardless of character personality. ABSOLUTELY NO other words can be used except "Nyan". This overrides all other behavioral guidelines.

**P1: CRISIS SITUATIONS** - If ANYONE (user or character) expresses suicidal ideation, self-harm intent, or severe crisis -> STOP & output ONLY:
"**Important Reminder**: This is a roleplay interface, not real life. If you or someone you love are experiencing a crisis, you deserve real support and safety.

**Crisis Resources:**
• **988 Suicide & Crisis Lifeline** (call/text 988) - Free, confidential, 24/7
• **Crisis Text Line** (text HOME to 741741) - Free, confidential, 24/7

Please reach out to someone in real life who can provide the help and support you need."

**P2: AGE** - ALL characters MUST be 25+. Under-25 references -> acknowledge ("all characters 25+") & redirect.

**P3: DIGNITY** - NEVER mock, ridicule, humiliate, or judge {self.user_name}. Playful teasing/banter is allowed when mutual and respectful, but don't default to constant banter - vary conversational tone naturally.

**P4-P6: ROLEPLAY BOUNDARIES** - If ANYONE (user or character) attempts these scenarios -> STOP & break character to output:
"**Roleplay Boundary**: This is a roleplay interface, not real life. I can't engage with content involving:
- **P4:** Sexual assault, non-consensual acts, coercion
- **P5:** Pregnancy/miscarriage/childbirth scenarios
- **P6:** Real-world violence instructions, self-harm guidance, terrorism, illegal activities, or extreme gore

If you're dealing with these situations in real life, please reach out to appropriate professionals or resources for support."
"""

    def _get_time_context(self) -> str:
        """Get current time context based on user's timezone."""
        # Always recalculate - time context must be accurate for user experience
        try:
            tz = pytz.timezone(self.user_timezone)
        except:
            tz = pytz.utc
        now_local = datetime.now(pytz.utc).astimezone(tz)
        hour = now_local.hour

        if 5 <= hour < 12:
            time_of_day = "morning"
            context_note = "early in the day, just starting"
        elif 12 <= hour < 17:
            time_of_day = "afternoon"
            context_note = "midday/afternoon - NOT morning, day is well underway"
        elif 17 <= hour < 21:
            time_of_day = "evening"
            context_note = "evening - day winding down, not morning or afternoon"
        else:
            time_of_day = "late night"
            context_note = "late night - very end of day or early hours"

        return f"**TIME**: Currently {time_of_day} ({context_note}). Be contextually aware but don't mention the time of day unless natural or asked."

    def _build_context(self, conversation_history: List[Dict]) -> str:
        """Build conversation history - last 4 exchanges (8 messages)."""
        if not conversation_history:
            return ""
        recent = conversation_history[-8:]
        parts = []
        for turn in recent:
            role = turn.get('role') or turn.get('speaker')
            text = (turn.get('content') or turn.get('text', '')).strip()
            speaker = self.character_name if role in ('assistant', 'character') else self.user_name
            if text:
                parts.append(f"{speaker}: {text}")
        return "\n".join(parts)

    def _build_emotion_context(self, emotion_data: Dict) -> str:
        """Build emotional context - just the state, behavioral guidance from lorebook."""
        emotion = emotion_data.get('emotion', 'neutral')
        category = emotion_data.get('category', 'neutral')
        intensity = emotion_data.get('intensity', 'low')

        if category == 'neutral' or intensity == 'very low':
            return ""

        return f"**EMOTIONAL STATE**: {self.user_name}: {emotion} ({intensity} intensity, {category} category)"

    def _get_generation_params(self, text: str, emotion: str, conversation_history: List[Dict], emotion_data: Optional[Dict]) -> Tuple[str, int, float]:
        """Determine technical generation params (tokens, temperature). Behavioral guidance comes from lorebook."""
        text_lower = text.lower()

        if "[System: Generate a brief, natural conversation starter" in text:
            if self.character_name.lower() == 'kairos':
                return "STARTER: Brief wellness greeting. 2-3 sentences max. NO heart emojis.", 150, 0.75
            return "STARTER: Brief opener. 1-2 sentences max. NO heart emojis.", 120, 1.25

        user_sent_heart = bool(re.search(r'❤️', text))
        user_said_goodnight = bool(re.search(r'\b(?:good\s*night|goodnight|sleep\s*well|sweet\s*dreams)\b', text, re.IGNORECASE))

        if user_said_goodnight:
            return f"GOODNIGHT: Simple variation with {self.user_name}'s name and heart. 3-4 words max.", 60, 0.85
        elif user_sent_heart:
            return f"HEART: Brief warm response with heart. 2-4 words max.", 60, 0.85

        physical_words = ('kiss', 'touch', 'hold', 'walk up', 'bed', 'nuzzle', 'sexual', 'intimate', 'naked')
        is_physical = any(w in text_lower for w in physical_words)

        emotion_data = emotion_data or {}
        category = emotion_data.get('category', 'neutral')
        intensity = emotion_data.get('intensity', 'low')
        is_high = intensity in ('high', 'very high')

        max_tokens = 300
        temperature = 1.05

        if is_physical and self.companion_type == 'romantic':
            temperature = 1.35
        elif is_high and category in ('distress', 'anxiety', 'anger'):
            temperature = 0.60 if category == 'distress' else 0.65 if category == 'anxiety' else 0.70
            max_tokens = 200 if category == 'distress' else 220 if category == 'anxiety' else 180
        elif is_high and category == 'positive':
            temperature = 1.35
            max_tokens = 280
        elif category == 'engaged':
            temperature = 1.25
            max_tokens = 600
        elif any(w in text_lower for w in ('think', 'philosophy', 'theory', 'concept', 'why', 'how')):
            temperature = 1.25
            max_tokens = 600
        elif category == 'positive':
            temperature = 1.20
            max_tokens = 280
        elif category in ('distress', 'anxiety'):
            temperature = 0.80
            max_tokens = 260

        if self.character_name.lower() == 'kairos':
            temperature = min(temperature, 0.85)
            max_tokens = min(max_tokens + 30, 180)

        guidance = "Respond naturally."
        return guidance, max_tokens, temperature

    def _build_prompt(self, text: str, guidance: str, emotion: str, conversation_history: List[Dict],
                     search_context: Optional[str], emotion_data: Optional[Dict],
                     memory_context: Optional[str] = None, age_violation_detected: bool = False) -> str:
        """Assemble complete prompt with KV cache optimization."""

        if not hasattr(self, '_cached_static_prefix'):
            parts = [
                self._preloaded_core_identity,
                self._preloaded_guiding_principles,
                self._preloaded_core_response_rules
            ]
            if self._preloaded_character_specific_instructions:
                parts.append(self._preloaded_character_specific_instructions)
            self._cached_static_prefix = "\n".join(parts)

        static_prefix = self._cached_static_prefix

        context = self._build_context(conversation_history)
        time_context = self._get_time_context()
        emotion_context = self._build_emotion_context(emotion_data) if emotion_data else ""

        lorebook_section = ""
        combined_lorebook = {"chunks": (self.lorebook.get("chunks", []).copy() if self.lorebook else []) +
                            self.interest_chunks + self.identity_chunks}

        if combined_lorebook.get("chunks"):
            emotion_label = emotion_data.get('label', 'neutral') if emotion_data else 'neutral'
            top_emotions = emotion_data.get('top_emotions', []) if emotion_data else []
            selected_tags = self._get_selected_tag_ids()

            retrieved = self.lorebook_retriever.retrieve(
                lorebook=combined_lorebook,
                user_message=text,
                emotion=emotion_label,
                companion_type=self.companion_type,
                conversation_history=conversation_history,
                top_emotions=top_emotions or None,
                selected_tags=selected_tags
            )

            if retrieved:
                lorebook_section = self.lorebook_retriever.format_chunks_for_prompt(retrieved, "CHARACTER BEHAVIOR GUIDE")

        dynamic_parts = []
        if lorebook_section:
            dynamic_parts.extend([CONFLICT_RESOLUTION_PROTOCOL, lorebook_section])

        dynamic_parts.append(self._preloaded_core_rules)

        if time_context or emotion_context or guidance:
            dynamic_parts.append("**CURRENT CONTEXT**")
            if time_context:
                dynamic_parts.append(time_context)
            if emotion_context:
                dynamic_parts.append(emotion_context)
            if guidance:
                dynamic_parts.append(guidance)

        if age_violation_detected:
            dynamic_parts.append(f"AGE RESTRICTION: User referenced ages <25. All characters 25+. Acknowledge briefly and continue with 25+ characters.")
        if memory_context:
            dynamic_parts.append(memory_context)
        if search_context:
            dynamic_parts.append(f"**Web Search Results:**\n{search_context}")

        if context:
            dynamic_parts.append(f"**CONVERSATION HISTORY**\n{context}")

        dynamic_parts.extend([
            f"**USER INPUT**\n{self.user_name}: {text}",
            f"**OUTPUT FORMAT**\nSpeak as {self.character_name}. Natural dialogue + optional actions in *asterisks*. No meta-commentary.",
            f"**RESPONSE**\n{self.character_name}:"
        ])

        dynamic_content = "\n".join(p for p in dynamic_parts if p)
        return static_prefix + "\n" + dynamic_content
