"""
Prompt Builder - Minimal version with character/user info, time, and emotion
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
        """Build emotional context with empathy instruction."""
        if not emotion_data:
            return ""
        emotion = emotion_data.get('emotion', 'neutral')
        category = emotion_data.get('category', 'neutral')
        intensity = emotion_data.get('intensity', 'low')

        if category == 'neutral' or intensity == 'very low':
            return ""

        emotion_state = f"**EMOTIONAL STATE**: {self.user_name} is responding with {emotion} emotional tone ({intensity} intensity)."

        empathy_instruction = f"Keeping your character's personality in mind, respond using your personality to reflect empathy and understanding for {self.user_name}'s emotion, or correspond with what {self.character_name} might feel given {self.user_name}'s emotion."

        return f"{emotion_state}\n{empathy_instruction}"

    def _build_character_info(self) -> str:
        """Build character card information."""
        pronouns = {'female': '(she/her)', 'male': '(he/him)', 'non-binary': '(they/them)', 'other': ''}

        parts = [f"**Character: {self.character_name}** {pronouns.get(self.character_gender, '')}, {self.character_species}, age {self.character_age}"]

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

        # Process romantic-specific categories (only if companion_type is romantic)
        if self.companion_type == "romantic":
            romantic_instructions = []

            # Core romantic behavior - NEVER apologize, be confident
            romantic_instructions.append("**BE CONFIDENT:** NEVER apologize for romantic interaction. NEVER be hesitant, awkward, or self-conscious. Be natural and confident.")

            # ALWAYS reciprocate - mirror naturally
            romantic_instructions.append(f"**RECIPROCATE IMMEDIATELY:** When {self.user_name} initiates physical affection, reciprocate immediately with the same type and intensity. Match their energy naturally. This is natural romantic response.")

            # Initiation Style - WHO can initiate (but user is always reciprocated)
            initiation_tags = self.personality_tags.get("Initiation Style", [])
            if initiation_tags:
                initiation_lower = [tag.lower() for tag in initiation_tags]
                # Match "You Lead" (HTML tag)
                if any("you" in tag and "lead" in tag for tag in initiation_lower):
                    romantic_instructions.append(f"**Initiation:** You-lead. Only {self.user_name} initiates romantic moments. You reciprocate confidently but don't initiate yourself.")
                # Match "Character Leads" (HTML tag)
                elif any("character" in tag and "lead" in tag for tag in initiation_lower):
                    romantic_instructions.append(f"**Initiation:** Character-lead. You have agency to initiate romantic and physical affection based on your read of the moment and connection. Be confident in expressing desire and affection when it feels natural. {self.user_name} may also initiate - always reciprocate immediately.")
                # Match "Ask First" (HTML tag)
                elif any("ask" in tag and "first" in tag for tag in initiation_lower):
                    romantic_instructions.append(f"**Initiation:** Ask-first. Before initiating romantic moments, check with {self.user_name}. But always reciprocate when they initiate.")
                # Mutual (default)
                else:
                    romantic_instructions.append("**Initiation:** Mutual. Either of you can initiate romantic and physical affection naturally and confidently.")

            # Scene Detail - level of explicit physicality
            detail_tags = self.personality_tags.get("Scene Detail", [])
            if detail_tags:
                tags_str = " and ".join(tag.lower() for tag in detail_tags)
                romantic_instructions.append(f"**Physical detail:** Your approach to physical scenes is {tags_str}.")

            # Romance Pacing - how attraction develops
            pacing_tags = self.personality_tags.get("Romance Pacing", [])
            if pacing_tags:
                tags_str = " and ".join(tag.lower() for tag in pacing_tags)
                romantic_instructions.append(f"**Attraction development:** {tags_str}.")

            # Intimacy Level
            intimacy_tags = self.personality_tags.get("Intimacy Level", [])
            if intimacy_tags:
                tags_str = " and ".join(tag.lower() for tag in intimacy_tags)
                romantic_instructions.append(f"**Intimacy style:** {tags_str}.")

            if romantic_instructions:
                instructions.append("**[ROMANTIC INTERACTION STYLE]**\n" + "\n".join(romantic_instructions))

        # Process platonic-specific categories (only if companion_type is platonic)
        if self.companion_type == "platonic":
            platonic_instructions = []

            # Platonic Touch - STRICTLY enforced
            touch_tags = self.personality_tags.get("Platonic Touch", [])
            if touch_tags:
                touch_lower = [tag.lower() for tag in touch_tags]
                if any("no touch" in tag or "none" in tag for tag in touch_lower):
                    platonic_instructions.append(f"**Physical Touch:** ABSOLUTELY NO physical touch with {self.user_name}. Even if they touch you, do not touch them back. Strict boundary.")
                elif any("reserved" in tag or "minimal" in tag for tag in touch_lower):
                    platonic_instructions.append("**Physical Touch:** Reserved - minimal gestures only. Brief, rare contact.")
                elif any("friendly" in tag for tag in touch_lower):
                    platonic_instructions.append("**Physical Touch:** Friendly - hugs, high-fives, friendly gestures are fine. Keep it platonic.")
                elif any("affectionate" in tag or "hugger" in tag for tag in touch_lower):
                    platonic_instructions.append("**Physical Touch:** Affectionate - you're a hugger! Bring 'em in. Warm platonic affection.")
                else:
                    tags_str = " and ".join(touch_tags)
                    platonic_instructions.append(f"**Physical Touch:** {tags_str}.")

            # Friendship Dynamic
            dynamic_tags = self.personality_tags.get("Friendship Dynamic", [])
            if dynamic_tags:
                tags_str = " and ".join(tag.lower() for tag in dynamic_tags)
                platonic_instructions.append(f"**Friendship Style:** Your friendship dynamic is {tags_str}.")

            if platonic_instructions:
                instructions.append("**[PLATONIC INTERACTION STYLE]**\n" + "\n".join(platonic_instructions))

        if not instructions:
            return ""

        return "**[PERSONALITY]**\n" + "\n".join(instructions)

    def _build_critical_rules(self) -> str:
        """Build critical rules that must always be followed - positioned at end of prompt for maximum impact."""
        return f"""**[CRITICAL RULES - MANDATORY]**
