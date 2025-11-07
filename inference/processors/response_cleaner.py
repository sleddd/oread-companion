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
    META_INSTRUCTION_PATTERN = re.compile(
        r'\*\([^)]*(?:DO NOT|AWAIT|WAIT FOR|STOP HERE|REPLY WITH|END OF RESPONSE)[^)]*\)(?:\([^)]*\))?\*?',
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
        if len(sentences) > max_sentences:
            result = ' '.join(sentences[:max_sentences])
            if result and result[-1] not in '.!?':
                result += '.'
            return result
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

    def clean(self, text: str) -> str:
        """
        Apply all final cleaning steps to raw LLM output

        Args:
            text: Raw LLM output text

        Returns:
            Cleaned text ready for user
        """
        text = text.strip()

        # Check if this is a goodnight message or has heart emoji
        is_goodnight = bool(re.search(r'\b(?:good\s*night|goodnight|sleep\s*well|sweet\s*dreams)\b', text, re.IGNORECASE))
        has_heart_emoji = bool(self.HEART_PATTERN.search(text))

        # Preserve heart emojis by temporarily replacing them
        heart_placeholder = "<<<HEART_EMOJI>>>"
        hearts_found = []
        if has_heart_emoji or is_goodnight:
            # Save all heart emojis
            hearts_found = self.HEART_PATTERN.findall(text)
            # Replace with placeholder
            text = self.HEART_PATTERN.sub(heart_placeholder, text)

        # Remove all other emojis
        text = self.EMOJI_PATTERN.sub('', text)

        # Restore heart emojis
        if hearts_found:
            for heart in hearts_found:
                text = text.replace(heart_placeholder, heart, 1)

        # Flatten nested action parentheses
        text = self._flatten_nested_actions(text)

        # OPTIMIZED: Combine all meta-commentary removal into one pass
        # Build combined pattern from all meta-patterns
        if not hasattr(self, '_combined_meta_pattern'):
            # Cache combined pattern on first use
            meta_patterns = [
                self.INTERNAL_REASONING_PATTERN.pattern,
                self.NOTE_COMMENTARY_PATTERN.pattern,
                self.META_REASONING_PATTERN.pattern,
                self.META_PARENTHETICAL_PATTERN.pattern,
                self.META_ANALYSIS_PATTERN.pattern,
                self.BRACKET_PATTERN.pattern,
                self.META_INSTRUCTION_PATTERN.pattern,
                self.FORMAT_ARTIFACT_PATTERN.pattern,
                self.EMOTION_METADATA_PATTERN.pattern,
                self.DEBUG_MARKUP_PATTERN.pattern
            ]
            self._combined_meta_pattern = re.compile('|'.join(f'(?:{p})' for p in meta_patterns), re.IGNORECASE)

        text = self._combined_meta_pattern.sub('', text)

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
            "((END RESPONSE))", "(END RESPONSE)", "**END RESPONSE**",
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

        # Handle asterisk-wrapped actions:
        # Strategy: Keep ONLY the first action (up to 4 words), remove all others
        # This handles the common problem of multiple actions cluttering responses

        # Find all asterisk-wrapped segments
        asterisk_segments = re.findall(r'\*([^*]+)\*', text)

        if asterisk_segments:
            kept_first = False
            for segment in asterisk_segments:
                segment = segment.strip()
                word_count = len(segment.split())

                # First action with 1-4 words: keep it
                if not kept_first and 1 <= word_count <= 4:
                    kept_first = True
                    # Leave this one (will convert to parentheses later)
                else:
                    # Remove all other actions (too long, or not the first)
                    text = text.replace(f'*{segment}*', '', 1)

        # Convert remaining asterisks to parentheses for frontend styling
        # At this point we only have 0-1 brief action left
        text = re.sub(r'\*([^*]+)\*', r'(\1)', text)

        # Clean up whitespace issues from removed actions
        text = re.sub(r'\s+', ' ', text)  # Multiple spaces to single space
        text = re.sub(r'\s+([.,!?])', r'\1', text)  # Space before punctuation
        text = re.sub(r'([.,!?])\1+', r'\1', text)  # Duplicate punctuation (e.g., ,, or ..)

        # Remove duplicate consecutive text (sometimes models repeat themselves)
        text = self._remove_duplicates(text.strip())

        # Truncate to 2-3 sentences for more natural, concise responses
        text = self._truncate_to_sentences(text.strip(), max_sentences=3)

        # Add heart emoji to goodnight messages if not already present
        if is_goodnight and not self.HEART_PATTERN.search(text):
            # Add heart emoji to the end if it doesn't already have one
            text = text.rstrip() + ' ❤️'

        return text.strip()
