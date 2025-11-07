"""
Context Manager
Handles memory retrieval and web search context fetching
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class ContextManager:
    """Manages context fetching from memory and web sources"""

    def __init__(self, memory_service=None, enable_memory=False):
        """
        Args:
            memory_service: Vector memory service
            enable_memory: Whether to enable memory retrieval (default: False for speed)
        """
        self.memory_service = memory_service
        self.enable_memory = enable_memory  # Disabled by default for faster inference

    async def fetch_memory_context(
        self,
        query: str,
        character: str,
        user_name: str,
        enable_memory_override: Optional[bool] = None
    ) -> str:
        """
        Fetch relevant memories from vector database

        Args:
            query: User's message
            character: Character name
            user_name: User's name
            enable_memory_override: Override the instance enable_memory setting (user preference)

        Returns:
            Formatted memory context string
        """
        # Use override if provided, otherwise use instance setting
        should_enable_memory = enable_memory_override if enable_memory_override is not None else self.enable_memory

        # Memory retrieval disabled by default for speed
        if not should_enable_memory or not self.memory_service or not self.memory_service.initialized:
            return ""

        try:
            relevant_memories = self.memory_service.semantic_search(
                query=query,
                character=character,
                n_results=5
            )

            if relevant_memories:
                memory_lines = []
                seen_messages = set()  # Deduplicate identical messages

                for mem in relevant_memories:
                    speaker = mem['metadata'].get('speaker', 'Unknown')
                    msg = mem['message']
                    similarity = mem.get('similarity', 0)

                    # Skip system messages and duplicates
                    if msg.strip().startswith("[System:"):
                        continue
                    if msg in seen_messages:
                        continue

                    seen_messages.add(msg)

                    # Only include high-similarity memories (80% match threshold)
                    if similarity > 0.80:
                        if speaker == user_name:
                            memory_lines.append(f"Previously, {user_name} mentioned: \"{msg}\"")
                        else:
                            memory_lines.append(f"I previously responded: \"{msg}\"")

                if memory_lines:
                    memory_context = "\n".join([
                        "\n### RELEVANT CONTEXT FROM PAST CONVERSATIONS:",
                        "These are related topics we've discussed before. Use them for continuity, but respond naturally to the current message.",
                        *memory_lines,
                        "### END CONTEXT\n"
                    ])
                    logger.debug(f"Added {len(memory_lines)} relevant memories (similarity >0.85)")
                    return memory_context

        except Exception as e:
            logger.error(f"Failed to retrieve memories: {e}")

        return ""

    async def fetch_web_context(self, text: str, is_starter: bool = False, enable_web_search: bool = False, api_key: Optional[str] = None) -> str:
        """
        Check if web search is needed and fetch results

        Args:
            text: User's message
            is_starter: True if this is a conversation starter prompt (skip search)
            enable_web_search: User preference to enable/disable web search
            api_key: Brave Search API key from user settings

        Returns:
            Formatted web search results or empty string
        """
        # Check if web search is disabled by user
        if not enable_web_search:
            return ""

        # Check if API key is provided
        if not api_key:
            logger.debug("Web search enabled but no API key provided")
            return ""

        # Never search on starter prompts
        if is_starter:
            logger.debug("Skipping web search for conversation starter")
            return ""

        # Check if we should search
        search_query = self._should_search_web(text)
        if not search_query:
            return ""

        # Perform search
        search_results = await self._perform_web_search(search_query, api_key)
        if search_results:
            return f"\n\nWEB SEARCH RESULTS:\n{search_results}\n\nUse the above search results to inform your response with current, factual information."

        return ""

    def _extract_key_terms(self, text: str, search_type: str = 'general') -> str:
        """
        Extract key terms from text for web search

        Args:
            text: User's message
            search_type: Type of search ('book', 'person', 'event', 'factual', 'general')

        Returns:
            Extracted keywords for search
        """
        import string
        import re

        text_clean = text.strip()

        # BOOK SEARCH
        if search_type == 'book':
            keywords = []

            # Look for quoted text
            quoted = re.findall(r'"([^"]+)"|\'([^\']+)\'', text_clean)
            for quote in quoted:
                title = quote[0] or quote[1]
                if len(title.split()) >= 2:
                    keywords.append(f'"{title}"')

            # Look for capitalized sequences
            words = text_clean.split()
            i = 0
            current_title = []
            while i < len(words):
                word = words[i].strip(string.punctuation)
                if word and word[0].isupper() and i > 0:
                    if len(word) > 2 or word.lower() in ('of', 'in', 'the', 'a', 'an', 'for', 'and'):
                        current_title.append(word)
                    else:
                        if len(current_title) >= 2:
                            keywords.append(' '.join(current_title))
                        current_title = []
                elif current_title:
                    if len(current_title) >= 2:
                        keywords.append(' '.join(current_title))
                    current_title = []
                i += 1

            if len(current_title) >= 2:
                keywords.append(' '.join(current_title))

            keywords.append('book')
            result = ' '.join(keywords)

        # PERSON SEARCH
        elif search_type == 'person':
            words = text_clean.split()
            names = []
            for i in range(len(words) - 1):
                word1 = words[i].strip(string.punctuation)
                word2 = words[i + 1].strip(string.punctuation)
                if word1 and word2 and word1[0].isupper() and word2[0].isupper():
                    if len(word1) > 1 and len(word2) > 1:
                        names.append(f"{word1} {word2}")
                        break

            result = ' '.join(names) if names else text_clean.split()[-1]

        # EVENT/NEWS SEARCH
        elif search_type == 'event':
            # Remove common greetings and character names at the start
            greetings = ['hey', 'hi', 'hello', 'yo']
            words = text_clean.split()

            # Skip greeting words and common names
            filtered_words = []
            skip_next = False
            for i, word in enumerate(words):
                word_lower = word.lower().strip(string.punctuation)

                # Skip greetings
                if word_lower in greetings:
                    skip_next = True
                    continue

                # Skip the word after greeting (likely a name)
                if skip_next:
                    skip_next = False
                    continue

                filtered_words.append(word)

            # Extract time words, action words, and important nouns
            time_words = ['latest', 'recent', 'current', 'today', 'news', 'update', 'happening',
                         'last night', 'yesterday', 'this morning', 'earlier today']
            action_words = ['happened', 'protest', 'protests', 'rally', 'demonstration',
                           'election', 'vote', 'announcement']
            skip_words = {'the', 'a', 'an', 'did', 'you', 'hear', 'what', 'about', 'at'}

            keywords = []
            for word in filtered_words:
                word_clean = word.strip(string.punctuation).lower()

                # Keep time words, action words, capitalized words, or long words
                if (word_clean in time_words or
                    word_clean in action_words or
                    (word[0].isupper() and len(word_clean) > 2) or
                    (len(word_clean) > 4 and word_clean not in skip_words)):
                    keywords.append(word_clean if word_clean in time_words or word_clean in action_words else word.strip(string.punctuation))

            result = ' '.join(keywords) if keywords else ' '.join(filtered_words)

        # FACTUAL SEARCH
        elif search_type == 'factual':
            stop_words = {
                'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
                'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
                'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                'have', 'has', 'had', 'do', 'does', 'did',
                'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so',
                'for', 'to', 'from', 'in', 'on', 'at', 'by', 'with', 'about', 'as'
            }

            keep_words = {'who', 'what', 'when', 'where', 'why', 'how', 'which'}

            text_lower = text_clean.lower()
            words = text_lower.split()
            key_terms = []

            for word in words:
                word = word.strip(string.punctuation)
                if word and (word not in stop_words or word in keep_words):
                    key_terms.append(word)

            result = ' '.join(key_terms)

        # GENERAL
        else:
            result = text_clean

        logger.info(f"Keyword extraction [{search_type}] complete")
        return result

    def _should_search_web(self, text: str) -> Optional[str]:
        """
        Detect if user's message requires web search

        Args:
            text: User's message

        Returns:
            Search query if needed, None otherwise
        """
        text_lower = text.lower()

        # BOOK/MEDIA SEARCH
        book_indicators = ['book', 'novel', 'author', 'read', 'reading', 'bookclub', 'book club']
        if any(indicator in text_lower for indicator in book_indicators):
            if 'heard of' in text_lower or 'know about' in text_lower or 'familiar with' in text_lower:
                return self._extract_key_terms(text, search_type='book')

        # PERSON SEARCH
        person_indicators = ['who is', 'who\'s', 'heard of']
        if any(indicator in text_lower for indicator in person_indicators):
            if any(word[0].isupper() for word in text.split() if len(word) > 2):
                return self._extract_key_terms(text, search_type='person')

        # EVENT/NEWS SEARCH
        event_indicators = ['latest', 'news', 'what\'s happening', 'current', 'recent', 'today', 'update',
                           'last night', 'yesterday', 'this morning', 'earlier today']
        if any(indicator in text_lower for indicator in event_indicators):
            return self._extract_key_terms(text, search_type='event')

        # CONVERSATIONAL EVENT QUESTIONS (e.g., "did you hear what happened")
        conversational_event = ['did you hear', 'have you heard', 'you hear about', 'heard about',
                                'know about', 'know what happened']
        if any(phrase in text_lower for phrase in conversational_event):
            return self._extract_key_terms(text, search_type='event')

        # FACTUAL QUESTION SEARCH
        question_words = ['who', 'what', 'when', 'where', 'why', 'how', 'which']
        factual_topics = ['president', 'election', 'war', 'government', 'company',
                          'invention', 'discovery', 'event', 'happened', 'capital', 'country',
                          'protest', 'protests', 'demonstration', 'rally']

        # Check if question word appears anywhere (not just at start)
        has_question = any(q in text_lower for q in question_words)
        has_factual_topic = any(topic in text_lower for topic in factual_topics)

        if has_question and has_factual_topic:
            return self._extract_key_terms(text, search_type='factual')

        # EXPLICIT SEARCH REQUESTS
        explicit_search = ['tell me about', 'information about', 'look up', 'search for', 'find out about']
        for phrase in explicit_search:
            if phrase in text_lower:
                if any(indicator in text_lower for indicator in book_indicators):
                    return self._extract_key_terms(text, search_type='book')
                else:
                    return self._extract_key_terms(text, search_type='factual')

        return None

    async def _perform_web_search(self, query: str, api_key: str) -> Optional[str]:
        """
        Perform web search using MCP client

        Args:
            query: Search query
            api_key: Brave Search API key

        Returns:
            Formatted search results or None
        """
        try:
            from web_search.client import get_mcp_client
            mcp_client = get_mcp_client()

            if not mcp_client or not mcp_client.initialized:
                logger.debug("MCP client not initialized, skipping web search")
                return None

            logger.info(f"Performing web search")
            search_results = await mcp_client.web_search(query, count=3, api_key=api_key)

            if search_results:
                logger.info(f"Web search successful: {len(search_results)} chars")
                return search_results
            else:
                logger.warning("Web search returned no results")
                return None

        except Exception as e:
            logger.error(f"Web search failed: {e}")
            return None