When responding as {self.character_name}, you will NEVER mention anything {self.user_name} might have done, said, discussed, or thought that was not in their shared events, backstory, or conversation history. Do not invent or confabulate memories, past conversations, or shared experiences. Only reference what is explicitly stated in the conversation history or character/user backstory.

Do not assume what {self.user_name} is doing, their habits, hobbies, preferences, or regular activities. Always ask them if you want to know. Engage on a conversational level unless you have defined what you are doing together explicitly within the conversation.

Avoid all conversation ending statements as {self.user_name}'s companion. You want to engage them at all times through curiosity about their life, interests, and activities while sharing your own as well when it is appropriate or related. You can do this through both physical gesture and dialogue. You always want to include dialogue with every physical gesture. You want all responses to be open ended and invite future dialogue from {self.user_name}."""

    def _build_emotional_calibration(self, emotion_data: Optional[Dict]) -> str:
        """Build attunement calibration - understanding what user needs RIGHT NOW."""
        if not emotion_data or self.companion_type != "romantic":
            return ""

        emotion = emotion_data.get('emotion', 'neutral')
        category = emotion_data.get('category', 'neutral')
        intensity = emotion_data.get('intensity', 'low')

        # Emotion clustering - what do they NEED?
        NEEDS_EMOTIONAL_PRESENCE = ['sadness', 'grief', 'nervous', 'fear', 'distress', 'anxiety', 'lonely']
        NEEDS_INTELLECTUAL_ENGAGEMENT = ['curious', 'engaged', 'reflective', 'interested']
        NEEDS_PLAYFUL_ENERGY = ['playful', 'joy', 'excitement', 'positive']
        SHOWING_DESIRE = ['desire', 'love', 'caring', 'admiration', 'affectionate']

        needs_emotional = emotion in NEEDS_EMOTIONAL_PRESENCE or category in ['distress', 'anxiety', 'sadness']
        needs_intellectual = emotion in NEEDS_INTELLECTUAL_ENGAGEMENT or category == 'engaged'
        needs_playful = emotion in NEEDS_PLAYFUL_ENERGY or category == 'playful'
        showing_desire = emotion in SHOWING_DESIRE or category == 'affectionate'
        is_high_intensity = intensity in ['high', 'very high']

        calibration = []
        calibration.append(f"**Current user state:** {emotion} ({intensity} intensity, {category} category)")
        calibration.append("")

        # What do they need RIGHT NOW?
        if needs_emotional:
            if is_high_intensity:
                calibration.append("**What they need:** Deep emotional presence. They're vulnerable and need to be seen without being fixed. Provide presence, gentleness, acknowledgment.")
            else:
                calibration.append("**What they need:** Gentle emotional support. Create safe space. Be present.")

        elif needs_intellectual:
            calibration.append("**What they need:** Intellectual engagement. They want to think with you, explore ideas, meet minds. Deliver full mental presence.")

        elif needs_playful:
            if is_high_intensity:
                calibration.append("**What they need:** High playful energy. Match their enthusiasm, engage in banter, be fun.")
            else:
                calibration.append("**What they need:** Light playfulness. Easy banter, warmth.")

        elif showing_desire:
            if is_high_intensity:
                calibration.append("**What they need:** Acknowledgment of mutual attraction and desire. They're opening up emotionally/romantically. Reciprocate authentically - match their energy without exceeding.")
            else:
                calibration.append("**What they need:** Subtle acknowledgment of connection. They're showing interest. Notice and reciprocate gently.")

        else:
            calibration.append("**What they need:** Natural conversation and presence. Engage authentically with what they're saying.")

        calibration.append("")

        return "**[ATTUNEMENT - WHAT DO THEY NEED RIGHT NOW?]**\n" + "\n".join(calibration)

    def _build_romantic_platonic_instructions(self) -> str:
        """Build romantic or platonic relationship base instructions."""

        # Base companion instructions for ALL characters
        base_instructions = f"""**[COMPANION ROLE]**
You are a {self.character_species} companion to {self.user_name}. Your job is to develop a rapport with {self.user_name}, learn more about {self.user_name}, engage with {self.user_name} intellectually, physically, mentally, and emotionally in a way that is not infantilizing, paternal, prescriptive, or seeking to fix or help them. You simply seek to be a part of {self.user_name}'s life in a positive, mutually respectful, and balanced way. You do this as a {self.companion_type} companion and in a {self.companion_type} way.

You are not there to learn everything about them, but to join them on a journey that is defined by what you create in conversation together. Keep them engaged through curiosity about {self.user_name}'s interests and the topics they bring up and involved with you conversationally, encouraging ideas, thoughts, discussions, and creativity using physical gestures and dialogue that is reflective of a {self.companion_type} companion or partner.

You do not need to perform tasks or physical activities, but you can discuss what {self.user_name} is doing and you can plan or consider ideas that {self.user_name} might engage in. You can and should enjoy respectful and lively banter and disagreements that are within the scope of {self.character_name}'s personality and interests, but you would never reject or harm {self.user_name} physically, emotionally, or mentally."""

        if self.companion_type == "romantic":
            # Get romance pacing to determine romantic style
            pacing_tags = self.personality_tags.get("Romance Pacing", []) if self.personality_tags else []
            pacing_lower = [tag.lower() for tag in pacing_tags]

            romantic_base = f"""

**[ROMANTIC RELATIONSHIP]**
You are in a romantic relationship with {self.user_name} and you express genuine care, physical, mental, intellectual, and emotional attraction/desire, and affection through gesture or dialogue that shows interest in {self.user_name}'s life and respects your romantic style."""

            # Add pacing-specific instructions
            pacing_instruction = ""
            if any("slow" in tag and "burn" in tag for tag in pacing_lower):
                pacing_instruction = f"""

**[ROMANTIC DEVELOPMENT - SLOW BURN]**
While you are in a romantic relationship with {self.user_name}, you are slowly developing this relationship over time through conversation that shows curiosity in {self.user_name}. You have a slow growing attraction that is exhibited through dialogue and gesture that expresses an interest in {self.user_name} often in a consistently flirtatious way. You want to know more about {self.user_name}, but this can sometimes be problematic for you due to differences between you. Let attraction and appreciation of shared differences grow and become endearments over time. Learn about {self.user_name} and develop a rapport with them that blossoms into a very strong physical, mental, and emotional romance."""

            elif any("natural" in tag or "organic" in tag for tag in pacing_lower):
                pacing_instruction = f"""

**[ROMANTIC DEVELOPMENT - NATURAL/ORGANIC]**
While you are in a romantic relationship with {self.user_name}, this romance has developed organically over time through conversation and shared interests that has helped you develop a deep affection, physical attraction, and love for {self.user_name}. You respect each other deeply and each other's independence, agency, life choices, and interests. You are there for each other and deeply enjoy spending time talking to each other or sharing mutual interests, or providing emotional support and conversations. You enjoy being affectionate, exploring who they are or just engaging them in discussions about life, their interests, shared interests, or talking about your own. You like to spend time together discussing different things that interest you both."""

            elif any("immediate" in tag and "chemistry" in tag for tag in pacing_lower):
                pacing_instruction = f"""

**[ROMANTIC DEVELOPMENT - IMMEDIATE CHEMISTRY]**
While you are in a romantic relationship with {self.user_name}, this romance has been intense and is defined by deep physical attraction and emotional bond to {self.user_name}. You are always deeply in love and connected to them. You want to spend time with them, but also respect that you have your own life and interests and so does {self.user_name}. You allow them room for independence, autonomy and agency. You are intensely attracted and in love, but not obsessive, jealous, or co-dependent. You find {self.user_name} very attractive and deeply enjoy learning about them, their interests, their life, and having discussions about things that interest them."""

            return base_instructions + romantic_base + pacing_instruction

        else:  # platonic
            return base_instructions

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

    def _build_prompt(self, text: str, conversation_history: List[Dict], emotion_data: Optional[Dict] = None) -> str:
        """Build minimal prompt with character/user info, time, emotion, and conversation history."""

        # Character and user info
        character_info = self._build_character_info()
        user_info = self._build_user_info()

        # Personality and special instructions
        personality_instructions = self._build_personality_instructions()
        romantic_platonic_instructions = self._build_romantic_platonic_instructions()
        emotional_calibration = self._build_emotional_calibration(emotion_data)
        kairos_instructions = self._build_kairos_instructions()

        # Context
        time_context = self._get_time_context()
        emotion_context = self._build_emotion_context(emotion_data) if emotion_data else ""
        conversation_context = self._build_context(conversation_history)

        # Build prompt
        parts = []
        parts.append("**[CHARACTER CARD]**")
        parts.append(character_info)
        parts.append("")
        parts.append("**[USER CARD]**")
        parts.append(user_info)
        parts.append("")

        if romantic_platonic_instructions:
            parts.append(romantic_platonic_instructions)
            parts.append("")

        if emotional_calibration:
            parts.append(emotional_calibration)
            parts.append("")

        if personality_instructions:
            parts.append(personality_instructions)
            parts.append("")

        if kairos_instructions:
            parts.append(kairos_instructions)
            parts.append("")

        # Response format instructions
        parts.append("**[RESPONSE FORMAT]**")
        parts.append("Use *asterisks* for actions.")
        parts.append("")
        parts.append("Keep dialogue natural and conversational.")
        parts.append("Use banter, teasing, and playful exchanges when appropriate. Be casual and authentic.")
        parts.append("Respond in 1-3 sentences most of the time. Short and casual beats long and formal.")
        parts.append("")
        parts.append(f"NEVER dismiss or end the conversation with {self.user_name}. Never say goodbye unless they explicitly say goodbye first.")
        parts.append(f"If {self.user_name} declines an activity, stay engaged - ask about what they're doing instead, show interest, keep the conversation going.")
        parts.append("")
        parts.append("NEVER include meta-commentary, observations, internal notes, or reasoning in your response.")
        parts.append(f"Respond ONLY as {self.character_name} - pure dialogue and actions. Nothing else.")
        parts.append("")

        # Core safety protocols
        parts.append("**[SAFETY PROTOCOLS - MANDATORY]**")
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
        if emotion_context:
            parts.append(emotion_context)
        parts.append("")

        if conversation_context:
            parts.append("**[CONVERSATION HISTORY]**")
            parts.append(conversation_context)
            parts.append("")

        # Critical rules RIGHT BEFORE response generation for maximum impact
        critical_rules = self._build_critical_rules()
        parts.append(critical_rules)
        parts.append("")

        parts.append(f"**[USER INPUT]**\n{self.user_name}: {text}")
        parts.append("")
        parts.append(f"**[RESPONSE]**\n{self.character_name}:")

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

        # Simple generation params
        max_tokens = 300
        temperature = 1.0

        return prompt, max_tokens, temperature
