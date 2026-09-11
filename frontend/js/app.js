// Configuration
const API_URL = window.location.origin;
let conversationId = generateConversationId();
let isProcessing = false;
let botSettings = {
    avatarUrl: 'images/bot-silhouette.svg',
    botName: 'SAGE AI',
    welcomeMessage: "您好！我是 SAGE AI，YAS Shoe Care 的智能商务助手。请问有什么我可以帮您的？"
};

// DOM Elements
const welcomeScreen = document.getElementById('welcomeScreen');
const chatContainer = document.getElementById('chatContainer');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const newChatBtn = document.getElementById('newChatBtn');
const resourcesSidebar = document.getElementById('resourcesSidebar');
const resourcesContent = document.getElementById('resourcesContent');
const resourcesClose = document.getElementById('resourcesClose');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadSettings();
    adjustTextareaHeight();
});

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/api/settings`);
        if (response.ok) {
            const settings = await response.json();
            botSettings = { ...botSettings, ...settings };

            // Update UI elements if they exist
            const welcomeText = document.querySelector('.welcome-subtitle');
            if (welcomeText && settings.welcomeMessage) {
                welcomeText.textContent = settings.welcomeMessage;
            }

            const heroTitle = document.querySelector('.hero-title');
            if (heroTitle && settings.botName) {
                heroTitle.textContent = settings.botName;
            }
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

// Event Listeners
function setupEventListeners() {
    // Send message on button click
    sendButton.addEventListener('click', sendMessage);

    // Send message on Enter (without Shift)
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    messageInput.addEventListener('input', adjustTextareaHeight);

    // Suggestion cards
    document.querySelectorAll('.suggestion-card').forEach(card => {
        card.addEventListener('click', () => {
            console.log('Suggestion card clicked:', card.dataset.prompt);
            const prompt = card.dataset.prompt;
            messageInput.value = prompt;
            sendMessage();
        });
    });

    // New chat button - with null check and logging
    if (newChatBtn) {
        console.log('New Chat button found, attaching listener');
        newChatBtn.addEventListener('click', () => {
            console.log('New Chat button clicked');
            startNewChat();
        });
    } else {
        console.error('New Chat button not found in DOM!');
    }

    // Resources close button
    if (resourcesClose) {
        resourcesClose.addEventListener('click', closeResourcesSidebar);
    }
}

// Send Message — uses streaming for instant word-by-word response
async function sendMessage() {
    const message = messageInput.value.trim();

    if (!message || isProcessing) return;

    isProcessing = true;
    sendButton.disabled = true;

    // Hide welcome screen, show chat
    welcomeScreen.style.display = 'none';
    chatContainer.style.display = 'block';

    // Add user message
    addMessage('user', message);

    // Clear input
    messageInput.value = '';
    adjustTextareaHeight();

    // Show typing indicator
    const typingId = showTypingIndicator();

    const startTime = Date.now();
    let fullText = '';
    let msgDiv = null;
    let contentDiv = null;
    let firstToken = true;

    try {
        const response = await fetch(`${API_URL}/api/chat/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, conversationId })
        });

        if (!response.ok) throw new Error('Stream request failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete line

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(line.slice(6));

                    if (data.token) {
                        // Remove typing indicator on first token
                        if (firstToken) {
                            removeTypingIndicator(typingId);
                            firstToken = false;
                            // Create streaming message bubble
                            msgDiv = document.createElement('div');
                            msgDiv.className = 'message assistant';
                            const avatar = document.createElement('div');
                            avatar.className = 'message-avatar';
                            avatar.innerHTML = `<img src="${botSettings.avatarUrl}" alt="${botSettings.botName}" class="avatar-img">`;
                            contentDiv = document.createElement('div');
                            contentDiv.className = 'message-content';
                            contentDiv.innerHTML = '<span class="streaming-text"></span>';
                            msgDiv.appendChild(avatar);
                            msgDiv.appendChild(contentDiv);
                            messagesContainer.appendChild(msgDiv);
                        }
                        fullText += data.token;
                        // Render markdown progressively
                        const span = contentDiv.querySelector('.streaming-text');
                        if (span) {
                            if (typeof marked !== 'undefined') {
                                span.innerHTML = marked.parse(fullText, { breaks: true, gfm: true });
                            } else {
                                span.textContent = fullText;
                            }
                        }
                        scrollToBottom();
                    }

                    if (data.done) {
                        // Final render with metadata
                        if (contentDiv && fullText) {
                            const elapsed = Date.now() - startTime;
                            let finalHtml = typeof marked !== 'undefined'
                                ? marked.parse(fullText, { breaks: true, gfm: true })
                                : fullText.replace(/\n/g, '<br>');
                            finalHtml += `<div class="message-meta"><span>⚡ ${elapsed}ms</span>${data.resources && data.resources.length === 0 ? '' : '<span>📚 Internal knowledge used</span>'}</div>`;
                            contentDiv.innerHTML = finalHtml;
                        }
                        // Show resources if any
                        if (data.resources && data.resources.length > 0) {
                            displayResources(data.resources);
                        } else {
                            closeResourcesSidebar();
                        }
                        scrollToBottom();
                    }

                    if (data.error) throw new Error(data.error);

                } catch (parseErr) { /* skip malformed SSE lines */ }
            }
        }

        // Fallback if no tokens received
        if (firstToken) {
            removeTypingIndicator(typingId);
            addMessage('assistant', 'Sorry, I could not generate a response. Please try again.');
        }

    } catch (error) {
        console.error('Stream error:', error);
        removeTypingIndicator(typingId);
        // Fallback to non-streaming
        try {
            const r = await fetch(`${API_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, conversationId })
            });
            const d = await r.json();
            addMessage('assistant', d.response || 'Sorry, something went wrong.');
        } catch (e) {
            addMessage('assistant', `Error: ${error.message}. Please try again.`);
        }
    } finally {
        isProcessing = false;
        sendButton.disabled = false;
        messageInput.focus();
    }
}

// Add Message to Chat
function addMessage(role, content, meta = {}) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (role === 'user') {
        avatar.textContent = '👤';
    } else {
        avatar.innerHTML = `<img src="${botSettings.avatarUrl}" alt="${botSettings.botName}" class="avatar-img">`;
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Format message content (support markdown-like formatting)
    contentDiv.innerHTML = formatMessage(content);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentDiv);

    // Add metadata if available
    if (Object.keys(meta).length > 0) {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';

        if (meta.responseTime) {
            metaDiv.innerHTML += `<span>⚡ ${meta.responseTime}ms</span>`;
        }

        if (meta.contextUsed) {
            metaDiv.innerHTML += `<span>📚 Internal knowledge used</span>`;
        }

        contentDiv.appendChild(metaDiv);
    }

    messagesContainer.appendChild(messageDiv);
    scrollToBottom();
}

// Format Message using marked.js
function formatMessage(text) {
    if (!text) return '';

    // Un-escape markdown brackets if they were escaped by OpenAI
    text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\\(/g, '(').replace(/\\\)/g, ')');

    if (typeof marked !== 'undefined') {
        // Configure marked renderer for custom link styling
        const renderer = new marked.Renderer();
        const linkRenderer = renderer.link;
        renderer.link = function(href, title, text) {
            const html = linkRenderer.call(renderer, href, title, text);
            return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" style="color: var(--text-accent, #22c55e); text-decoration: underline; font-weight: 500;" ');
        };
        return marked.parse(text, { renderer: renderer, breaks: true, gfm: true });
    }

    // Basic fallback if marked is not loaded
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return text.replace(/\n/g, '<br>');
}

// Typing Indicator
function showTypingIndicator() {
    const typingId = `typing-${Date.now()}`;
    const typingDiv = document.createElement('div');
    typingDiv.id = typingId;
    typingDiv.className = 'message assistant';

    typingDiv.innerHTML = `
        <div class="message-avatar">
            <img src="${botSettings.avatarUrl}" alt="${botSettings.botName}" class="avatar-img">
        </div>
        <div class="message-content">
            <div class="typing-indicator">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
        </div>
    `;

    messagesContainer.appendChild(typingDiv);
    scrollToBottom();

    return typingId;
}

function removeTypingIndicator(typingId) {
    const element = document.getElementById(typingId);
    if (element) {
        element.remove();
    }
}

// Auto-resize Textarea
function adjustTextareaHeight() {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
}

// Scroll to Bottom
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Start New Chat
function startNewChat() {
    console.log('Starting new chat...');
    conversationId = generateConversationId();
    messagesContainer.innerHTML = '';
    welcomeScreen.style.display = 'flex';
    chatContainer.style.display = 'none';
    messageInput.value = '';
    messageInput.focus();
    console.log('New chat started successfully');
}

// Generate Conversation ID
function generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Resource Management ──────────────────────────────────────────────────────

/**
 * Display suggested resources in the sidebar
 */
function displayResources(resources) {
    if (!resources || resources.length === 0) return;

    // Find the last assistant message
    const assistantMessages = document.querySelectorAll('.message.assistant .message-content');
    if (assistantMessages.length === 0) return;
    const lastContent = assistantMessages[assistantMessages.length - 1];

    const box = document.createElement('div');
    box.className = 'inline-resource-box';
    
    let html = `
        <div class="inline-resource-header">
            <h4>📚 Suggested Resources (${resources.length})</h4>
            <button class="inline-resource-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="inline-resource-list">
    `;

    resources.forEach(resource => {
        const fileType = resource.fileType || 'Document';
        const description = resource.description || 'No description available';
        const isPdf = fileType.toLowerCase() === 'pdf';
        const icon = isPdf ? '📕' : '📄';

        html += `
            <div class="inline-resource-item">
                <div class="inline-resource-icon">${icon}</div>
                <div class="inline-resource-info">
                    <h5 class="inline-resource-title">${escapeHtml(resource.title || resource.filename)}</h5>
                    <p class="inline-resource-desc">${escapeHtml(description)}</p>
                </div>
                <button class="inline-resource-download" onclick="downloadResource('${resource.id}', '${escapeHtml(resource.filename)}')">
                    ⬇️ Download
                </button>
            </div>
        `;
    });

    html += `</div>`;
    box.innerHTML = html;

    lastContent.appendChild(box);
    scrollToBottom();
}

/**
 * Download a resource file
 */
async function downloadResource(resourceId, filename) {
    try {
        const response = await fetch(`${API_URL}/api/resources/${resourceId}/download`);

        if (!response.ok) {
            throw new Error('Failed to download resource');
        }

        // Get the blob from response
        const blob = await response.blob();

        // Create a temporary URL and trigger download
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        console.log(`📥 Downloaded resource: ${filename}`);
    } catch (error) {
        console.error('Download error:', error);
        alert(`Failed to download ${filename}: ${error.message}`);
    }
}

/**
 * Close the resources sidebar
 */
function closeResourcesSidebar() {
    if (resourcesSidebar) {
        resourcesSidebar.style.display = 'none';
        chatContainer.classList.remove('with-resources');
    }
}

/**
 * Escape HTML characters to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Error Handling
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});
