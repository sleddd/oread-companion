"""
Vector Memory Service

Local memory for conversation recall using ChromaDB with semantic vector search.
100% private, GDPR-compliant, fully deletable.

Uses sentence-transformers for L2-normalized embeddings with cosine similarity.
"""
import chromadb
from chromadb.config import Settings
from datetime import datetime
import uuid
from typing import List, Dict, Optional
import logging
from pathlib import Path
import gc  # For explicit garbage collection
import os
import numpy as np

logger = logging.getLogger(__name__)


class MemoryService:
    """
    Local vector memory service for semantic conversation recall.

    Features:
    - 100% local storage (no cloud)
    - Semantic search with L2-normalized embeddings (cosine similarity)
    - Per-character memory isolation
    - GDPR-compliant deletion (hard delete)
    - Metadata filtering (by date, emotion, speaker, etc.)
    """

    # Embedding model configuration
    EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"  # ~90MB, fast, good quality
    EMBEDDING_DIMENSION = 384  # Output dimension of all-MiniLM-L6-v2

    def __init__(self, persist_directory: str = "./data/memory"):
        """
        Initialize vector memory service.

        Args:
            persist_directory: Where to store ChromaDB data (default: ./data/memory)
        """
        self.persist_directory = Path(persist_directory)
        self.persist_directory.mkdir(parents=True, exist_ok=True)

        # Set up models directory for sentence-transformers cache
        self.models_directory = Path(__file__).resolve().parent.parent.parent / "models" / "embeddings"
        self.models_directory.mkdir(parents=True, exist_ok=True)
        os.environ['SENTENCE_TRANSFORMERS_HOME'] = str(self.models_directory)

        self.client = None
        self.embedding_model = None
        self.initialized = False

        # Cache for embeddings to avoid re-encoding the same text
        self.embedding_cache = {}
        self.cache_max_size = 500  # Reduced from 1000 to minimize memory usage

        logger.info("MemoryService created (not yet initialized)")

    async def initialize(self):
        """Async initialization of ChromaDB and sentence-transformers embedding model."""
        if self.initialized:
            logger.info("MemoryService already initialized")
            return

        try:
            logger.info("Initializing Memory Service (semantic vector search)...")

            # Initialize ChromaDB with persistent storage (LOCAL ONLY - NO NETWORK EXPOSURE)
            logger.info("Initializing ChromaDB with persistent storage...")
            self.client = chromadb.PersistentClient(
                path=str(self.persist_directory),
                settings=Settings(
                    anonymized_telemetry=False,  # Privacy: no telemetry
                    allow_reset=True,
                    # Security: PersistentClient is file-based only, no HTTP server
                    # Data stays on localhost, never exposed to network
                )
            )

            # Load sentence-transformers embedding model
            logger.info(f"Loading embedding model: {self.EMBEDDING_MODEL_NAME}...")
            logger.info(f"   Model cache directory: {self.models_directory}")

            from sentence_transformers import SentenceTransformer
            self.embedding_model = SentenceTransformer(self.EMBEDDING_MODEL_NAME)
            logger.info(f"✅ Embedding model loaded successfully")

            self.initialized = True
            logger.info("✅ Memory Service initialized successfully")
            logger.info("   - Search method: Semantic vector search (L2 normalized, cosine similarity)")
            logger.info("   - Storage: Persistent local storage")
            logger.info("   - Telemetry: DISABLED (privacy-first)")

        except Exception as e:
            logger.error(f"❌ Failed to initialize Memory Service: {e}", exc_info=True)
            self.initialized = False
            raise

    def _get_embedding(self, text: str) -> List[float]:
        """
        Get L2-normalized embedding for text.

        Args:
            text: Text to embed

        Returns:
            Normalized embedding vector (unit length)
        """
        # Check cache first
        cache_key = hash(text)
        if cache_key in self.embedding_cache:
            return self.embedding_cache[cache_key]

        # Generate embedding
        embedding = self.embedding_model.encode(text, convert_to_numpy=True)

        # L2 normalize to unit vector (for cosine similarity)
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        # Convert to list for ChromaDB
        embedding_list = embedding.tolist()

        # Cache the result (with size limit)
        if len(self.embedding_cache) >= self.cache_max_size:
            # Remove oldest entry (simple FIFO)
            self.embedding_cache.pop(next(iter(self.embedding_cache)))
        self.embedding_cache[cache_key] = embedding_list

        return embedding_list

    def _get_collection_name(self, character: str) -> str:
        """
        Get ChromaDB collection name for a character.

        ChromaDB requirements:
        - 3-63 characters long
        - Start and end with alphanumeric
        - Only alphanumeric, underscores, or hyphens
        """
        # Sanitize character name for collection name
        safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in character)
        safe_name = safe_name.lower()

        # Ensure name starts with alphanumeric (remove leading underscores/hyphens)
        safe_name = safe_name.lstrip("_-")

        # Ensure name ends with alphanumeric (remove trailing underscores/hyphens)
        safe_name = safe_name.rstrip("_-")

        # If safe_name is empty after sanitization, use default
        if not safe_name:
            safe_name = "default"

        # Build collection name with prefix
        collection_name = f"char_{safe_name}"

        # Ensure minimum length of 3 characters
        if len(collection_name) < 3:
            collection_name = f"char_{safe_name}_mem"

        # Ensure maximum length of 63 characters
        if len(collection_name) > 63:
            collection_name = collection_name[:63]
            # Make sure it still ends with alphanumeric after truncation
            collection_name = collection_name.rstrip("_-")
            # If after trimming we still end with non-alphanumeric, add a digit
            if collection_name and not collection_name[-1].isalnum():
                collection_name = collection_name.rstrip("_-") + "0"

        # Final validation: ensure it ends with alphanumeric
        if collection_name and not collection_name[-1].isalnum():
            collection_name = collection_name.rstrip("_-")
            if not collection_name:
                collection_name = "char_default"
            else:
                collection_name += "0"

        return collection_name

    def store_message(
        self,
        message: str,
        character: str,
        speaker: str,
        session_id: str,
        emotion: Optional[str] = None,
        metadata: Optional[Dict] = None
    ) -> Optional[str]:
        """
        Store a message with L2-normalized semantic embedding.

        Args:
            message: The text content to store
            character: Character name (for collection isolation)
            speaker: Who said it ("User" or character name)
            session_id: Session identifier
            emotion: Optional emotion label
            metadata: Optional additional metadata

        Returns:
            Message ID if successful, None if failed
        """
        if not self.initialized:
            logger.warning("MemoryService not initialized, cannot store message")
            return None

        if not message or not message.strip():
            logger.warning("Empty message, skipping storage")
            return None

        try:
            # Generate L2-normalized embedding for semantic search
            embedding = self._get_embedding(message)

            # Get or create collection for this character (with cosine distance for normalized vectors)
            collection_name = self._get_collection_name(character)
            collection = self.client.get_or_create_collection(
                name=collection_name,
                metadata={
                    "character": character,
                    "hnsw:space": "cosine"  # Cosine similarity for normalized vectors
                }
            )

            # Generate unique ID
            msg_id = f"msg_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

            # Build metadata
            msg_metadata = {
                "speaker": speaker,
                "timestamp": datetime.now().isoformat(),
                "character": character,
                "session_id": session_id,
            }

            if emotion:
                msg_metadata["emotion"] = emotion

            # Add custom metadata if provided
            if metadata:
                msg_metadata.update(metadata)

            # Store in ChromaDB with normalized embedding
            collection.add(
                ids=[msg_id],
                documents=[message],
                embeddings=[embedding],
                metadatas=[msg_metadata]
            )

            logger.debug(f"Stored message {msg_id} with embedding")
            return msg_id

        except Exception as e:
            logger.error(f"Failed to store message: {e}", exc_info=True)
            return None

    def semantic_search(
        self,
        query: str,
        character: str,
        n_results: int = 5,
        filter_metadata: Optional[Dict] = None
    ) -> List[Dict]:
        """
        Search for semantically similar messages using L2-normalized embeddings.

        Args:
            query: Search query (semantic meaning is matched, not just keywords)
            character: Which character's memories to search
            n_results: How many results to return (default: 5)
            filter_metadata: Optional metadata filters (e.g., {"emotion": "happy"})

        Returns:
            List of matching messages sorted by similarity
        """
        if not self.initialized:
            logger.warning("MemoryService not initialized, cannot search")
            return []

        if not query or not query.strip():
            return []

        try:
            logger.debug(f"Starting semantic search for query: '{query[:50]}...'")

            # Generate normalized embedding for query
            query_embedding = self._get_embedding(query)

            # Get character's collection
            collection_name = self._get_collection_name(character)
            logger.debug(f"Looking up collection: {collection_name}")

            try:
                collection = self.client.get_collection(name=collection_name)
                logger.debug(f"Collection found with {collection.count()} items")
            except Exception:
                logger.info(f"No memories found for {character}")
                return []

            # Query with normalized embedding (cosine similarity)
            logger.debug("Querying collection with semantic embedding...")
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=n_results,
                where=filter_metadata  # e.g., {"speaker": "User"}
            )
            logger.debug("Collection query complete")

            # Format results
            formatted = []
            if results['ids'] and results['ids'][0]:
                for i in range(len(results['ids'][0])):
                    # Cosine distance to similarity: similarity = 1 - distance
                    # For normalized vectors, cosine similarity ranges from -1 to 1
                    # Distance ranges from 0 to 2, so similarity = 1 - (distance/2) gives 0 to 1
                    distance = results['distances'][0][i]
                    similarity = 1 - (distance / 2)  # Normalize to 0-1 range

                    formatted.append({
                        "id": results['ids'][0][i],
                        "message": results['documents'][0][i],
                        "similarity": similarity,
                        "metadata": results['metadatas'][0][i]
                    })

            logger.debug(f"Found {len(formatted)} similar memories for query: '{query[:50]}...'")
            return formatted

        except Exception as e:
            logger.error(f"Semantic search failed: {e}", exc_info=True)
            return []

    def delete_messages(self, character: str, message_ids: List[str]) -> bool:
        """
        HARD DELETE - GDPR compliant permanent removal.

        Args:
            character: Character name
            message_ids: List of message IDs to delete

        Returns:
            True if successful, False otherwise
        """
        if not self.initialized:
            logger.warning("MemoryService not initialized")
            return False

        try:
            collection_name = self._get_collection_name(character)
            collection = self.client.get_collection(name=collection_name)

            # Hard delete (not soft delete)
            collection.delete(ids=message_ids)

            logger.info(f"✅ Deleted {len(message_ids)} messages")
            return True

        except Exception as e:
            logger.error(f"Failed to delete messages: {e}", exc_info=True)
            return False

    def delete_by_date_range(
        self,
        character: str,
        start_date: str,
        end_date: str
    ) -> int:
        """
        Delete all messages within a date range.

        Args:
            character: Character name
            start_date: ISO format date (e.g., "2025-01-01")
            end_date: ISO format date (e.g., "2025-01-31")

        Returns:
            Number of messages deleted
        """
        if not self.initialized:
            return 0

        try:
            collection_name = self._get_collection_name(character)
            collection = self.client.get_collection(name=collection_name)

            # Query messages in date range
            results = collection.get(
                where={
                    "$and": [
                        {"timestamp": {"$gte": start_date}},
                        {"timestamp": {"$lte": end_date}}
                    ]
                }
            )

            if results['ids']:
                collection.delete(ids=results['ids'])
                count = len(results['ids'])
                logger.info(f"Deleted {count} messages from {start_date} to {end_date}")
                return count

            return 0

        except Exception as e:
            logger.error(f"Failed to delete by date range: {e}", exc_info=True)
            return 0

    def delete_character_memories(self, character: str) -> bool:
        """
        Delete ALL memories for a character.

        Args:
            character: Character name

        Returns:
            True if successful, False otherwise
        """
        if not self.initialized:
            return False

        try:
            collection_name = self._get_collection_name(character)
            self.client.delete_collection(name=collection_name)

            logger.info(f"✅ Deleted all memories")
            return True

        except Exception as e:
            logger.error(f"Failed to delete character memories: {e}", exc_info=True)
            return False

    def delete_all(self) -> bool:
        """
        Nuclear option: delete ALL memories for ALL characters.

        Returns:
            True if successful, False otherwise
        """
        if not self.initialized:
            return False

        try:
            collections = self.client.list_collections()
            for collection in collections:
                self.client.delete_collection(name=collection.name)

            logger.info(f"✅ Deleted all memories ({len(collections)} collections)")
            return True

        except Exception as e:
            logger.error(f"Failed to delete all memories: {e}", exc_info=True)
            return False

    def get_stats(self, character: Optional[str] = None) -> Dict:
        """
        Get memory statistics.

        Args:
            character: Optional character name (if None, returns stats for all)

        Returns:
            Dictionary with memory statistics
        """
        if not self.initialized:
            return {"error": "MemoryService not initialized"}

        try:
            stats = {
                "total_messages": 0,
                "characters": {}
            }

            collections = self.client.list_collections()

            for coll in collections:
                char_name = coll.metadata.get("character", "unknown")

                # Skip if filtering by character and this isn't it
                if character and char_name != character:
                    continue

                count = coll.count()
                stats["characters"][char_name] = count
                stats["total_messages"] += count

            return stats

        except Exception as e:
            logger.error(f"Failed to get stats: {e}", exc_info=True)
            return {"error": str(e)}

    def get_messages(
        self,
        character: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict]:
        """
        Get recent messages for a character (for export/viewing).

        Args:
            character: Character name
            limit: Maximum number of messages to return
            offset: Offset for pagination

        Returns:
            List of messages with metadata
        """
        if not self.initialized:
            return []

        try:
            collection_name = self._get_collection_name(character)
            collection = self.client.get_collection(name=collection_name)

            # Get messages (ChromaDB doesn't have native pagination, so we get all and slice)
            results = collection.get(
                limit=limit,
                offset=offset,
                include=["documents", "metadatas"]
            )

            messages = []
            for i in range(len(results['ids'])):
                messages.append({
                    "id": results['ids'][i],
                    "message": results['documents'][i],
                    "metadata": results['metadatas'][i]
                })

            return messages

        except Exception as e:
            logger.error(f"Failed to get messages: {e}", exc_info=True)
            return []

    def cleanup(self):
        """
        Clean up all resources and properly close ChromaDB and sentence-transformers.
        This is critical for preventing memory leaks and semaphore leaks from multiprocessing.
        """
        try:
            logger.info("Starting MemoryService cleanup...")

            # Clear embedding cache to free memory
            if hasattr(self, 'embedding_cache'):
                self.embedding_cache.clear()
                logger.debug("Cleared embedding cache")

            # Clean up sentence-transformers model
            if self.embedding_model is not None:
                try:
                    # Clean up the model's internal pools if they exist
                    if hasattr(self.embedding_model, '_pool'):
                        try:
                            self.embedding_model._pool.terminate()
                            self.embedding_model._pool.join()
                        except:
                            pass

                    # Clear the model from memory
                    # Note: We don't try to delete _target_device anymore as it's deprecated
                    del self.embedding_model
                    self.embedding_model = None
                    logger.debug("Cleaned up sentence-transformers model")
                except Exception as e:
                    logger.warning(f"Error cleaning up embedding model: {e}")

            # Clean up ChromaDB client
            if self.client is not None:
                try:
                    # ChromaDB PersistentClient doesn't have an explicit close method,
                    # but we can clear references and let Python's garbage collector handle it
                    del self.client
                    self.client = None
                    logger.debug("Cleaned up ChromaDB client")
                except Exception as e:
                    logger.warning(f"Error cleaning up ChromaDB client: {e}")

            self.initialized = False

            # Force garbage collection to clean up any remaining resources
            gc.collect()
            logger.debug("Forced garbage collection")

            logger.info("✅ MemoryService cleanup complete")

        except Exception as e:
            logger.error(f"Error during MemoryService cleanup: {e}", exc_info=True)


# Singleton instance (initialized in main.py)
_memory_service_instance: Optional[MemoryService] = None


def get_memory_service() -> Optional[MemoryService]:
    """Get the global memory service instance."""
    return _memory_service_instance


def set_memory_service(service: MemoryService):
    """Set the global memory service instance."""
    global _memory_service_instance
    _memory_service_instance = service