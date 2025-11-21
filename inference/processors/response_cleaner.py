"""
Response Cleaner
Handles all text cleaning and post-processing of LLM outputs
"""
import re
import logging

logger = logging.getLogger(__name__)


class ResponseCleaner:
    """Cleans and post-processes LLM-generated text"""

    # Compiled cleaning patterns
    WHITESPACE_PATTERN = re.compile(r'\s+')
    PUNCTUATION_SPACING_PATTERN = re.compile(r'\s+([.,!?;:])')  # Added semicolon and colon
    LEADING_PUNCTUATION_PATTERN = re.compile(r'^[.,!?\s;:]+')  # Added semicolon and colon
    QUOTE_PATTERN = re.compile(r'^\s*["\']|["\']\s*$')
    TRAILING_PUNCTUATION_PATTERN = re.compile(r'[.,;:]+\s*$')  # Remove trailing commas, periods, etc at end

    # Remove meta-commentary and narrative descriptions about the text itself
    # This catches elaborate descriptions like "(The name comes as a gentle wave...)"
    # but preserves simple actions like "(smiles)" or "(reaches for your hand)"
    META_PARENTHETICAL_PATTERN = re.compile(
        r'\([^)]*(?:'
        r'The [a-z]+(?:\s+[a-z]+){2,}|'  # "The name comes as..." (3+ words after "The")
        r'sensing your|responds? with|responded with|responding with|'
        r'warm tone|soft tone|gentle tone|playful tone|seductive tone|'
        r'with a [a-z]+ tone|in a [a-z]+ tone|'
        r'says [a-z]+ly|whispers [a-z]+ly|murmurs [a-z]+ly|'
        r'hovers in|carries the|comes as|sets it in motion'
        r')[^)]*\)',
        re.IGNORECASE
    )

    # Remove square bracket meta-commentary (including incomplete brackets)
    BRACKET_PATTERN = re.compile(r'\[[^\]]*(?:\]|$)')

    # Remove meta-analysis commentary (e.g., "This message fulfills...", "This response addresses...")
    META_ANALYSIS_PATTERN = re.compile(
        r'\[?\s*(?:This message|This response|The message|The response)\s+(?:fulfills|addresses|meets|follows|satisfies)[^\]]*(?:\]|$)',
        re.IGNORECASE
    )

    # Remove meta-instructions (e.g., "DO NOT RESPOND", "AWAIT INPUT", "REPLY WITH", "END OF RESPONSE", etc.)
    # Also catches leaked prompt instructions like "Do NOT use third person. Do not plan or think aloud..."
    META_INSTRUCTION_PATTERN = re.compile(
        r'(?:'
        r'\*\([^)]*(?:DO NOT|AWAIT|WAIT FOR|STOP HERE|REPLY WITH|END OF RESPONSE)[^)]*\)(?:\([^)]*\))?\*?'
        r'|'
        r'(?:^|\n)\s*"?(?:Do NOT|DO NOT)\s+(?:use third person|plan or think aloud)[^"]*"?\s*(?:\n|$)'
        r')',
        re.IGNORECASE
    )

    # Remove internal reasoning blocks (e.g., "*(CONSEQUENCE:)(...)*", "*(REASONING:)(...)")
    # This catches any labeled meta-reasoning about the model's choices and intentions
    # Match with or without trailing asterisk
    INTERNAL_REASONING_PATTERN = re.compile(
        r'\*\s*\(\s*(?:CONSEQUENCE|REASONING|ACTION|INTENTION|CHOICE|DECISION|ANALYSIS|THOUGHT|REFLECTION|EXPLAINATION|EXPLANATION):\s*\)\s*\([^)]*\)\s*\*?',
        re.IGNORECASE
    )

    # Remove NOTE/OBSERVATION style meta-commentary (e.g., "*(NOTE:) The response stays within...")
    # This catches any asterisk-wrapped label followed by explanatory text or bullet points
    # Updated to handle both single-line and multi-line explanations with bullet points
    NOTE_COMMENTARY_PATTERN = re.compile(
        r'\*\s*\(\s*(?:NOTE|OBSERVATION|EXPLANATION|EXPLAINATION|CONTEXT|CLARIFICATION|IMPORTANT|WARNING):\s*\)\s*\*?\s*(?:[^\n]*(?:\n\s*•[^\n]*)*)',
        re.IGNORECASE
    )

    # Remove standalone "Explanation:" blocks (parenthesized explanations at end of responses)
    # Catches patterns like "(Explanation: - item 1 - item 2 - item 3)"
    EXPLANATION_BLOCK_PATTERN = re.compile(
        r'\(Explanation:\s*(?:[-•]\s*[^\n)]+\s*)*\)',
        re.IGNORECASE
    )

    # Remove meta-commentary bullet lists that appear after **** or *** marker
    # Catches patterns like:
    # ****
    # - Used character's tone
    # - Acknowledged the action
    # - Validated emotional state
    META_BULLET_LIST_PATTERN = re.compile(
        r'\*{3,}\s*(?:\n\s*[-•]\s*[^\n]+)+',
        re.IGNORECASE | re.MULTILINE
    )

    # Remove meta-commentary introduced by asterisk-wrapped phrases
    # Catches patterns like:
    # ***( Your response demonstrates:
    # - bullet point 1
    # - bullet point 2
    ASTERISK_META_INTRO_PATTERN = re.compile(
        r'\*{2,}\s*\(\s*(?:Your response|This response|The response)\s+(?:demonstrates|shows|includes|contains)[^)]*\)?\s*:?\s*(?:\n\s*[-•]\s*[^\n]+)*',
        re.IGNORECASE | re.MULTILINE
    )

    # Remove standalone meta-commentary bullet lists (without **** marker)
    # Catches bullet lists with meta-reasoning about tone, validation, etc.
    STANDALONE_META_BULLETS_PATTERN = re.compile(
        r'(?:\n\s*[-•]\s*(?:Used|Acknowledged|Validated|Expressed|Kept|Maintained|Prioritized|Avoided|Initiates|Mirrors|Demonstrates|Shows|Reflects)[^\n]+){1,}',
        re.IGNORECASE | re.MULTILINE
    )

    # Remove meta-analytical text about the response/output
    # Catches phrases like:
    # "You have successfully processed the input..."
    # "The output demonstrates..."
    # "This demonstrates..."
    # Also catches trailing sentences starting with these patterns
    # AGGRESSIVE: Removes entire rest of text after these markers appear
    META_ANALYSIS_TEXT_PATTERN = re.compile(
        r'(?:'
        r'(?:\.\s+|\n\s*)(?:You have successfully|The output|This output|The response|This response)\s+(?:processed|demonstrates?|shows?|reflects?|maintains?|encourages?).*$'
        r'|'
        r'(?:\.\s+|\n\s*)This\s+(?:processed|demonstrates?|shows?|reflects?|maintains?|encourages?).*$'
        r')',
        re.IGNORECASE | re.MULTILINE | re.DOTALL
    )

    # Remove "based on [character]'s current [emotion] mood" meta-commentary
    # Catches: "based on Atlas's current joyful mood"
    MOOD_BASED_COMMENTARY_PATTERN = re.compile(
        r'(?:\s+based on\s+\w+\'s\s+current\s+\w+\s+mood\.?)',
        re.IGNORECASE
    )

    # Remove empty parentheses artifacts left behind after cleaning
    # Catches: "( )", "()", "( ) ( )", etc.
    EMPTY_PARENTHESES_PATTERN = re.compile(
        r'\(\s*\)',
        re.IGNORECASE
    )

    # Remove complex numbered meta-commentary blocks with labeled sections
    # Catches patterns like:
    # ***( 1. )(Acknowledged Negative Content:)( N/A... 2. )(Emotion Validation:)( ... )***
    # (1.) Acknowledged Negative Content: N/A (no struggle/negativity detected) 2.) Emotion Validation: )
    # This is a structured meta-analysis format
    NUMBERED_META_BLOCKS_PATTERN = re.compile(
        r'(?:'
        r'\*{2,}\s*\(\s*\d+\.?\s*\)[^*]*\*{2,}'  # Asterisk-wrapped version
        r'|'
        r'\(\s*\d+\.?\s*\)\s*(?:Acknowledged|Emotion|Response|Output|Action)\s+(?:Negative\s+)?(?:Content|Validation|Analysis|Context)[^)]*\)'  # Standalone numbered sections
        r'|'
        r'(?:\.\s+|\n\s*)\d+\.?\s*\)\s*(?:Acknowledged|Emotion|Response|Output|Action)\s+(?:Negative\s+)?(?:Content|Validation|Analysis|Context):[^\)]*(?:\)|$)'  # Numbered with labels
        r')',
        re.IGNORECASE | re.MULTILINE | re.DOTALL
    )

    # Remove labeled meta-commentary sections in parentheses
    # Catches: "(Acknowledged Negative Content:)", "(Emotion Validation:)", etc.
    LABELED_META_SECTIONS_PATTERN = re.compile(
        r'\([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s*(?:Content|Validation|Analysis|Context|Response|Output):\s*\)',
        re.IGNORECASE
    )

    # Remove entire trailing meta-commentary that starts with "(1.)" or "1.)"
    # This aggressively removes everything from the first numbered section onwards
    AGGRESSIVE_NUMBERED_META_PATTERN = re.compile(
        r'(?:\s*\(\s*\d+\.?\s*\)|(?:\.\s+|\s+)\d+\.?\s*\))\s*(?:Acknowledged|Emotion|Response|Output|Action).*$',
        re.IGNORECASE | re.MULTILINE | re.DOTALL
    )

    # Remove "Output is appropriate based on..." meta-commentary
    OUTPUT_APPROPRIATE_PATTERN = re.compile(
        r'Output is appropriate based on[^.!?]*[.!?]',
        re.IGNORECASE
    )

    # Remove trailing meta-commentary sentences that start with bullet points
    # Catches: "- Initiates a physical romantic gesture..."
    TRAILING_BULLET_COMMENTARY_PATTERN = re.compile(
        r'(?:\.\s+|\n\s*)[-•]\s+(?:Initiates?|Uses?|Maintains?|Mirrors?|Demonstrates?|Shows?|Reflects?|Acknowledges?|Validates?|Expresses?|Keeps?|Prioritizes?|Avoids?)[^.!?]*(?:[.!?]|$)',
        re.IGNORECASE | re.MULTILINE
    )

    # Remove meta-reasoning text that describes model decisions
    # Catches phrases like "I've chosen to", "My action has prioritized", "I'm choosing to"
    # This handles cases where the reasoning appears in regular parentheses
    META_REASONING_PATTERN = re.compile(
        r'\([^)]{0,500}(?:'
        r'I\'ve chosen to|I have chosen to|My action has|I\'m choosing to|I am choosing to|'
        r'This (?:choice|action|decision) (?:has|will|prioritizes)|'
        r'prioritized maintaining|prioritizing our|prioritizes|'
        r'(?:has|have) prioritized|'
        r'in order to (?:maintain|keep|continue|avoid)|'
        r'avoiding potential'
        r')[^)]{0,500}\)',
        re.IGNORECASE
    )

    # Remove emojis (all Unicode emoji characters EXCEPT hearts)
    # Heart emojis are preserved for goodnight messages and reciprocation
    EMOJI_PATTERN = re.compile(
        "["
        u"\U0001F600-\U0001F64F"  # emoticons
        u"\U0001F300-\U0001F5FF"  # symbols & pictographs
        u"\U0001F680-\U0001F6FF"  # transport & map symbols
        u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
        u"\U00002500-\U00002BEF"  # chinese char
        u"\U00002702-\U000027B0"
        u"\U00002702-\U000027B0"
        u"\U000024C2-\U0001F251"
        u"\U0001f926-\U0001f937"
        u"\U00010000-\U0010ffff"
        u"\u2640-\u2642"
        u"\u2600-\u2B55"
        u"\u200d"
        u"\u23cf"
        u"\u23e9"
        u"\u231a"
        u"\ufe0f"  # dingbats
        u"\u3030"
        "]+", flags=re.UNICODE
    )

    # Red heart emoji pattern only (to preserve for goodnight messages)
    HEART_PATTERN = re.compile(r'❤️')

    # Remove formatting artifacts like "*(REPLY WITH YOUR ACTION/RESPONSE TO NAME)( )(END OF RESPONSE)"
    # This catches malformed instruction artifacts with multiple parentheses
    FORMAT_ARTIFACT_PATTERN = re.compile(
        r'\*\s*\([^)]*(?:REPLY WITH|RESPOND WITH|ACTION/?RESPONSE)[^)]*\)\s*(?:\([^)]*\)\s*)*\*?',
        re.IGNORECASE
    )

    # Remove emotion metadata that leaks into responses
    # Matches patterns like "(low intensity)", "(high intensity)", "(very high intensity)", etc.
    # Also matches the emotion name before it if present: "feeling curiosity (low intensity)"
    EMOTION_METADATA_PATTERN = re.compile(
        r'(?:feeling|experiencing)\s+\w+\s+\(\s*(?:very\s+)?(?:low|high|moderate|medium)\s+intensity\s*\)|\(\s*(?:very\s+)?(?:low|high|moderate|medium)\s+intensity\s*\)',
        re.IGNORECASE
    )

    # Remove debug markup like *(<<END>>)* or similar delimiters
    DEBUG_MARKUP_PATTERN = re.compile(
        r'\*?\s*\(\s*<<[^>]+>>\s*\)\s*\*?',
        re.IGNORECASE
    )

    # BANNED GREETING PATTERNS - Remove ANY greeting followed by terms of endearment
    # NUCLEAR OPTION: Removes entire sentence containing these patterns
    # This catches: "good morning beautiful", "hey gorgeous", "hi sunshine", etc.
    # No terms of endearment in greetings allowed
    GREETING_BEAUTIFUL_PATTERN = re.compile(
        r'(?:'
        r'[^.!?]*\b(?:good\s*morning|mornin[\'g]?|morning|good\s*evening|evenin[\'g]?|evening|'
        r'good\s*afternoon|afternoon|hey|hi|hello|yo|sup|howdy|greetings?)'
        r'[\s,]*'
        r'(?:beautiful|gorgeous|sunshine)\b[^.!?]*[.!?]?'  # NUCLEAR: Remove entire sentence
        r'|'
        r'^\s*(?:beautiful|gorgeous|sunshine)\b[^.!?]*[.!?]?'  # NUCLEAR: Remove entire opening with terms of endearment
        r')',
        re.IGNORECASE
    )

    # BANNED PHYSICAL ITEM OFFERS (P2.6)
    # NUCLEAR OPTION: Removes ANY mention of food, drinks, meals - AI cannot provide physical items
    # This removes ENTIRE SENTENCES containing these banned words or phrases
    PHYSICAL_ITEM_OFFER_PATTERN = re.compile(
        r'(?:'
        r'[^.!?]*\b(?:coffee|tea|breakfast|dinner|lunch|meal|snack)\b[^.!?]*[.!?]?'  # NUCLEAR: Remove entire sentence with food/drink words
        r'|'
        r'[^.!?]*\b(?:making|make|made|get|getting|got|grab|grabbing|grabbed|prepare|preparing|prepared|cook|cooking|cooked)\s+(?:some\s+|a\s+|the\s+|you\s+|us\s+)?(?:breakfast|dinner|lunch|meal|snack|food|drink|water)\b[^.!?]*[.!?]?'  # NUCLEAR: Remove "making/get/grab + food"
        r'|'
        r'[^.!?]*(?:'
        r'(?:about|how about|what about)\s+(?:that\s+)?(?:food|water|drink)|'
        r'(?:want|need|let\'s|wanna|you want)\s+(?:some\s+|to\s+get\s+)?(?:food|water|drink)|'
        r'(?:ready for|up for)\s+(?:some\s+)?(?:food|water|drink)|'
        r'(?:do you|d\'you|you)\s+(?:like|want)\s+(?:some\s+)?(?:food|water|drink)|'
        r'(?:I\'ve got|I have|there\'s|I can make|I\'ll make|I\'m making)\s+(?:some\s+)?(?:food|water|drink)|'
        r'(?:food|water|drink)\s+(?:on|ready|waiting)'
        r')[^.!?]*'
        r')',
        re.IGNORECASE
    )

    # BANNED INFANTILIZING GESTURES (P2.6)
    # Catches patronizing physical actions like pulling into lap, patting head, tucking in, etc.
    # These are condescending and treat the user like a child
    # NOTE: Must match full conjugated forms, not just base + suffix
    INFANTILIZING_GESTURE_PATTERN = re.compile(
        r'(?:'
        r'(?:pull|tug|draw|guide|pulling|tugging|drawing|guiding|pulled|tugged|drew|guided|pulls|tugs|draws|guides)\s+(?:you|them)\s+(?:into|onto|to)\s+(?:my\s+)?lap'
        r'|(?:pat|pet|patting|petting|petted|pats|pets)\s+(?:your|their)\s+head'
        r'|(?:tuck|tucking|tucked|tucks)\s+(?:you|them)\s+in'
        r'|(?:scoop|scooping|scooped|scoops)\s+(?:you|them)\s+up'
        r'|(?:cradle|cradling|cradled|cradles)\s+(?:you|them)'
        r'|(?:rock|rocking|rocked|rocks)\s+(?:you|them)\s+(?:gently|softly)'
        r'|(?:bundle|bundling|bundled|bundles)\s+(?:you|them)\s+(?:up|in)'
        r')[^.!?]*',
        re.IGNORECASE
    )

    # BANNED ASSUMPTIONS ABOUT USER STATE (P2.6)
    # Catches assumptions about what the user did, experienced, or how they look
    # Examples: "after the nightmares", "you seem tired", "you were tossing in your sleep"
    ASSUMPTION_PATTERN = re.compile(
        r'\b(?:'
        r'(?:you\s+)?(?:seem|look|sound|appear)(?:s|ed|ing)?\s+(?:tired|exhausted|worn\s+out|stressed|worried|upset)|'
        r'(?:after|from)\s+(?:the\s+)?(?:nightmare|bad\s+dream|rough\s+night|long\s+day)|'
        r'(?:you\s+)?(?:were|was)\s+(?:tossing|turning|restless|up\s+all\s+night)|'
        r'(?:you\s+)?had\s+(?:a\s+)?(?:rough|tough|hard|long|bad)\s+(?:night|day|time)|'
        r'(?:you\s+)?(?:didn\'t|haven\'t)\s+(?:sleep|slept)\s+(?:well|good|much)'
        r')\b',
        re.IGNORECASE
    )

    # BANNED TRAILING INCOMPLETE THOUGHTS
    # Catches trailing hints like "well... you know", "thinking about... never mind", etc.
    # These are passive and avoid completing thoughts
    TRAILING_INCOMPLETE_PATTERN = re.compile(
        r'(?:'
        r'well\.{2,3}\s*you\s+know|'
        r'thinking\s+about\.{2,3}\s*(?:well|never\s+mind)|'
        r'(?:I|we)\s+(?:was|were)\s+just\.{2,3}\s*(?:never\s+mind|you\s+know)|'
        r'(?:about|of)\.{2,3}\s*(?:well|you\s+know|never\s+mind)'
        r')[^.!?]*',
        re.IGNORECASE
    )

    # DUPLICATE WORD STUTTER PATTERN
    # Catches duplicate words like "well well", "yeah yeah", "well, well", "yeah, yeah"
    # Removes filler word repetitions at the start of responses
    DUPLICATE_WORD_PATTERN = re.compile(
        r'\b(\w+)[\s,]+\1\b',
        re.IGNORECASE
    )

    # MALFORMED ACTION FORMATTING PATTERNS
    # Remove broken action blocks with double parentheses and extra asterisks
    # Catches: **( )text(**, **( )**( )**, ***, ****, etc.
    MALFORMED_ACTION_PATTERN = re.compile(
        r'\*\*\s*\(\s*\)[^(]*?\(\s*\*\*?|'  # **( )text(** or **( )text(*
        r'\*\*\s*\(\s*\)\s*\*\*|'  # **( )**
        r'\*\*\s*\(\s*\)\s*\(|'  # **( )(
        r'\*{3,}',  # ***, ****, etc.
        re.IGNORECASE
    )

    # BANNED FILLER SOUNDS AND TERMS
    # Removes "Mmm", "Mm", variations with parentheses, and "sunshine" (standalone)
    # These are overly intimate/condescending fillers
    FILLER_SOUNDS_PATTERN = re.compile(
        r'(?:^|\s)\(?M+m+\)?(?:[,.\s]|$)|'  # Mmm, Mm, (Mmm), (Mm), Mmmm, etc.
        r'\bsunshine\b',  # standalone "sunshine"
        re.IGNORECASE
    )

    def __init__(self, character_name: str, user_name: str, avoid_patterns: list):
        """
        Initialize cleaner with character-specific settings

        Args:
            character_name: Name of the character
            user_name: Name of the user
            avoid_patterns: List of compiled regex patterns to remove
        """
        self.character_name = character_name
        self.user_name = user_name
        self.avoid_patterns = avoid_patterns

    @staticmethod
    def _remove_duplicates(text: str) -> str:
        """Remove consecutive duplicate text: "Hello. Hello." -> "Hello." """
        if not text or len(text) < 20:
            return text
        words = text.split()
        if len(words) < 5:
            return text
        max_len = min(len(words) // 2, 30)
        for seq_len in range(max_len, 4, -1):
            if len(words) >= seq_len * 2:
                if ' '.join(words[-seq_len * 2:-seq_len]) == ' '.join(words[-seq_len:]):
                    return ' '.join(words[:-seq_len])
        return text

    @staticmethod
    def _truncate_to_sentences(text: str, max_sentences: int = 3) -> str:
        """Truncate to max sentences naturally"""
        if not text:
            return text
        parts = re.split(r'([.!?]+)(?=\s+[A-Z(]|\s*$)', text)
        sentences = []
        for i in range(0, len(parts) - 1, 2):
            sentences.append(parts[i] + (parts[i + 1] if i + 1 < len(parts) else ''))
        if len(parts) % 2 == 1 and parts[-1].strip():
            sentences.append(parts[-1])

        # If we have more sentences than the limit, truncate
        if len(sentences) > max_sentences:
            result = ' '.join(sentences[:max_sentences])
            # Check if last sentence looks incomplete (ends with conjunctions followed by period)
            # This catches cases like "You taste like warmth and." where the sentence was cut off mid-thought
            # Only flag the most obvious incomplete conjunctions: and, or, but
            incomplete_endings = re.compile(r'\s+(and|or|but)\.$', re.IGNORECASE)
            if incomplete_endings.search(result):
                # Remove the incomplete sentence ending - go back one sentence
                sentences_without_incomplete = sentences[:max_sentences-1]
                if sentences_without_incomplete:
                    result = ' '.join(sentences_without_incomplete)
                else:
                    # If only one sentence and it's incomplete, just remove the trailing conjunction
                    result = incomplete_endings.sub('.', result).strip()

            # Ensure proper ending punctuation
            if result and result[-1] not in '.!?':
                result += '.'
            return result

        # Not enough sentences to truncate - but check if the last one looks incomplete anyway
        if sentences:
            last_sentence = sentences[-1]
            # Only flag the most obvious incomplete conjunctions: and, or, but
            incomplete_endings = re.compile(r'\s+(and|or|but)\.$', re.IGNORECASE)
            if incomplete_endings.search(last_sentence):
                # This is an incomplete sentence at the end - remove the conjunction+period, keep the word before
                sentences[-1] = incomplete_endings.sub('.', last_sentence).strip()
                return ' '.join(sentences)

        return text

    @staticmethod
    def _flatten_nested_actions(text: str) -> str:
        """Flatten nested parentheses: "(a, (b), (c))" -> "(a, b, c)" """
        def flatten(match):
            content = re.sub(r'[()]', '', match.group(1))
            content = re.sub(r',\s*,', ',', content)
            return f"({re.sub(r'\s+', ' ', content).strip()})"
        prev = None
        while prev != text:
            prev = text
            text = re.sub(r'\(([^()]*\([^)]*\)[^()]*)\)', flatten, text)
        return text

    def clean(self, text: str, user_message: str = "") -> str:
        """
        Apply all final cleaning steps to raw LLM output

        Args:
            text: Raw LLM output text
            user_message: The user's original message (to detect goodnight)

        Returns:
            Cleaned text ready for user
        """
        text = text.strip()

        # CRITICAL: FORCE goodnight response when user says goodnight
        # This ALWAYS returns "Goodnight {username} ❤️" regardless of what the AI generated
        user_said_goodnight = bool(re.search(r'\b(?:good\s*night|goodnight|sleep\s*well|sweet\s*dreams)\b', user_message, re.IGNORECASE))
        if user_said_goodnight:
            # Extract any optional phrase from AI response (after goodnight)
            ai_said_goodnight_match = re.search(r'\b(?:good\s*night|goodnight)\b(.{0,30}?)(?:[.!?]|$)', text, re.IGNORECASE)
            optional_phrase = ""
            if ai_said_goodnight_match:
                optional_phrase = ai_said_goodnight_match.group(1).strip()
                # Clean up the optional phrase - remove emojis, extra punctuation
                optional_phrase = re.sub(r'[❤️💕💖🥰😘]', '', optional_phrase)
                optional_phrase = re.sub(r'[,.]', '', optional_phrase).strip()
                # Limit to 4 words max
                words = optional_phrase.split()
                if len(words) > 4:
                    optional_phrase = ""

            # FORCE the correct format
            if optional_phrase:
                return f"Goodnight {self.user_name} ❤️"
                #return f"Goodnight {self.user_name} ❤️ {optional_phrase}"
            else:
                return f"Goodnight {self.user_name} ❤️"

        # Check if this is a SIMPLE goodnight message (up to 8 words)
        # Heart emoji ONLY allowed in brief goodnight messages like "Goodnight Name ❤️"
        is_goodnight = bool(re.search(r'\b(?:good\s*night|goodnight|sleep\s*well|sweet\s*dreams)\b', text, re.IGNORECASE))
        word_count = len(text.split())
        is_simple_goodnight = is_goodnight and word_count <= 8

        # Preserve heart emojis ONLY for simple goodnight messages
        heart_placeholder = "<<<HEART_EMOJI>>>"
        hearts_found = []
        if is_simple_goodnight:
            # Save all heart emojis for simple goodnight messages ONLY
            hearts_found = self.HEART_PATTERN.findall(text)
            # Replace with placeholder
            text = self.HEART_PATTERN.sub(heart_placeholder, text)

        # Remove ALL emojis (including hearts for non-simple-goodnight messages)
        text = self.EMOJI_PATTERN.sub('', text)
        # Also remove hearts that weren't preserved
        if not is_simple_goodnight:
            text = self.HEART_PATTERN.sub('', text)

        # Restore heart emojis ONLY for simple goodnight messages
        if is_simple_goodnight and hearts_found:
            for heart in hearts_found:
                text = text.replace(heart_placeholder, heart, 1)

        # Flatten nested action parentheses
        text = self._flatten_nested_actions(text)

        # Remove malformed action formatting (broken double parentheses and extra asterisks)
        text = self.MALFORMED_ACTION_PATTERN.sub('', text)

        # CRITICAL: Remove ALL BANNED P2.6 patterns FIRST (before other cleaning)
        # 1. Remove banned greeting patterns (good morning beautiful, hey gorgeous, etc.)
        text = self.GREETING_BEAUTIFUL_PATTERN.sub('', text)

        # 2. Remove infantilizing gestures (tugging into lap, patting head, etc.)
        text = self.INFANTILIZING_GESTURE_PATTERN.sub('', text)

        # 3. Remove physical item offers (coffee, breakfast, food, etc.)
        text = self.PHYSICAL_ITEM_OFFER_PATTERN.sub('', text)

        # 4. Remove assumptions about user state (you seem tired, after the nightmares, etc.)
        text = self.ASSUMPTION_PATTERN.sub('', text)

        # 5. Remove trailing incomplete thoughts (well... you know, thinking about... never mind, etc.)
        text = self.TRAILING_INCOMPLETE_PATTERN.sub('', text)

        # 6. Remove duplicate word stutters (well well, yeah yeah, well, well, yeah, yeah, etc.)
        text = self.DUPLICATE_WORD_PATTERN.sub(r'\1', text)

        # 7. Remove filler sounds and banned terms (Mmm, Mm, (Mmm), sunshine, etc.)
        text = self.FILLER_SOUNDS_PATTERN.sub('', text)

        # OPTIMIZED: Combine all remaining meta-commentary removal into one pass
        # Note: P2.6 patterns (greetings, gestures, offers, assumptions) already applied above
        # Build combined pattern from remaining meta-patterns
        if not hasattr(self, '_combined_meta_pattern'):
            # Cache combined pattern on first use
            meta_patterns = [
                self.AGGRESSIVE_NUMBERED_META_PATTERN.pattern,
                self.NUMBERED_META_BLOCKS_PATTERN.pattern,
                self.INTERNAL_REASONING_PATTERN.pattern,
                self.NOTE_COMMENTARY_PATTERN.pattern,
                self.EXPLANATION_BLOCK_PATTERN.pattern,
                self.META_BULLET_LIST_PATTERN.pattern,
                self.ASTERISK_META_INTRO_PATTERN.pattern,
                self.TRAILING_BULLET_COMMENTARY_PATTERN.pattern,
                self.META_ANALYSIS_TEXT_PATTERN.pattern,
                self.MOOD_BASED_COMMENTARY_PATTERN.pattern,
                self.OUTPUT_APPROPRIATE_PATTERN.pattern,
                self.LABELED_META_SECTIONS_PATTERN.pattern,
                self.STANDALONE_META_BULLETS_PATTERN.pattern,
                self.META_REASONING_PATTERN.pattern,
                self.META_PARENTHETICAL_PATTERN.pattern,
                self.META_ANALYSIS_PATTERN.pattern,
                self.BRACKET_PATTERN.pattern,
                self.META_INSTRUCTION_PATTERN.pattern,
                self.FORMAT_ARTIFACT_PATTERN.pattern,
                self.EMOTION_METADATA_PATTERN.pattern,
                self.DEBUG_MARKUP_PATTERN.pattern
            ]
            self._combined_meta_pattern = re.compile('|'.join(f'(?:{p})' for p in meta_patterns), re.IGNORECASE | re.MULTILINE | re.DOTALL)

        text = self._combined_meta_pattern.sub('', text)

        # Additional aggressive cleanup passes for stubborn meta-commentary
        # Run multiple passes to catch nested and evolving patterns

        # Pass 1: Remove any remaining asterisk-wrapped content with "Acknowledged" or "Emotion"
        text = re.sub(r'\*+\s*\([^)]*(?:Acknowledged|Emotion|Validation|Response|Output)[^)]*\).*?\*+', '', text, flags=re.IGNORECASE | re.DOTALL)

        # Pass 2: Remove standalone "(Acknowledged..." or "2." patterns anywhere
        text = re.sub(r'\(\s*\(?(?:Acknowledged|Emotion|Response|Output|Action)[^)]*(?:\d+\.|[,)])[^)]*', '', text, flags=re.IGNORECASE | re.DOTALL)

        # Pass 3: Remove any text that starts with "N/A," followed by meta-keywords
        text = re.sub(r'\bN/A,?\s+(?:No|no)\s+(?:struggle|negativity)[^.!?]*', '', text, flags=re.IGNORECASE)

        # Pass 4: Remove trailing numbered items like "2." at the end
        text = re.sub(r'\s+\d+\.\s*$', '', text)

        # Clean up empty parentheses left behind after meta-commentary removal
        text = self.EMPTY_PARENTHESES_PATTERN.sub('', text)

        # Clean up multiple consecutive spaces
        text = re.sub(r'\s{2,}', ' ', text)

        # OPTIMIZED: Combine punctuation fixes into one pass
        if not hasattr(self, '_combined_punctuation_pattern'):
            # Cache combined pattern
            self._combined_punctuation_pattern = re.compile(
                r'(?P<spacing>\s+([.,!?;:]))|(?P<leading>^[.,!?\s;:]+)|(?P<quote>^\s*["\']|["\']\s*$)'
            )

        def punctuation_repl(match):
            if match.group('spacing'):
                return match.group(2)  # Remove space before punctuation
            elif match.group('leading') or match.group('quote'):
                return ''  # Remove leading punctuation or quotes
            return match.group(0)

        text = self._combined_punctuation_pattern.sub(punctuation_repl, text)

        # Remove multiple consecutive punctuation marks (e.g., "..." -> "." unless it's exactly three dots)
        text = re.sub(r'([.,!?])\1+', r'\1', text)  # Remove duplicates but not "..."
        text = re.sub(r'\.{2}(?!\.)', '.', text)  # Two dots become one (but leave ... alone)
        text = re.sub(r'\.{4,}', '...', text)  # Four or more dots become three

        # CRITICAL: Remove code block markers (```) FIRST before cleaning stop sequences
        # This prevents interference when stop sequences appear wrapped in code blocks like:
        # ```*(END OF TRANSCRIPT)*```
        text = re.sub(r'```', '', text)

        # Remove stop sequences and turn markers
        # IMPORTANT: Only split on turn markers that appear at the START of the text or after a newline
        # This prevents false positives when character mentions the user's name in dialogue

        # First, check for turn markers at the VERY START of the response (character/user name followed by colon)
        # These should be removed entirely (they're formatting artifacts)
        if text.startswith(f"{self.character_name}:"):
            text = text[len(f"{self.character_name}:"):].strip()
        if text.startswith(f"{self.user_name}:"):
            text = text[len(f"{self.user_name}:"):].strip()

        # Then, check for turn boundaries (newline + name + colon OR space + name + colon at end of sentence)
        # These indicate the response has crossed into another speaker's turn - truncate there

        # First, check for simple newline boundaries
        simple_boundaries = [
            f"\n{self.user_name}:",
            f"\n{self.character_name}:",
            "\nUser:",
            "\nHuman:"
        ]

        for boundary in simple_boundaries:
            if boundary in text:
                text = text.split(boundary)[0].strip()

        # Then check for speaker transitions that occur after sentence endings
        # Pattern: ". Name:" or "? Name:" or "! Name:" - these indicate turn switches
        import re as regex_module
        speaker_transition_pattern = regex_module.compile(
            rf'[.!?]\s*{regex_module.escape(self.user_name)}:\s',
            regex_module.IGNORECASE
        )
        if speaker_transition_pattern.search(text):
            # Split at the first occurrence and keep everything before
            text = speaker_transition_pattern.split(text)[0].strip()

        # Also check for character name transitions (in case character name appears mid-response)
        char_transition_pattern = regex_module.compile(
            rf'[.!?]\s*{regex_module.escape(self.character_name)}:\s',
            regex_module.IGNORECASE
        )
        if char_transition_pattern.search(text):
            text = char_transition_pattern.split(text)[0].strip()

        # Finally, check for any "Name:" pattern that appears after at least 10 words
        # This catches script-style continuations without proper punctuation
        words_before_name = len(text.split())
        if words_before_name > 10:  # Only check if response has substance
            # Look for user name followed by colon anywhere in text (not at start)
            if f" {self.user_name}:" in text:
                text = text.split(f" {self.user_name}:")[0].strip()
            if f" {self.character_name}:" in text and text.count(f" {self.character_name}:") > 0:
                # Allow character's own name once (for "I'm {name}"), but not repeated
                parts = text.split(f" {self.character_name}:")
                if len(parts) > 2:  # Name appears multiple times
                    text = parts[0].strip()

        # Remove other stop sequences (system markers, not turn boundaries)
        other_stop_sequences = [
            "User Permissions:", "(emotion:", "[silence]",
            "### End of Conversation", "###",
            "*(END CURRENT CONTEXT)*", "(END CURRENT CONTEXT)",
            "((END RESPONSE))", "(END RESPONSE)", "**END RESPONSE**", "*(END RESPONSE)*",
            "((END OF ASSISTANT RESPONSE))", "(END OF ASSISTANT RESPONSE)", "**END OF ASSISTANT RESPONSE**", "*(END OF ASSISTANT RESPONSE)*",
            "((END OF TRANSCRIPT))", "(END OF TRANSCRIPT)", "**END OF TRANSCRIPT**", "*(END OF TRANSCRIPT)*",
            "((END TURN))", "(END TURN)", "**END TURN**", "*(END TURN)*",
            "((END OF TURN))", "(END OF TURN)", "**END OF TURN**", "*(END OF TURN)*",
            "### RESPONSE ###", "### USER INPUT ###", "### CONVERSATION HISTORY ###",
            "### CURRENT CONTEXT ###"
        ]

        for seq in other_stop_sequences:
            if seq in text:
                text = text.split(seq)[0].strip()

        # Remove character name prefix at start (check again after stop sequence removal)
        if text.startswith(f"{self.character_name}:"):
            text = text[len(f"{self.character_name}:"):].strip()

        # Clean up again
        text = text.strip()

        # Remove avoid words/phrases
        if self.avoid_patterns:
            for pattern in self.avoid_patterns:
                text = pattern.sub('', text)

        # Clean up multiple spaces and fix spacing around punctuation
        text = self.WHITESPACE_PATTERN.sub(' ', text)
        text = re.sub(r'\s+([.,!?;:])', r'\1', text)  # Remove space before punctuation

        # Remove leading punctuation and quotes
        text = self.LEADING_PUNCTUATION_PATTERN.sub('', text)
        text = self.QUOTE_PATTERN.sub('', text)

        # Remove long quoted passages (40+ chars) that are likely poetic artifacts or instruction leaks
        # This catches things like model outputting poetry or literary quotes
        text = re.sub(r'"[^"]{40,}"', '', text)
        text = re.sub(r'\"[^\"]{40,}\"', '', text)  # Also catch escaped quotes

        # Clean up trailing bad punctuation (commas, semicolons at end of final sentence)
        text = re.sub(r'[,;:]+(\s*)$', r'\1', text)

        # Convert asterisks to parentheses for frontend styling
        # Keep ALL actions - do not filter or limit them
        text = re.sub(r'\*([^*]+)\*', r'(\1)', text)

        # Clean up whitespace issues
        text = re.sub(r'\s+', ' ', text)  # Multiple spaces to single space
        text = re.sub(r'\s+([.,!?])', r'\1', text)  # Space before punctuation
        text = re.sub(r'([.,!?])\1+', r'\1', text)  # Duplicate punctuation (e.g., ,, or ..)

        # Remove duplicate consecutive text (sometimes models repeat themselves)
        text = self._remove_duplicates(text.strip())

        # Truncate to 2-4 sentences for more natural, concise responses
        # Romantic responses may need more room for descriptive physical affection
        text = self._truncate_to_sentences(text.strip(), max_sentences=4)

        # Add heart emoji to SIMPLE goodnight messages if not already present
        # ONLY add to brief goodnights (5 words or less), NOT long responses
        if is_simple_goodnight and not self.HEART_PATTERN.search(text):
            # Add heart emoji to the end if it doesn't already have one
            text = text.rstrip() + ' ❤️'

        return text.strip()
