// Configuration - Update this with your server URL
const API_URL = window.location.origin;
let botSettings = {
    avatarUrl: 'images/bot-silhouette.svg',
    botName: 'SAGE AI',
    welcomeMessage: "你好！我是 SAGE AI，YAS Shoe Care 的专属商务助手。有什么我可以帮您的吗？"
};

// Global variables
let conversationId = generateConversationId();
let isProcessing = false;

// Direct function to open widget (called from HTML onclick)
function openWidgetDirectly() {
    const container = document.getElementById('widgetContainer');
    const button = document.getElementById('widgetButton');
    const messages = document.getElementById('widgetMessages');
    const input = document.getElementById('widgetInput');

    if (!container || !button) return;

    container.classList.add('active');
    button.classList.add('hidden'); // Hide button when chat is open

    setTimeout(() => {
        if (messages) messages.scrollTop = messages.scrollHeight;
        if (input) input.focus();
    }, 100);
}

// Direct function to close widget (called from HTML onclick)
function closeWidgetDirectly() {
    const container = document.getElementById('widgetContainer');
    const button = document.getElementById('widgetButton');

    if (!container || !button) return;

    container.classList.remove('active');
    button.classList.remove('hidden');

    // Notify parent if embedded
    if (window.self !== window.top) {
        window.parent.postMessage('closeWidget', '*');
    }
}

