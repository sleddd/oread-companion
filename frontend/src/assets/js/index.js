class EmotionChatbot {
    constructor() {
        this.apiBaseUrl = CONFIG.API_BASE;
        this.isConnected = false;
        this.isTyping = false;
        this.consentAccepted = false;

        // Session management
        this.sessionId = this.getOrCreateSessionId();

        // Per-session character selection
        this.selectedCharacter = this.getSessionCharacter();

        // Request ID tracking to prevent race conditions when switching characters
        this.latestRequestId = null;
        this.requestCounter = 0;

        // Request cancellation - abort controller for pending requests
        this.pendingAbortController = null;
        this.pendingRequestId = null;

        // Ambient music player (for meditation profiles like Kairos)
        this.ambientMusicPlayer = null;

        this.initializeElements();
        this.checkConsent();
    }

    // Get session-specific character from sessionStorage (unique per tab)
    getSessionCharacter() {
        const key = `chatSession_${this.sessionId}_character`;
        return sessionStorage.getItem(key) || null;
    }

    // Set session-specific character in sessionStorage (unique per tab)
    setSessionCharacter(characterName) {
        const key = `chatSession_${this.sessionId}_character`;
        sessionStorage.setItem(key, characterName);
        this.selectedCharacter = characterName;
    }

    // Get existing session ID from sessionStorage or create new one (unique per tab)
    getOrCreateSessionId() {
        let sessionId = sessionStorage.getItem('chatSessionId');
        if (!sessionId) {
            sessionId = this.generateUUID();
            sessionStorage.setItem('chatSessionId', sessionId);
        }
        return sessionId;
    }

    // Generate a UUID v4
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Generate and track request ID (prevents race conditions)
    generateRequestId() {
        this.requestCounter++;
        const requestId = `${this.sessionId}-${this.selectedCharacter}-${this.requestCounter}-${Date.now()}`;
        this.latestRequestId = requestId;
        return requestId;
    }

    // Check if response is stale (from an old request)
    isStaleResponse(requestId) {
        return requestId !== this.latestRequestId;
    }

    // Cancel any pending request
    async cancelPendingRequest() {
        if (this.pendingAbortController && this.pendingRequestId) {
            console.log(`🚫 Canceling pending request: ${this.pendingRequestId}`);

            // Abort the HTTP request
            this.pendingAbortController.abort();

            // Notify backend to cancel inference
            try {
                await CONFIG.fetch('/api/chat/cancel', {
                    method: 'POST',
                    body: JSON.stringify({
                        sessionId: this.sessionId,
                        requestId: this.pendingRequestId
                    })
                });
            } catch (error) {
                // Ignore errors - request might already be complete
                console.debug('Cancel notification failed (request may be complete):', error.message);
            }

            this.pendingAbortController = null;
            this.pendingRequestId = null;
        }
    }

    // Clear current session and start new one
    clearSession() {
        this.sessionId = this.generateUUID();
        sessionStorage.setItem('chatSessionId', this.sessionId);
        console.log('New session started');
    }

    async checkConsent() {
        try {
            const response = await CONFIG.fetch('/api/consent');
            if (response.ok) {
                const data = await response.json();

                if (data.accepted) {
                    this.consentAccepted = true;
                    this.setupEventListeners();
                    this.loadProfiles();
                    this.checkConnection();
                    this.setupAutoResize();
                    // Initialize music player for all characters
                    this.initializeMusicPlayer();
                } else {
                    // Consent not accepted - redirect to settings
                    this.showConsentRequired();
                }
            } else {
                // Cannot check consent - show error
                this.showConsentRequired();
            }
        } catch (error) {
            console.error('Error checking consent:', error);
            this.showConsentRequired();
        }
    }

    showConsentRequired() {
        this.messageInput.disabled = true;
        this.sendButton.disabled = true;

        const welcomeMsg = document.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <h2 style="color: #f5576c; margin-bottom: 20px;">⚠️ Terms of Service Required</h2>
                    <p style="margin-bottom: 20px; line-height: 1.6;">
                        You must accept the Terms of Service & Safety Protocol before using this application.
                    </p>
                    <p style="margin-bottom: 30px; color: #999;">
                        This is required to ensure safe and ethical use of the AI companion.
                    </p>
                    <a href="/settings" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                        Go to Settings to Accept Terms
                    </a>
                </div>
            `;
        }
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.typingIndicator = document.getElementById('typingIndicator');
        // this.characterSelect = document.getElementById('characterSelect'); // Removed character switcher
        this.profileAvatar = document.getElementById('profileAvatar');
        this.profileName = document.getElementById('profileName');

        // Mobile elements
        this.mobileAvatarImg = document.getElementById('mobileAvatarImg');
        this.mobileAvatarFull = document.getElementById('mobileAvatarFull');
        this.mobileProfileName = document.getElementById('mobileProfileName');
        // this.mobileCharacterSelect = document.getElementById('mobileCharacterSelect'); // Removed character switcher
    }

    setupEventListeners() {
        // Send button click
        this.sendButton.addEventListener('click', () => this.sendMessage());

        // Enter key to send (Shift+Enter for new line)
        this.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Enable/disable send button based on input
        this.messageInput.addEventListener('input', () => {
            const hasText = this.messageInput.value.trim().length > 0;
            this.sendButton.disabled = !hasText || this.isTyping;
        });

        // Add active class to send button when input is focused
        this.messageInput.addEventListener('focus', () => {
            this.sendButton.classList.add('active');
        });

        // Remove active class when input loses focus
        this.messageInput.addEventListener('blur', () => {
            this.sendButton.classList.remove('active');
        });

        // Character switcher removed - users can only switch via settings page
        // this.characterSelect.addEventListener('change', () => this.switchCharacter());
        // if (this.mobileCharacterSelect) {
        //     this.mobileCharacterSelect.addEventListener('change', () => {
        //         this.characterSelect.value = this.mobileCharacterSelect.value;
        //         this.switchCharacter();
        //     });
        // }
    }

    setupAutoResize() {
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);
            if (response.ok) {
                this.setConnectionStatus(true);
            } else {
                throw new Error('Health check failed');
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            this.setConnectionStatus(false);
            this.showError('Cannot connect to chatbot server. Make sure the API is running on localhost:9000');
        }
    }

    setConnectionStatus(connected) {
        this.isConnected = connected;

        if (connected) {
            this.messageInput.disabled = false;
            this.updateSendButtonState();
        } else {
            this.messageInput.disabled = true;
            this.sendButton.disabled = true;
        }
    }

    updateSendButtonState() {
        const hasText = this.messageInput.value.trim().length > 0;
        this.sendButton.disabled = !hasText || this.isTyping || !this.isConnected;
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message || this.isTyping || !this.isConnected) return;

        // IMPORTANT: Cancel any pending request before sending new one
        // This frees up LLM resources immediately
        await this.cancelPendingRequest();

        // Add user message to chat
        this.addMessage(message, 'user');

        // Clear input and disable send button
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.setTyping(true);

        try {
            // Show typing indicator
            this.showTypingIndicator();

            // NEW: Use streaming endpoint with EventSource for Server-Sent Events
            // This keeps the UI responsive during AI generation
            const useStreaming = true; // Set to false to use old blocking behavior

            if (useStreaming) {
                // Streaming approach - non-blocking
                await this.sendMessageStreaming(message);
            } else {
                // Original blocking approach (kept for compatibility)
                await this.sendMessageBlocking(message);
            }

        } catch (error) {
            // Don't show error if request was intentionally aborted
            if (error.name === 'AbortError') {
                console.log('Request was cancelled');
                this.hideTypingIndicator();
                this.setTyping(false);
                return;
            }

            console.error('Error sending message:', error);
            this.hideTypingIndicator();
            this.setTyping(false);
            this.showError('Failed to send message. Please check your connection.');
        }
    }

    async sendMessageBlocking(message) {
        // Generate request ID to track this specific request
        const requestId = this.generateRequestId();

        // Create abort controller for this request
        const abortController = new AbortController();
        this.pendingAbortController = abortController;
        this.pendingRequestId = requestId;

        try {
            // Original blocking implementation with session support
            const response = await CONFIG.fetch('/api/chat', {
                method: 'POST',
                signal: abortController.signal,  // Add abort signal
                body: JSON.stringify({
                    message: message,
                    sessionId: this.sessionId,
                    characterName: this.selectedCharacter,
                    requestId: requestId
                })
            });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

            const data = await response.json();

            // Clear pending request tracking (completed successfully)
            if (this.pendingRequestId === requestId) {
                this.pendingAbortController = null;
                this.pendingRequestId = null;
            }

            // RACE CONDITION CHECK: Ignore stale responses
            if (this.isStaleResponse(requestId)) {
                console.warn(`⚠️ Discarding stale response (requestId: ${requestId}, latest: ${this.latestRequestId})`);
                this.hideTypingIndicator();
                this.setTyping(false);
                return; // Silently discard this response
            }

            // Update session ID if provided by server
            if (data.sessionId) {
                this.sessionId = data.sessionId;
                sessionStorage.setItem('chatSessionId', this.sessionId);
            }

            // Simulate a brief delay for more natural feel
            setTimeout(() => {
                // Double-check it's still not stale after timeout
                if (this.isStaleResponse(requestId)) {
                    console.warn(`⚠️ Discarding stale response after timeout (requestId: ${requestId})`);
                    return;
                }

                this.hideTypingIndicator();

                if (data.success) {
                    this.addMessage(
                        data.response,
                        'bot',
                        {
                            emotion: data.emotion,
                            type: data.type,
                            emotionScore: data.emotion_score
                        }
                    );
                } else {
                    this.addMessage(data.response || 'Sorry, something went wrong.', 'bot');
                }

                this.setTyping(false);
            }, 500 + Math.random() * 1000);

        } catch (error) {
            // Clear pending request on error
            if (this.pendingRequestId === requestId) {
                this.pendingAbortController = null;
                this.pendingRequestId = null;
            }
            throw error; // Re-throw to outer catch
        }
    }

    async sendMessageStreaming(message) {
        // Generate request ID to track this specific request
        const requestId = this.generateRequestId();

        // Create abort controller for this request
        const abortController = new AbortController();
        this.pendingAbortController = abortController;
        this.pendingRequestId = requestId;

        try {
            // NEW: Non-blocking streaming implementation with session and character support
            const response = await fetch(`${this.apiBaseUrl}/api/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': CONFIG.API_KEY
                },
                signal: abortController.signal,  // Add abort signal
                body: JSON.stringify({
                    message: message,
                    sessionId: this.sessionId,
                    characterName: this.selectedCharacter,
                    requestId: requestId
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Process the streaming response
            await this.processStreamingResponse(response, {
                onDone: (messageData) => {
                    // Clear pending request tracking (completed successfully)
                    if (this.pendingRequestId === requestId) {
                        this.pendingAbortController = null;
                        this.pendingRequestId = null;
                    }

                    // RACE CONDITION CHECK: Ignore stale streaming responses
                    if (this.isStaleResponse(requestId)) {
                        console.warn(`⚠️ Discarding stale streaming response (requestId: ${requestId})`);
                        this.hideTypingIndicator();
                        this.setTyping(false);
                        return;
                    }

                    this.hideTypingIndicator();
                    this.addMessage(
                        messageData.response,
                        'bot',
                        {
                            emotion: messageData.emotion,
                            sentiment: messageData.sentiment,
                            metadata: messageData.metadata
                        }
                    );
                    this.setTyping(false);
                }
            });

        } catch (error) {
            // Clear pending request on error
            if (this.pendingRequestId === requestId) {
                this.pendingAbortController = null;
                this.pendingRequestId = null;
            }
            throw error; // Re-throw to outer catch
        }
    }

    addMessage(text, sender, metadata = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        // Store original user message for regeneration
        if (sender === 'user') {
            messageDiv.dataset.userMessage = text;
        }

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';

        // Process text to wrap parentheses content in styled spans (XSS-safe)
        this.renderTextWithEmotes(bubbleDiv, text);

        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';

        // Store message data for favorites (both user and bot messages)
        messageDiv.dataset.messageText = text;
        messageDiv.dataset.messageSender = sender;
        messageDiv.dataset.messageEmotion = metadata.emotion || '';
        messageDiv.dataset.messageSentiment = metadata.sentiment || '';

        // Add favorite button for all messages - positioned in top right of bubble
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'favorite-btn';
        favoriteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
        `;
        favoriteBtn.title = 'Add to favorites';
        favoriteBtn.onclick = () => this.toggleFavorite(messageDiv, favoriteBtn);
        bubbleDiv.appendChild(favoriteBtn);

        // Add regenerate button for bot messages (will be shown/hidden by updateRegenerateButtons)
        if (sender === 'bot') {
            const regenerateBtn = document.createElement('button');
            regenerateBtn.className = 'regenerate-btn';
            regenerateBtn.style.display = 'none'; // Hidden by default
            regenerateBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
            `;
            regenerateBtn.title = 'Regenerate response';
            regenerateBtn.onclick = () => this.showRegenerateModal(messageDiv);
            metaDiv.appendChild(regenerateBtn);
        }

        // Time and emotion on a separate row below
        const metaRow = document.createElement('div');
        metaRow.className = 'message-meta-row';

        if (sender === 'bot' && metadata.emotion) {
            const emotionTag = document.createElement('span');
            emotionTag.className = 'emotion-tag';
            emotionTag.textContent = metadata.emotion;
            //metaRow.appendChild(emotionTag);
        }

        const timeSpan = document.createElement('span');
        timeSpan.textContent = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        metaRow.appendChild(timeSpan);

        metaDiv.appendChild(metaRow);

        messageDiv.appendChild(bubbleDiv);
        messageDiv.appendChild(metaDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        // Update regenerate button visibility (only show on last bot message)
        if (sender === 'bot') {
            this.updateRegenerateButtons();
        }
    }

    updateRegenerateButtons() {
        // Find all bot messages in a single query
        const botMessages = this.chatMessages.querySelectorAll('.message.bot');

        // Hide all regenerate buttons and show only the last one
        botMessages.forEach((botMessage, index) => {
            const regenerateBtn = botMessage.querySelector('.regenerate-btn');
            if (regenerateBtn) {
                // Show only on the last bot message
                regenerateBtn.style.display = (index === botMessages.length - 1) ? 'inline-flex' : 'none';
            }
        });
    }


    showTypingIndicator() {
        this.typingIndicator.style.display = 'block';
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.typingIndicator.style.display = 'none';
    }

    setTyping(typing) {
        this.isTyping = typing;
        this.updateSendButtonState();
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        this.chatMessages.appendChild(errorDiv);
        this.scrollToBottom();

        // Auto-remove error after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }

    async loadProfiles() {
        try {
            const response = await CONFIG.fetch('/api/profiles');
            if (!response.ok) throw new Error('Failed to fetch profiles');

            const profiles = await response.json();
            // Character switcher removed - no longer populating dropdown
            // this.characterSelect.innerHTML = '';
            // if (this.mobileCharacterSelect) {
            //     this.mobileCharacterSelect.innerHTML = '';
            // }

            // profiles.forEach(profileName => {
            //     const option = document.createElement('option');
            //     option.value = profileName;
            //     option.textContent = profileName;
            //     this.characterSelect.appendChild(option);

            //     if (this.mobileCharacterSelect) {
            //         const mobileOption = document.createElement('option');
            //         mobileOption.value = profileName;
            //         mobileOption.textContent = profileName;
            //         this.mobileCharacterSelect.appendChild(mobileOption);
            //     }
            // });

            // IMPORTANT: Always check /api/active for the latest default character
            // This ensures refreshing the page loads any changes made in settings
            let characterToLoad = null;

            // Try to load the user's default profile setting from backend
            try {
                const activeResponse = await CONFIG.fetch('/api/active');
                if (activeResponse.ok) {
                    const activeData = await activeResponse.json();
                    if (activeData.active && profiles.includes(activeData.active)) {
                        characterToLoad = activeData.active;
                    }
                }
            } catch (error) {
                console.error('Error loading default profile:', error);
            }

            // If no default profile set or it doesn't exist, use first available profile
            if (!characterToLoad && profiles.length > 0) {
                characterToLoad = profiles[0];
            }

            // Save it for this session
            if (characterToLoad) {
                this.setSessionCharacter(characterToLoad);
            }

            // Set the character select to show the correct character for this session
            if (characterToLoad) {
                // Character switcher removed - no longer setting dropdown value
                // this.characterSelect.value = characterToLoad;
                // if (this.mobileCharacterSelect) {
                //     this.mobileCharacterSelect.value = characterToLoad;
                // }
                await this.loadProfileAvatar(characterToLoad);

                // Load conversation starter for all characters
                if (characterToLoad) {
                    await this.loadConversationStarter(characterToLoad);
                }

                // Handle ambient music for meditation profiles
                this.toggleAmbientMusic(characterToLoad);
            }
        } catch (error) {
            console.error('Error loading profiles:', error);
            // Character switcher removed - no longer updating dropdown
            // this.characterSelect.innerHTML = '<option value="">No profiles available</option>';
            // if (this.mobileCharacterSelect) {
            //     this.mobileCharacterSelect.innerHTML = '<option value="">No profiles available</option>';
            // }
        }
    }

    async loadProfileAvatar(profileName) {
        try {
            // Update profile name in headers (desktop and mobile)
            this.profileName.textContent = profileName;
            if (this.mobileProfileName) {
                this.mobileProfileName.textContent = profileName;
            }

            // Load avatar
            const response = await CONFIG.fetch(`/api/profiles/${encodeURIComponent(profileName)}/avatar`);

            if (response.ok) {
                const data = await response.json();

                if (data.avatar) {
                    // Check if it's a file path (new format) or base64 data URI (old format)
                    let avatarSrc = data.avatar;
                    if (data.avatar.startsWith('/uploads/')) {
                        // New format: construct full URL
                        avatarSrc = `${CONFIG.API_BASE}${data.avatar}`;
                    }
                    // Display avatar image (desktop)
                    this.profileAvatar.innerHTML = `<img src="${avatarSrc}" alt="${profileName}">`;

                    // Display avatar image (mobile)
                    if (this.mobileAvatarImg) {
                        this.mobileAvatarImg.innerHTML = `<img src="${avatarSrc}" alt="${profileName}">`;
                    }
                    if (this.mobileAvatarFull) {
                        this.mobileAvatarFull.innerHTML = `<img src="${avatarSrc}" alt="${profileName}">`;
                    }
                } else {
                    // Show placeholder with first letter
                    const initial = profileName.charAt(0).toUpperCase();
                    this.setAvatarPlaceholder(initial);
                }
            } else {
                // Show placeholder with first letter
                const initial = profileName.charAt(0).toUpperCase();
                this.setAvatarPlaceholder(initial);
            }
        } catch (error) {
            console.error('Error loading profile avatar:', error);
            // Show placeholder with first letter
            const initial = profileName ? profileName.charAt(0).toUpperCase() : '?';
            this.setAvatarPlaceholder(initial);
        }
    }

    async loadConversationStarter(characterName) {
        try {
            // Show typing indicator while fetching starter
            this.showTypingIndicator();

            // Fetch conversation starter from API
            const response = await CONFIG.fetch(
                `/api/chat/starter?sessionId=${this.sessionId}&characterName=${encodeURIComponent(characterName)}`
            );

            this.hideTypingIndicator();

            if (response.ok) {
                const data = await response.json();

                // Check if starter should be skipped (character already active in another tab)
                if (data.skipStarter) {
                    console.log('Skipping starter - character already active in another tab');
                    return;  // Don't show anything - user can start conversation
                }

                if (data.starter) {
                    // Display the conversation starter as a bot message
                    this.addMessage(data.starter, 'bot');
                } else {
                    // Fallback welcome message
                    const welcomeDiv = document.createElement('div');
                    welcomeDiv.className = 'welcome-message';
                    welcomeDiv.textContent = `You're now chatting with ${characterName}. Say hello!`;
                    this.chatMessages.appendChild(welcomeDiv);
                }
            } else {
                // Fallback welcome message on error
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                welcomeDiv.textContent = `You're now chatting with ${characterName}. Say hello!`;
                this.chatMessages.appendChild(welcomeDiv);
            }
        } catch (error) {
            console.error('Error loading conversation starter:', error);
            this.hideTypingIndicator();
            // Fallback welcome message on error
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.textContent = `You're now chatting with ${characterName}. Say hello!`;
            this.chatMessages.appendChild(welcomeDiv);
        }
    }

    async switchCharacter() {
        const selectedCharacter = this.characterSelect.value;
        if (!selectedCharacter) return;

        try {
            // Save character selection for THIS SESSION only (not global)
            this.setSessionCharacter(selectedCharacter);

            // Show switching message
            const systemMsg = document.createElement('div');
            systemMsg.className = 'system-message';
            systemMsg.textContent = `Switching to ${selectedCharacter}...`;
            systemMsg.style.cssText = 'text-align: center; color: #999; font-size: 0.9rem; padding: 12px; margin: 8px 0;';
            this.chatMessages.appendChild(systemMsg);
            this.scrollToBottom();

            // Load the new character's avatar
            await this.loadProfileAvatar(selectedCharacter);

            // Update message
            systemMsg.textContent = `Switched to ${selectedCharacter}! New conversation started.`;
            systemMsg.style.color = '#1eb2aa';

            // Clear chat history (start fresh with new character)
            const messages = this.chatMessages.querySelectorAll('.message, .error-message');
            messages.forEach(msg => msg.remove());

            // Load conversation starter for the new character
            await this.loadConversationStarter(selectedCharacter);

            this.chatMessages.appendChild(systemMsg);
            this.scrollToBottom();

            // Handle ambient music for meditation profiles
            this.toggleAmbientMusic(selectedCharacter);
        } catch (error) {
            console.error('Error switching character:', error);
            this.showError('Failed to switch character. Please try again.');
        }
    }

    // XSS-safe text rendering with emote highlighting
    renderTextWithEmotes(container, text) {
        // Split text by parentheses pattern while preserving the matches
        const parts = text.split(/(\([^)]+\))/g);

        parts.forEach(part => {
            if (part.match(/^\([^)]+\)$/)) {
                // This is an emote - wrap in styled span
                const span = document.createElement('span');
                span.className = 'emote-text';
                span.textContent = part; // textContent is XSS-safe
                container.appendChild(span);
            } else if (part) {
                // Regular text - add as text node
                container.appendChild(document.createTextNode(part));
            }
        });
    }

    // Set avatar placeholder with initial letter across all avatar elements
    setAvatarPlaceholder(initial) {
        const placeholderHTML = `<span class="avatar-placeholder">${initial}</span>`;
        this.profileAvatar.innerHTML = placeholderHTML;
        if (this.mobileAvatarImg) {
            this.mobileAvatarImg.innerHTML = placeholderHTML;
        }
        if (this.mobileAvatarFull) {
            this.mobileAvatarFull.innerHTML = placeholderHTML;
        }
    }

    // Process Server-Sent Events (SSE) stream from response
    // onMessage callback receives (messageData) when message event occurs
    // onDone callback receives (messageData) when done event occurs
    async processStreamingResponse(response, { onMessage = null, onDone = null } = {}) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let messageData = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const eventBlock of lines) {
                if (!eventBlock.trim()) continue;

                const eventLines = eventBlock.split('\n');
                let eventType = 'message';
                let eventData = '';

                for (const line of eventLines) {
                    if (line.startsWith('event:')) {
                        eventType = line.substring(6).trim();
                    } else if (line.startsWith('data:')) {
                        eventData = line.substring(5).trim();
                    }
                }

                try {
                    const data = JSON.parse(eventData);

                    if (eventType === 'connected') {
                        console.log('Streaming connected');
                    } else if (eventType === 'message') {
                        messageData = data;
                        if (onMessage) onMessage(messageData);
                    } else if (eventType === 'done') {
                        if (messageData && onDone) {
                            onDone(messageData);
                        }
                    } else if (eventType === 'error') {
                        throw new Error(data.message || 'Server error');
                    }
                } catch (parseError) {
                    console.error('Error parsing event data:', parseError);
                }
            }
        }
    }

    scrollToBottom() {
        // Use requestAnimationFrame for better performance
        requestAnimationFrame(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        });
    }

    initializeMusicPlayer() {
        // Initialize music player once for all characters
        if (!this.ambientMusicPlayer) {
            this.ambientMusicPlayer = new AmbientMusicPlayer();
        }
    }

    toggleAmbientMusic(characterName) {
        // Music player is now always visible for all characters
        // This method kept for compatibility
    }

    showRegenerateModal(botMessageDiv) {
        // Get the previous user message
        let prevUserMessageDiv = botMessageDiv.previousElementSibling;
        while (prevUserMessageDiv && !prevUserMessageDiv.classList.contains('user')) {
            prevUserMessageDiv = prevUserMessageDiv.previousElementSibling;
        }

        // Check if this is a starter message (no previous user message)
        if (!prevUserMessageDiv) {
            // For starter messages, use a system prompt to regenerate
            this.regenerateStarter(botMessageDiv);
            return;
        }

        const originalMessage = prevUserMessageDiv.dataset.userMessage;

        if (!originalMessage) {
            this.showError('Could not find original message text');
            return;
        }

        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'regenerate-modal-overlay';
        modalOverlay.innerHTML = `
            <div class="regenerate-modal">
                <div class="regenerate-modal-header">
                    <h3>Regenerate Response</h3>
                    <button class="regenerate-modal-close">&times;</button>
                </div>
                <div class="regenerate-modal-body">
                    <label for="regeneratePrompt">Add custom instructions (optional):</label>
                    <textarea
                        id="regeneratePrompt"
                        placeholder="e.g., 'Take it in another direction' or 'Make it more playful'"
                        rows="3"
                    ></textarea>
                    <p class="regenerate-note">This will replace the current response with a new one based on your original message.</p>
                </div>
                <div class="regenerate-modal-footer">
                    <button class="regenerate-btn-cancel">Cancel</button>
                    <button class="regenerate-btn-submit">Regenerate</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        // Focus on textarea
        const textarea = modalOverlay.querySelector('#regeneratePrompt');
        setTimeout(() => textarea.focus(), 100);

        // Close handlers
        const closeModal = () => {
            modalOverlay.remove();
        };

        modalOverlay.querySelector('.regenerate-modal-close').onclick = closeModal;
        modalOverlay.querySelector('.regenerate-btn-cancel').onclick = closeModal;
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) closeModal();
        };

        // Submit handler
        modalOverlay.querySelector('.regenerate-btn-submit').onclick = () => {
            const customPrompt = textarea.value.trim();
            closeModal();
            this.regenerateResponse(originalMessage, customPrompt, botMessageDiv);
        };

        // Enter to submit (Shift+Enter for new line)
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const customPrompt = textarea.value.trim();
                closeModal();
                this.regenerateResponse(originalMessage, customPrompt, botMessageDiv);
            }
        });
    }

    async regenerateStarter(botMessageDiv) {
        if (this.isTyping || !this.isConnected) return;

        // Show typing indicator
        this.setTyping(true);
        this.showTypingIndicator();

        try {
            // Request a new conversation starter with force=true to bypass the "already shown" check
            const response = await CONFIG.fetch(
                `/api/chat/starter?sessionId=${this.sessionId}&characterName=${encodeURIComponent(this.selectedCharacter)}&force=true`
            );

            this.hideTypingIndicator();
            this.setTyping(false);

            if (response.ok) {
                const data = await response.json();
                if (data.starter) {
                    // Update the existing bot message bubble with new starter (XSS-safe)
                    const bubbleDiv = botMessageDiv.querySelector('.message-bubble');
                    bubbleDiv.innerHTML = ''; // Clear existing content
                    this.renderTextWithEmotes(bubbleDiv, data.starter);

                    // Re-add the favorite button (it was cleared with innerHTML)
                    const favoriteBtn = document.createElement('button');
                    favoriteBtn.className = 'favorite-btn';
                    favoriteBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    `;
                    favoriteBtn.title = 'Add to favorites';
                    favoriteBtn.onclick = () => this.toggleFavorite(botMessageDiv, favoriteBtn);
                    bubbleDiv.appendChild(favoriteBtn);
                } else {
                    throw new Error('No starter returned');
                }
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error regenerating starter:', error);
            this.hideTypingIndicator();
            this.setTyping(false);
            this.showError('Failed to regenerate starter. Please try again.');
        }
    }

    async regenerateResponse(originalMessage, customPrompt, botMessageDiv) {
        if (this.isTyping || !this.isConnected) return;

        // Combine original message with custom prompt if provided
        let finalMessage = originalMessage;
        if (customPrompt) {
            finalMessage = `${originalMessage}\n\n[Regeneration instruction: ${customPrompt}]`;
        }

        // Show typing indicator
        this.setTyping(true);
        this.showTypingIndicator();

        try {
            // Build conversation history up to this point (excluding the message being regenerated)
            const historyUpToMessage = [];
            const messages = this.chatMessages.querySelectorAll('.message');

            for (const msg of messages) {
                if (msg === botMessageDiv) break; // Stop before the message being regenerated

                const isUser = msg.classList.contains('user');
                const bubble = msg.querySelector('.message-bubble');
                if (bubble) {
                    historyUpToMessage.push({
                        role: isUser ? 'user' : 'assistant',
                        content: bubble.textContent.trim()
                    });
                }
            }

            // Use streaming endpoint for regeneration
            const response = await fetch(`${this.apiBaseUrl}/api/chat/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': CONFIG.API_KEY
                },
                body: JSON.stringify({
                    message: finalMessage,
                    sessionId: this.sessionId,
                    characterName: this.selectedCharacter,
                    history: historyUpToMessage
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Process the streaming response
            await this.processStreamingResponse(response, {
                onDone: (messageData) => {
                    // Update the existing bot message bubble with new content (XSS-safe)
                    const bubbleDiv = botMessageDiv.querySelector('.message-bubble');
                    bubbleDiv.innerHTML = ''; // Clear existing content
                    this.renderTextWithEmotes(bubbleDiv, messageData.response);

                    this.hideTypingIndicator();
                    this.setTyping(false);
                }
            });
        } catch (error) {
            console.error('Error regenerating response:', error);
            this.hideTypingIndicator();
            this.setTyping(false);
            this.showError('Failed to regenerate response. Please try again.');
        }
    }

    // ========================================================================
    // FAVORITES
    // ========================================================================

    async toggleFavorite(messageDiv, favoriteBtn) {
        const text = messageDiv.dataset.messageText;
        const sender = messageDiv.dataset.messageSender;
        const emotion = messageDiv.dataset.messageEmotion;
        const sentiment = messageDiv.dataset.messageSentiment;
        const favoriteId = messageDiv.dataset.favoriteId;

        // Get sender name (character name or "User")
        let senderName = 'User';
        if (sender === 'bot') {
            senderName = this.selectedCharacter;
        }

        try {
            if (favoriteId) {
                // Remove from favorites
                console.log('Removing favorite:', favoriteId);
                const response = await CONFIG.fetch(`/api/favorites/${encodeURIComponent(this.selectedCharacter)}/${favoriteId}`, {
                    method: 'DELETE'
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                // Update UI
                delete messageDiv.dataset.favoriteId;
                favoriteBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                    </svg>
                `;
                favoriteBtn.title = 'Add to favorites';
                favoriteBtn.classList.remove('favorited');
                console.log('Favorite removed successfully');
            } else {
                // Add to favorites
                console.log('Adding favorite:', { text, senderName, emotion, sentiment });
                const response = await CONFIG.fetch(`/api/favorites/${encodeURIComponent(this.selectedCharacter)}`, {
                    method: 'POST',
                    body: JSON.stringify({
                        text,
                        senderName,
                        emotion,
                        sentiment
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Server error:', errorText);
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                console.log('Favorite response:', data);

                if (data.success && data.favorite) {
                    // Update UI
                    messageDiv.dataset.favoriteId = data.favorite.id;
                    favoriteBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    `;
                    favoriteBtn.title = 'Remove from favorites';
                    favoriteBtn.classList.add('favorited');
                    console.log('Favorite added successfully');
                } else {
                    throw new Error('Invalid response from server');
                }
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
            this.showError('Failed to update favorites. Please try again.');
        }
    }

    async loadFavorites() {
        try {
            const response = await CONFIG.fetch(`/api/favorites/${encodeURIComponent(this.selectedCharacter)}`);
            const data = await response.json();
            return data.favorites || [];
        } catch (error) {
            console.error('Error loading favorites:', error);
            return [];
        }
    }

    async showFavoritesModal() {
        const modal = document.getElementById('favoritesModal');
        const container = document.getElementById('favoritesContainer');

        // Load favorites
        const favorites = await this.loadFavorites();

        // Render favorites
        if (favorites.length === 0) {
            container.innerHTML = '<div class="no-favorites">No favorites yet. Click the heart icon next to a message to add it to your favorites!</div>';
        } else {
            container.innerHTML = favorites.map(fav => {
                const senderName = fav.senderName || 'Unknown';
                return `
                <div class="favorite-item" data-favorite-id="${fav.id}">
                    <div class="favorite-sender">${this.escapeHtml(senderName)}:</div>
                    <div class="favorite-text">${this.escapeHtml(fav.text)}</div>
                    <div class="favorite-meta">
                        ${fav.emotion ? `<span class="favorite-emotion">${fav.emotion}</span>` : ''}
                        <span class="favorite-date">${new Date(fav.timestamp).toLocaleDateString()}</span>
                    </div>
                    <button class="delete-favorite-btn" onclick="chatbot.deleteFavorite('${fav.id}')">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            `;
            }).join('');
        }

        modal.style.display = 'flex';
    }

    closeFavoritesModal() {
        const modal = document.getElementById('favoritesModal');
        modal.style.display = 'none';
    }

    async deleteFavorite(favoriteId) {
        try {
            await CONFIG.fetch(`/api/favorites/${encodeURIComponent(this.selectedCharacter)}/${favoriteId}`, {
                method: 'DELETE'
            });

            // Refresh the favorites list
            await this.showFavoritesModal();

            // Update any message divs that have this favorite ID
            const messageDiv = this.chatMessages.querySelector(`[data-favorite-id="${favoriteId}"]`);
            if (messageDiv) {
                delete messageDiv.dataset.favoriteId;
                const favoriteBtn = messageDiv.querySelector('.favorite-btn');
                if (favoriteBtn) {
                    favoriteBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                        </svg>
                    `;
                    favoriteBtn.title = 'Add to favorites';
                    favoriteBtn.classList.remove('favorited');
                }
            }
        } catch (error) {
            console.error('Error deleting favorite:', error);
            this.showError('Failed to delete favorite. Please try again.');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Toggle function for mobile avatar (global scope for onclick)
function toggleMobileAvatar() {
    const expanded = document.getElementById('mobileAvatarExpanded');
    const icon = document.getElementById('collapseIcon');

    if (expanded.classList.contains('show')) {
        expanded.classList.remove('show');
        icon.classList.remove('expanded');
    } else {
        expanded.classList.add('show');
        icon.classList.add('expanded');
    }
}

// Expose to global scope for HTML onclick
window.toggleMobileAvatar = toggleMobileAvatar;

// Store chatbot instance globally for favorites
let chatbot;

// Initialize the chatbot when the page loads
document.addEventListener('DOMContentLoaded', () => {
    chatbot = new EmotionChatbot();
    window.chatbot = chatbot; // Make available globally for onclick handlers

    // Favorites button functionality
    const favoritesButton = document.getElementById('favoritesButton');
    if (favoritesButton) {
        favoritesButton.addEventListener('click', () => {
            chatbot.showFavoritesModal();
        });
    }

    // Close favorites modal
    const closeFavoritesModal = document.getElementById('closeFavoritesModal');
    if (closeFavoritesModal) {
        closeFavoritesModal.addEventListener('click', () => {
            chatbot.closeFavoritesModal();
        });
    }

    // Close modal when clicking outside
    const favoritesModal = document.getElementById('favoritesModal');
    if (favoritesModal) {
        favoritesModal.addEventListener('click', (e) => {
            if (e.target === favoritesModal) {
                chatbot.closeFavoritesModal();
            }
        });
    }

    // Logout functionality
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            // Use the auth helper to logout
            if (window.authHelpers && window.authHelpers.handleLogout) {
                window.authHelpers.handleLogout();
            } else {
                // Fallback if auth.js didn't load
                window.location.href = '/login';
            }
        });
    }
});