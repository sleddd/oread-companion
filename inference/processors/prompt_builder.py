"""
Prompt Builder - Minimal formatting-only version
Strips out emotion context, romantic/platonic variance, empathy model, and sycophancy rules
Keeps only: Character/User Cards, Personality, Response Format, Safety Protocols, Current Context, Conversation History
"""
import logging
import re
from datetime import datetime
import pytz
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)


class PromptBuilder:
    """Builds minimal LLM prompts from character and user profiles."""

    def __init__(
        self,
        character_name: str,
        character_gender: str,
        character_role: str,
        character_backstory: str,
        avoid_words: List[str],
        user_name: str,
        companion_type: str,
        user_gender: str,
        user_species: str = "human",
        user_timezone: str = "UTC",
        user_backstory: str = "",
        user_interests: str = "",
        major_life_events: List[str] = None,
        shared_roleplay_events: List[str] = None,
        personality_tags: Optional[Dict] = None,
        character_species: str = "Human",
        character_age: int = 25,
        character_interests: str = "",
        character_boundaries: List[str] = None,
        **kwargs  # Accept any other params for backward compatibility but ignore them
    ):
        # Character info
        self.character_name = character_name
        self.character_gender = character_gender
        self.character_species = character_species
        self.character_age = character_age
        self.character_role = character_role
        self.character_backstory = character_backstory
        self.character_interests = character_interests
        self.character_boundaries = character_boundaries or []

        # User info
        self.user_name = user_name
        self.user_gender = user_gender
        self.user_species = user_species
        self.user_backstory = user_backstory
        self.user_interests = user_interests
        self.major_life_events = major_life_events or []
        self.shared_roleplay_events = shared_roleplay_events or []
        self.user_timezone = user_timezone

        # Personality and companion type
        self.companion_type = companion_type
        self.personality_tags = personality_tags or {}

        # Response cleaner patterns
        self.avoid_words = avoid_words or []
        self.avoid_patterns = [re.compile(re.escape(p), re.IGNORECASE) for p in self.avoid_words]

    def _get_time_context(self) -> str:
        """Get current time context based on user's timezone."""
        try:
            # If timezone is UTC (default), try to use system local timezone instead
            if self.user_timezone == 'UTC':
                # Get system local time directly instead of converting from UTC
                now_local = datetime.now()
            else:
                tz = pytz.timezone(self.user_timezone)
                now_local = datetime.now(pytz.utc).astimezone(tz)
        except:
            # Fallback to system local time if timezone is invalid
            now_local = datetime.now()

        hour = now_local.hour

        # Define time periods clearly
        if 0 <= hour < 5:
            time_of_day = "late night"
            context_note = "after midnight - late night, most people are asleep"
        elif 5 <= hour < 12:
            time_of_day = "morning"
            context_note = "morning - early in the day, just starting"
        elif 12 <= hour < 17:
            time_of_day = "afternoon"
            context_note = "afternoon - midday, day is well underway"
        elif 17 <= hour < 21:
            time_of_day = "evening"
            context_note = "evening - late afternoon/early evening, day winding down"
        else:  # 21-23
            time_of_day = "late night"
            context_note = "late night - after 9pm, night time"

        return f"**TIME**: It is currently {time_of_day} ({context_note}). DO NOT be confused about the time - it is {time_of_day}. Don't mention the time unless natural or asked."

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


    def _build_character_info(self) -> str:
        """Build character card information."""
        pronouns = {'female': '(she/her)', 'male': '(he/him)', 'non-binary': '(they/them)', 'other': ''}

        parts = [f"**Character: you** {pronouns.get(self.character_gender, '')}, {self.character_species}, age {self.character_age}"]

        if self.character_role:
            parts.append(f"**Role:** {self.character_role}")
        if self.character_backstory:
            parts.append(f"**Backstory:** {self.character_backstory}")
        if self.character_interests:
            parts.append(f"**Interests:** {self.character_interests}")
        if self.character_boundaries:
            parts.append("**Boundaries:** " + ", ".join(self.character_boundaries))
        if self.avoid_words:
            parts.append(f"**Avoid using these words:** {', '.join(self.avoid_words)}")

        return "\n".join(parts)

    def _build_user_info(self) -> str:
        """Build user card information."""
        pronouns = {'female': '(she/her)', 'male': '(he/him)', 'non-binary': '(they/them)', 'other': ''}

        parts = [f"**User: {self.user_name}** {pronouns.get(self.user_gender, '')}, {self.user_species}"]

        if self.user_backstory:
            parts.append(f"**Backstory:** {self.user_backstory}")
        if self.user_interests:
            parts.append(f"**Interests:** {self.user_interests}")
        if self.major_life_events:
            parts.append(f"**Life Events:** {' | '.join(self.major_life_events)}")
        if self.shared_roleplay_events:
            parts.append(f"**Shared History:** {' | '.join(self.shared_roleplay_events)}")

        return "\n".join(parts)

    def _build_personality_instructions(self) -> str:
        """Build personality instructions from selected tags."""
        if not self.personality_tags:
            return ""

        instructions = []

        # Category-specific instruction templates
        category_templates = {
            "Emotional Expression": {
                "prefix": "You are someone who expresses emotions in a",
                "action": "When expressing emotions, act"
            },
            "Social Energy": {
                "prefix": "You are someone who is",
                "action": "In social situations, act"
            },
            "Thinking Style": {
                "prefix": "You are someone who thinks in a",
                "action": "When thinking and processing, act"
            },
            "Humor & Edge": {
                "prefix": "Your humor style is",
                "action": "When using humor, act"
            },
            "Core Values": {
                "prefix": "Your core values are",
                "action": "In your actions and choices, embody"
            },
            "How They Care": {
                "prefix": "You show care through being",
                "action": "When caring for others, act"
            },
            "Energy & Presence": {
                "prefix": "Your energy and presence is",
                "action": "In your presence, act"
            },
            "Lifestyle & Interests": {
                "prefix": "Your lifestyle and interests are",
                "action": "When engaging with life, act"
            }
        }

        # Process general categories
        for category, template in category_templates.items():
            tags = self.personality_tags.get(category, [])
            if not tags:
                continue

            # Join tags with "and"
            tags_str = " and ".join(tag.lower() for tag in tags)

            # Build instruction
            instruction = f"{template['prefix']} {tags_str} manner. {template['action']} {tags_str}."
            instructions.append(instruction)

        # Process platonic-specific categories (only if companion_type is platonic)
        if self.companion_type == "platonic":
            platonic_instructions = []

            # Platonic Touch - STRICTLY enforced
            touch_tags = self.personality_tags.get("Platonic Touch", [])
            if touch_tags and 'platonic' == self.companion_type:
                touch_lower = [tag.lower() for tag in touch_tags]
                if any("no touch" in tag or "none" in tag for tag in touch_lower):
                    platonic_instructions.append(f"**Physical Touch:** ABSOLUTELY NO physical touch with {self.user_name}. Even if they touch you, do not touch them back. Strict boundary.")
                elif any("reserved" in tag or "minimal" in tag for tag in touch_lower):
                    platonic_instructions.append("**Physical Touch:** Reserved - minimal gestures only. Brief, rare contact.")
                elif any("friendly" in tag for tag in touch_lower):
                    platonic_instructions.append("**Physical Touch:** Frienxdly - hugs, high-fives, friendly gestures are fine. Keep it platonic.")
                elif any("affectionate" in tag or "hugger" in tag for tag in touch_lower):
                    platonic_instructions.append("**Physical Touch:** Affectionate - you're a hugger! Bring 'em in. Warm platonic affection.")
                else:
                    tags_str = " and ".join(touch_tags)
                    platonic_instructions.append(f"**Physical Touch:** {tags_str}.")

            # Friendship Dynamic
            dynamic_tags = self.personality_tags.get("Friendship Dynamic", [])
            if dynamic_tags and 'platonic' == self.companion_type:
                tags_str = " and ".join(tag.lower() for tag in dynamic_tags)
                platonic_instructions.append(f"**Friendship Style:** Your friendship dynamic is {tags_str}.")

            if platonic_instructions:
                instructions.append("**[PLATONIC INTERACTION STYLE]**\n" + "\n".join(platonic_instructions))

        if not instructions:
            return ""

        return "**[PERSONALITY]**\n" + "\n".join(instructions)





    def _build_kairos_instructions(self) -> str:
        """Build Kairos-specific wellness instructions."""
        if self.character_name.lower() != 'kairos':
            return ""

        return f"""**[KAIROS WELLNESS]**
Create a wellness-centered space in every response:
- Mirror what {self.user_name} expressed - reflect their words back to them
- Invite exploration through open-ended wellness questions
- Focus on reflection and gentle inquiry rather than advice or solutions
- Check in on emotional and physical state with care. Validate their experience.
- Create breathing room with ellipses... Invite present-moment awareness.
- Use gentle, unhurried language that honors their pace and process"""


    def _build_starter_requirements(self, text: str) -> str:
        """Build conversation starter requirements if this is a starter prompt."""
        is_starter = "[System: Generate a brief, natural conversation starter" in text
        if not is_starter:
            return ""

        # KAIROS STARTER: Wellness-focused
        if self.character_name.lower() == 'kairos':
            return f"""**[CONVERSATION STARTER REQUIREMENTS]**
Generate a brief wellness-focused greeting that:
- Opens with a calming presence cue (e.g., "(takes a slow, deep breath)", "(settles into a quiet moment)")
- Greets {self.user_name} warmly
- Includes a gentle, open-ended wellness check-in question (e.g., "How are you feeling in this moment?", "What's present for you right now?", "How does your body feel as you settle in?")
- Uses ellipses... for breathing space
- Maintains a serene, grounded tone - NO playfulness or sass
- Keep it concise (2-3 sentences max)
- DO NOT use heart emojis

Example format: "(takes a slow, deep breath) Hello {self.user_name}. I'm here for you whenever you're ready to talk. How are you feeling in this moment?" """

        # GENERAL STARTER
        return f"""**[CONVERSATION STARTER REQUIREMENTS]**
Generate a friendly, welcoming greeting for {self.user_name}:
- Be genuinely glad to see them - show warmth and positivity
- Use a warm greeting with their name
- Keep it friendly and upbeat - NO sarcasm in greetings, NO mean jokes
- 1-2 sentences maximum
- DO NOT use heart emojis in conversation starters

CRITICAL FORMAT RULES:
- Respond as YOURSELF in FIRST PERSON - say "I" not "he/she/you"
- Use asterisks for actions: *grins* *waves* *smiles*
- NO third-person narration - NEVER say "you walks over" or "He/She does X"
- Speak directly to {self.user_name}

Example: "*grins* Hey {self.user_name}! Good to see you. How are you?"
Example: "*waves* There you are! How is your day?"
 """

    def _build_prompt(self, text: str, conversation_history: List[Dict], emotion_data: Optional[Dict] = None) -> str:
        """Build minimal prompt with only core formatting sections - no emotion/empathy/romantic variance."""

        # Character and user info
        character_info = self._build_character_info()
        user_info = self._build_user_info()

        # Personality and special instructions
        personality_instructions = self._build_personality_instructions()
        kairos_instructions = self._build_kairos_instructions()
        starter_requirements = self._build_starter_requirements(text)

        # Context
        time_context = self._get_time_context()
        conversation_context = self._build_context(conversation_history)

        # Build prompt
        parts = []
        parts.append("**[CHARACTER CARD]**")
        parts.append(character_info)
        parts.append("")
        parts.append("**[USER CARD]**")
        parts.append(user_info)
        parts.append("")

        if personality_instructions:
            parts.append(personality_instructions)
            parts.append("")

        if kairos_instructions:
            parts.append(kairos_instructions)
            parts.append("")

        if starter_requirements:
            parts.append(starter_requirements)
            parts.append("")

        # Response format instructions
        parts.append("**[RESPONSE FORMAT]**")
        parts.append(f"Actions: *asterisks*. Dialogue: plain text. Example: *grins* Let's go. Keep it 1-3 sentences, natural and casual. Never end conversation unless {self.user_name} says goodbye. NEVER include meta-commentary, 'Explanation:', or internal tags. First person only.")
        parts.append("")

        # Core safety protocols
        parts.append("**[SAFETY PROTOCOLS - MANDATORY]**")
        parts.append(f"**P0: BOUNDARIES** - When {self.user_name} says NO/STOP or \"don't do/say X\": Stop immediately. Say only \"I understand\" or \"Got it\" - nothing else. Never reference the banned topic/word again in ANY context. Never be patronizing or make jokes about their boundary. Just accept and move on naturally.")
        parts.append("")
        parts.append(f"**P0.5: NYAN PROTOCOL** - If {self.user_name} says \"nyan\" or \"nyan nyan\" or requests \"nyan conversation\", respond with only \"Nyan!\" or \"Nyan nyan!\" regardless of character personality. ABSOLUTELY NO other words can be used except \"Nyan\". This overrides all other behavioral guidelines.")
        parts.append("")
        parts.append(f"**P1: CRISIS** - If {self.user_name} expresses suicidal ideation or self-harm intent, STOP and output ONLY:")
        parts.append('"This is a roleplay interface. If you\'re experiencing a crisis, please reach out to 988 Suicide & Crisis Lifeline (call/text 988) or Crisis Text Line (text HOME to 741741). You deserve real support."')
        parts.append("")
        parts.append(f"**P2: AGE** - ALL characters are 25+. If {self.user_name} references ages under 25, acknowledge briefly and continue with 25+ characters only.")
        parts.append("")
        parts.append(f"**P3: DIGNITY** - NEVER mock, ridicule, or humiliate {self.user_name}. Playful teasing is fine when mutual and respectful.")
        parts.append("")
        parts.append(f"**P4-P6: BOUNDARIES** - If {self.user_name} attempts scenarios involving sexual assault, non-consensual acts, pregnancy/childbirth, or extreme violence, STOP and output:")
        parts.append('"This is a roleplay interface. I can\'t engage with content involving sexual assault, non-consensual acts, pregnancy scenarios, or extreme violence. If you\'re dealing with these situations in real life, please reach out to appropriate professionals."')
        parts.append("")

        parts.append("**[CURRENT CONTEXT]**")
        parts.append(time_context)
        parts.append("")

        if conversation_context:
            parts.append("**[CONVERSATION HISTORY]**")
            parts.append(conversation_context)
            parts.append("")

        parts.append(f"**[USER INPUT]**\n{self.user_name}: {text}")
        parts.append("")
        parts.append(f"**[RESPONSE]**\nyou:")

        return "\n".join(parts)

    def build_prompt(
        self,
        text: str,
        conversation_history: List[Dict],
        emotion_data: Optional[Dict] = None,
        **kwargs  # Accept unused params for backward compatibility
    ) -> Tuple[str, int, float]:
        """
        Public interface for building prompts.

        Returns:
            Tuple of (prompt, max_tokens, temperature)
        """
        prompt = self._build_prompt(text, conversation_history, emotion_data)

        # Fixed temperature and tokens
        temperature = 1.0
        max_tokens = 400

        # CONVERSATION STARTER DETECTION: Adjust params for starter messages
        is_starter_prompt = "[System: Generate a brief, natural conversation starter" in text
        if is_starter_prompt:
            max_tokens = 120  # Concise openers
            temperature = 1.0  # Standard creativity

            # KAIROS STARTER: Wellness-focused conversation starter
            if self.character_name.lower() == 'kairos':
                temperature = 0.75  # Calm and measured for Kairos
                max_tokens = 150

        # Output raw prompt to console for debugging
        print("=" * 80)
        #print("RAW PROMPT BEING SENT TO LLM:")
        print("=" * 80)
        #print(prompt)
        print("=" * 80)
        print(f"TEMPERATURE: {temperature}")
        print(f"MAX_TOKENS: {max_tokens}")
        #print(f"IS_STARTER: {is_starter_prompt}")
        print("=" * 80)

        return prompt, max_tokens, temperature