// Initialize widget
window.addEventListener('load', function () {
    const widgetButton = document.getElementById('widgetButton');
    const widgetContainer = document.getElementById('widgetContainer');
    const widgetClose = document.getElementById('widgetClose');
    const widgetMessages = document.getElementById('widgetMessages');
    const widgetInput = document.getElementById('widgetInput');
    const widgetSend = document.getElementById('widgetSend');

    if (!widgetButton || !widgetContainer || !widgetMessages || !widgetInput || !widgetSend) {
        console.error('Widget elements missing');
        return;
    }

    // Check if embedded in iframe
    const isEmbedded = window.self !== window.top;
    if (isEmbedded) {
        // When embedded, we strictly show the chat window and hide the internal trigger
        widgetContainer.classList.add('active');
        widgetContainer.classList.add('embedded');
        widgetButton.classList.add('hidden');
        widgetButton.style.setProperty('display', 'none', 'important');
    }

    // Apply settings
    updateWidgetUI();

    widgetButton.onclick = openWidgetDirectly;
    widgetClose.onclick = closeWidgetDirectly;
    widgetSend.onclick = sendMessage;
    widgetInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };

    // Fetch avatar and name asynchronously without blocking the UI
    loadSettings().then(() => {
        updateWidgetUI();
    });

    async function sendMessage() {
        const message = widgetInput.value.trim();
        if (!message || isProcessing) return;

        isProcessing = true;
        widgetSend.disabled = true;

        addMessage('user', message);
        widgetInput.value = '';

        const typingId = showTypingIndicator();

        try {
            // Use streaming endpoint for near-instant responses
            const response = await fetch(`${API_URL}/api/chat/stream`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, conversationId })
            });

            if (!response.ok || !response.body) {
                throw new Error('Stream not available');
            }

            // Remove typing indicator and create empty assistant bubble
            removeTypingIndicator(typingId);
            const { messageDiv, contentDiv } = createStreamingBubble();

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullText = '';
            let streamResources = [];
            let streamDone = false;

            // Read SSE stream
            while (!streamDone) {
                const { done, value } = await reader.read();
                
                // Flush decoder when stream ends
                if (value) {
                    buffer += decoder.decode(value, { stream: !done });
                } else if (done) {
                    buffer += decoder.decode(); // flush remaining bytes
                }

                // Process all complete lines in the buffer
                let newlineIdx;
                while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIdx).trimEnd();
                    buffer = buffer.slice(newlineIdx + 1);

                    if (!line.startsWith('data: ')) continue;
                    try {
                        const data = JSON.parse(line.slice(6));
                        if (data.token) {
                            fullText += data.token;
                            contentDiv.innerHTML = formatMessage(fullText);
                            widgetMessages.scrollTop = widgetMessages.scrollHeight;
                        }
                        // IMPORTANT: Always capture resources before checking done
                        if (data.resources && Array.isArray(data.resources) && data.resources.length > 0) {
                            streamResources = data.resources;
                            console.log('📚 Resources captured from stream:', streamResources.length);
                        }
                        if (data.error) {
                            console.error('Stream error from server:', data.error);
                            streamDone = true;
                        }
                        if (data.done) {
                            console.log('✅ Stream done event received, resources:', streamResources.length);
                            streamDone = true;
                        }
                    } catch (e) { /* skip malformed chunk */ }
                }

                // If native stream is done, also check remaining buffer for final line
                if (done) {
                    if (buffer.trim() && buffer.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(buffer.trim().slice(6));
                            if (data.resources && Array.isArray(data.resources) && data.resources.length > 0) {
                                streamResources = data.resources;
                                console.log('📚 Resources captured from final buffer:', streamResources.length);
                            }
                        } catch (e) { /* skip */ }
                    }
                    break;
                }
            }

            // ✅ Remove streaming cursor — stops the blinking green dot after response ends
            contentDiv.classList.remove('streaming');
            contentDiv.innerHTML = formatMessage(fullText);
            widgetMessages.scrollTop = widgetMessages.scrollHeight;

            console.log('📊 Final resources count:', streamResources.length);

            // 📚 Display resources if available
            if (streamResources && streamResources.length > 0) {
                displayWidgetResources(streamResources);
            } else {
                // Fallback: if no resources in stream, try to fetch from search API (unless it's a greeting)
                const GREETINGS = new Set(['hi', 'hello', 'hey', 'greetings', 'thanks', 'thank you', 'ok', 'okay', 'great', 'bye', 'goodbye', 'yes', 'no']);
                const cleanMessage = message.toLowerCase().trim().replace(/[^a-z\s]/g, '');
                const isGreeting = GREETINGS.has(cleanMessage) || (cleanMessage.split(/\s+/).length <= 2 && !cleanMessage.includes('pdf') && !cleanMessage.includes('guide'));
                
                if (!isGreeting) {
                    console.log('📚 Stream did not return resources, trying fallback API fetch...');
                    fetchAndDisplayResources(message);
                } else {
                    console.log('📚 Server returned 0 resources and message is chitchat/greeting');
                }
            }

        } catch (streamError) {
            // Fallback to regular endpoint if streaming fails
            console.warn('Stream failed, using standard endpoint:', streamError);
            try {
                const response = await fetch(`${API_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, conversationId })
                });
                const data = await response.json();
                removeTypingIndicator(typingId);
                if (response.ok) {
                    addMessage('assistant', data.response);
                    // 📚 Display resources if available
                    if (data.resources && data.resources.length > 0) {
                        displayWidgetResources(data.resources);
                    }
                } else {
                    addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
                }
            } catch (err) {
                removeTypingIndicator(typingId);
                addMessage('assistant', 'Sorry, I encountered a connection error.');
            }
        } finally {
            isProcessing = false;
            widgetSend.disabled = false;
            widgetInput.focus();
        }
    }

    // Creates an empty assistant bubble ready for streaming text
    function createStreamingBubble() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'widget-message assistant';

        const avatar = document.createElement('div');
        avatar.className = 'widget-avatar';
        avatar.innerHTML = `<img src="${botSettings.avatarUrl}" alt="${botSettings.botName}" class="widget-avatar-image" onerror="this.style.display='none';this.parentElement.textContent='🤖';" />`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'widget-message-content streaming';
        contentDiv.textContent = '';

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        widgetMessages.appendChild(messageDiv);
        widgetMessages.scrollTop = widgetMessages.scrollHeight;

        return { messageDiv, contentDiv };
    }

    function addMessage(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `widget-message ${role}`;

        const avatar = document.createElement('div');
        avatar.className = 'widget-avatar';

        if (role === 'assistant') {
            avatar.innerHTML = `<img src="${botSettings.avatarUrl}" alt="${botSettings.botName}" class="widget-avatar-image" onerror="this.style.display='none';this.parentElement.textContent='🤖';" />`;
        } else {
            avatar.textContent = '👤';
        }

        const contentDiv = document.createElement('div');
        contentDiv.className = 'widget-message-content';
        contentDiv.innerHTML = formatMessage(content);

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        widgetMessages.appendChild(messageDiv);
        widgetMessages.scrollTop = widgetMessages.scrollHeight;
    }

    function formatMessage(text) {
        if (!text) return '';

        // Un-escape markdown brackets if they were escaped by OpenAI
        text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\\(/g, '(').replace(/\\\)/g, ')');

        if (typeof marked !== 'undefined') {
            const renderer = new marked.Renderer();
            const linkRenderer = renderer.link;
            renderer.link = function(href, title, text) {
                const html = linkRenderer.call(renderer, href, title, text);
                return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" style="color: #22c55e; text-decoration: underline; font-weight: 500;" ');
            };
            return marked.parse(text, { renderer: renderer, breaks: true, gfm: true });
        }

        // Basic fallback if marked is not loaded
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return text.replace(/\n/g, '<br>');
    }

    function displayWidgetResources(resources) {
        if (!resources || resources.length === 0) {
            console.log('📚 No resources to display');
            return;
        }

        console.log(`📚 Displaying ${resources.length} resources`);

        const resourcesDiv = document.createElement('div');
        resourcesDiv.className = 'widget-resources-container';
        resourcesDiv.style.cssText = `
            margin-top: 12px;
            padding: 12px;
            background: #f0fdf4;
            border: 1px solid #dcfce7;
            border-radius: 8px;
            max-width: 100%;
        `;

        const resourcesHeader = document.createElement('div');
        resourcesHeader.style.cssText = 'font-weight: 600; color: #166534; margin-bottom: 8px; font-size: 12px;';
        resourcesHeader.textContent = `📚 Resources (${resources.length})`;
        resourcesDiv.appendChild(resourcesHeader);

        resources.forEach((resource, idx) => {
            console.log(`   Resource ${idx + 1}: ${resource.title}`);
            const resourceItem = document.createElement('div');
            resourceItem.style.cssText = `
                padding: 8px;
                background: white;
                border: 1px solid #bbf7d0;
                border-radius: 6px;
                margin-bottom: 8px;
                font-size: 12px;
            `;

            const title = document.createElement('div');
            title.style.cssText = 'font-weight: 500; color: #15803d; margin-bottom: 4px;';
            title.textContent = resource.title || resource.filename;
            resourceItem.appendChild(title);

            if (resource.description) {
                const desc = document.createElement('div');
                desc.style.cssText = 'color: #555; margin-bottom: 6px; font-size: 11px; line-height: 1.4;';
                desc.textContent = resource.description;
                resourceItem.appendChild(desc);
            }

            const downloadBtn = document.createElement('button');
            downloadBtn.style.cssText = `
                background: #22c55e;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
                transition: background 0.2s;
            `;
            downloadBtn.textContent = '⬇️ Download';
            downloadBtn.onmouseover = () => downloadBtn.style.background = '#16a34a';
            downloadBtn.onmouseout = () => downloadBtn.style.background = '#22c55e';
            downloadBtn.onclick = (e) => {
                downloadResource(resource.id || resource._id, resource.filename, e);
            };
            resourceItem.appendChild(downloadBtn);

            resourcesDiv.appendChild(resourceItem);
        });

        widgetMessages.appendChild(resourcesDiv);
        widgetMessages.scrollTop = widgetMessages.scrollHeight;
        console.log('✅ Resources displayed in widget');
    }

    function downloadResource(resourceId, filename, e) {
        const downloadUrl = `${API_URL}/api/resources/${resourceId}/download`;
        console.log(`⬇️ Downloading: ${filename} from ${downloadUrl}`);

        // Show loading state on button
        const btn = e && e.target;
        const origText = btn ? btn.textContent : '';
        if (btn) { btn.textContent = '⏳ Downloading...'; btn.disabled = true; }
        
        fetch(downloadUrl)
            .then(res => {
                if (!res.ok) throw new Error(`Server returned ${res.status}: ${res.statusText}`);
                return res.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename || 'document.pdf';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                if (btn) { btn.textContent = '✅ Downloaded!'; setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000); }
            })
            .catch(err => {
                console.error('Download error:', err);
                if (btn) { btn.textContent = '❌ Failed'; setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 2000); }
                alert(`Failed to download: ${err.message}\nTry: ${downloadUrl}`);
            });
    }

    // Fallback: fetch resources from API if stream didn't include them
    async function fetchAndDisplayResources(message) {
        try {
            const keywords = message.toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ');
            const url = `${API_URL}/api/resources/search/${encodeURIComponent(keywords || 'business')}`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            if (data.resources && data.resources.length > 0) {
                console.log('📚 Fallback resources loaded:', data.resources.length);
                displayWidgetResources(data.resources);
            } else {
                // Last resort: get latest resources
                const latestRes = await fetch(`${API_URL}/api/resources?limit=3`);
                if (latestRes.ok) {
                    const latestData = await latestRes.json();
                    if (latestData.resources && latestData.resources.length > 0) {
                        console.log('📚 Showing latest resources as fallback:', latestData.resources.length);
                        displayWidgetResources(latestData.resources);
                    }
                }
            }
        } catch (e) {
            console.warn('Fallback resource fetch failed:', e.message);
        }
    }



    function showTypingIndicator() {
        const typingId = `typing-${Date.now()}`;
        const typingDiv = document.createElement('div');
        typingDiv.id = typingId;
        typingDiv.className = 'widget-message assistant';
        typingDiv.innerHTML = `
            <div class="widget-avatar">
                <img src="${botSettings.avatarUrl}" alt="${botSettings.botName}" class="widget-avatar-image" onerror="this.style.display='none';this.parentElement.textContent='🤖';" />
            </div>
            <div class="widget-message-content">
                <div class="widget-typing">
                    <div class="widget-typing-dot"></div>
                    <div class="widget-typing-dot"></div>
                    <div class="widget-typing-dot"></div>
                </div>
            </div>
        `;
        widgetMessages.appendChild(typingDiv);
        widgetMessages.scrollTop = widgetMessages.scrollHeight;
        return typingId;
    }

    function removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    function updateWidgetUI() {
        const welcomeAvatar = document.querySelector('.widget-avatar-image');
        if (welcomeAvatar) {
            welcomeAvatar.src = botSettings.avatarUrl;
        }

        const welcomeTitle = document.querySelector('.widget-welcome-text h3');
        if (welcomeTitle) {
            welcomeTitle.textContent = `Hi! I'm ${botSettings.botName}`;
        }

        const welcomeText = document.querySelector('.widget-welcome-text p');
        if (welcomeText) {
            welcomeText.textContent = botSettings.welcomeMessage;
        }

        const widgetTitle = document.querySelector('.widget-title span');
        if (widgetTitle) {
            widgetTitle.textContent = botSettings.botName;
        }
    }
});

async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/api/settings`);
        if (response.ok) {
            const data = await response.json();
            botSettings = { ...botSettings, ...data };
        }
    } catch (e) { console.error('Settings load error', e); }
}

function generateConversationId() {
    return `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
