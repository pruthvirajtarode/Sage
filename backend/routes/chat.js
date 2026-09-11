const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { generateResponse, SYSTEM_PROMPT } = require('../services/openai');
const vectorStore = require('../services/vectorStore');
const airtableService = require('../services/airtableService');
const { generatePDF, generatePowerPoint, compileDocumentSections } = require('../services/documentGenerator');
const OpenAI = require('openai');
const Conversation = require('../models/Conversation');
const Resource = require('../models/Resource');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─── Response cache (avoids re-embedding same questions) ─────────────────────
const queryCache = new Map();
const CACHE_MAX = 50;
const CACHE_TTL = 10 * 60 * 1000; // 10 min

function getCached(query) {
    const key = query.toLowerCase().trim();
    const entry = queryCache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.context;
    return null;
}

function setCache(query, context) {
    const key = query.toLowerCase().trim();
    if (queryCache.size >= CACHE_MAX) queryCache.delete(queryCache.keys().next().value);
    queryCache.set(key, { context, ts: Date.now() });
}

// ─── Helper: Vector-search context ───────────────────────────────────────────
async function buildContext(message) {
    // ⚡ Skip vector search entirely for greetings — instant reply
    if (isGreetingOrChitChat(message)) {
        console.log('⚡ Greeting detected — skipping vector search');
        return '';
    }

    const cached = getCached(message);
    if (cached !== null) { console.log('⚡ Cache hit'); return cached; }

    // Reduced from 8 → 4 results for faster embedding + search
    const relevantDocs = await vectorStore.search(message, 4);
    let context = '';
    let maxSim = 0;

    relevantDocs.forEach(doc => {
        if (doc.similarity > maxSim) maxSim = doc.similarity;
        if (doc.similarity > 0.40) {
            context += `\n[Source: ${doc.source}]\n${doc.text}\n`;
        }
    });

    // Reduced context from 12,000 → 4,000 chars for faster OpenAI response
    if (context.length > 4000) context = context.substring(0, 4000) + '...';
    console.log(`🔍 Max similarity: ${maxSim.toFixed(3)}, context: ${context.length} chars`);
    setCache(message, context);
    return context;
}

// ─── Helper: Suggest relevant resources based on message ──────────────────────
async function suggestResources(message, limit = 5) {
    try {
        // Extract keywords from message
        const keywords = extractKeywords(message);
        
        // Build query to find relevant resources
        let query = { isActive: true, isPublic: true };
        
        if (keywords.length > 0) {
            query.$or = [
                { keywords: { $in: keywords } },
                { tags: { $in: keywords } },
                { title: { $regex: keywords.join('|'), $options: 'i' } }
            ];
        }
        
        // Fetch extra to allow for deduplication
        const resources = await Resource.find(query)
            .select('-data')
            .limit(limit * 3)
            .lean();

        // Deduplicate by title
        const uniqueResources = [];
        const seenTitles = new Set();
        for (const r of resources) {
            if (!seenTitles.has(r.title)) {
                seenTitles.add(r.title);
                uniqueResources.push(r);
                if (uniqueResources.length >= limit) break;
            }
        }

        return uniqueResources.map(r => ({
            id: r._id,
            filename: r.filename,
            title: r.title,
            category: r.category,
            description: r.description,
            fileType: getFileType(r.mimetype)
        }));
    } catch (error) {
        console.warn('⚠️ Resource suggestion error:', error.message);
        return [];
    }
}

// ─── Helper: Extract keywords from message ────────────────────────────────────
function extractKeywords(message) {
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'what', 'how', 'why', 'when', 'where', 'who', 'that', 'this', 'these', 'those', 'can', 'need', 'want']);
    
    return message
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3 && !commonWords.has(word))
        .slice(0, 5);
}

// ─── Helper: Detect if message is a greeting / chit-chat (not a business Q) ──
const GREETINGS = new Set([
    'hi', 'hello', 'hey', 'hiya', 'howdy', 'sup', 'yo', 'greetings',
    'good morning', 'good afternoon', 'good evening', 'good night',
    'morning', 'afternoon', 'evening',
    'thanks', 'thank you', 'thankyou', 'thx', 'ty',
    'ok', 'okay', 'k', 'sure', 'got it', 'alright', 'nice', 'cool', 'great',
    'bye', 'goodbye', 'see you', 'later', 'cya',
    'yes', 'no', 'yeah', 'nope', 'yep', 'nah',
    'how are you', 'how r u', 'whats up', "what's up",
    'who are you', 'what are you', 'who r u',
    '你好', '您好', '嗨', '早上好', '下午好', '晚上好',
    '谢谢', '多谢', '好的', '明白', '再见', '拜拜',
    '你是谁', '在吗', 'ok', 'yes', 'no', '对', '错'
]);

function isGreetingOrChitChat(message) {
    const clean = message.toLowerCase().trim().replace(/[.,!?;:。，！？”“]/g, '');
    // Direct match
    if (GREETINGS.has(clean)) return true;
    // Very short messages without business keywords
    const isChinese = /[\u4e00-\u9fa5]/.test(clean);
    if (isChinese) {
        if (clean.length <= 4 && !hasBusinessKeyword(clean)) return true;
    } else {
        const words = clean.split(/\s+/).filter(Boolean);
        if (words.length <= 2 && !hasBusinessKeyword(clean)) return true;
    }
    return false;
}

const BUSINESS_KEYWORDS = [
    '公司', '产品', '鞋类护理', '皮革护理', '运动鞋护理', '麂皮护理',
    'oem', 'odm', '工厂', '制造', '生产', '定制', '私人品牌', '私牌',
    '起订量', 'moq', '报价', '交期', '产能', '质量', '认证', '研发',
    '合作', '销售', '批发', '出口', 'yas', 'shoe', 'care', 'product',
    'manufacturing', 'factory', 'quality', 'certification', 'lead time',
    'capacity', 'business', 'cooperation'
];

function hasBusinessKeyword(text) {
    const lower = text.toLowerCase();
    return BUSINESS_KEYWORDS.some(kw => lower.includes(kw));
}

function isBusinessQuestion(message) {
    const clean = message.toLowerCase().trim();
    if (hasBusinessKeyword(clean)) return true;
    
    // Check for common non-business/generic patterns
    const nonBusinessPatterns = [
        /\b(weather|time|date|match|game|sport|joke|song|movie|music|play|eat|food|restaurant|recipe|hotel|flight|train|map|direction|joke|hello|hi|hey|thanks|thank you|cricket|football|soccer|basketball|tennis)\b/i,
        /(天气|时间|日期|比赛|游戏|运动|笑话|唱歌|电影|音乐|玩|吃|食物|餐厅|食谱|酒店|航班|火车|地图|方向|你好|嗨|谢谢|足球|篮球)/
    ];
    
    if (nonBusinessPatterns.some(pat => pat.test(clean))) {
        return false;
    }
    
    const isChinese = /[\u4e00-\u9fa5]/.test(clean);
    if (isChinese) {
        return clean.length >= 5;
    } else {
        const words = clean.split(/\s+/).filter(Boolean);
        return words.length >= 6;
    }
}

// ─── Helper: Smart fallback when OpenAI is unavailable ────────────────────────
function getSmartFallback(message) {
    if (isGreetingOrChitChat(message)) {
        return "您好！我是 SAGE AI，YAS Shoe Care 的智能商务助手。您可以向我了解我们的产品、OEM/ODM 服务、制造能力或合作方式！";
    }

    if (isBusinessQuestion(message)) {
        return "抱歉，系统暂时无法连接服务器，请稍后再试。";
    }
    
    return "我是专门为您提供 YAS Shoe Care 相关信息的商务助手。请问您想了解关于我们产品或服务的哪些信息？";
}

// ─── Helper: Get file type from MIME type ─────────────────────────────────────
function getFileType(mimetype) {
    if (mimetype.includes('pdf')) return 'PDF';
    if (mimetype.includes('spreadsheet') || mimetype.includes('sheet')) return 'Excel';
    if (mimetype.includes('presentation')) return 'PowerPoint';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'Word';
    return 'Document';
}

function deduplicateResources(resources) {
    const unique = [];
    const seen = new Set();
    for (const r of resources) {
        const titleKey = r.title.toLowerCase().trim();
        if (!seen.has(titleKey)) {
            seen.add(titleKey);
            unique.push(r);
        }
    }
    return unique;
}

// ─── Helper: Load conversation messages from MongoDB ─────────────────────────
async function getConversation(conversationId) {
    try {
        let conv = await Conversation.findOne({ conversationId });
        if (!conv) conv = new Conversation({ conversationId, messages: [] });
        return conv;
    } catch (e) {
        console.warn('DB conversation load failed, using empty:', e.message);
        return { conversationId, messages: [], save: async () => { } };
    }
}

// ─── Helper: Save conversation to MongoDB ────────────────────────────────────
async function saveConversation(conv) {
    try {
        // Keep last 10 messages to avoid document bloat
        if (conv.messages.length > 10) conv.messages = conv.messages.slice(-10);
        conv.updatedAt = new Date();
        await conv.save();
    } catch (e) {
        console.warn('DB conversation save failed:', e.message);
    }
}

// ─── Helper: Generate PDF and PPT documents from response ────────────────────────
async function generateDocuments(topic, response) {
    try {
        console.log(`📄 Starting PDF generation for topic: "${topic}"`);
        
        // ⚠️ Check if MongoDB is connected before attempting save
        if (mongoose.connection.readyState !== 1) {
            console.warn('⚠️ MongoDB not connected (state: ' + mongoose.connection.readyState + '), skipping PDF generation');
            console.log('   (Database will connect on next request via the DB-ready guard)');
            return [];
        }
        
        // Extract topic from first 50 chars if not provided
        if (!topic || topic.length === 0) {
            topic = response.substring(0, 50).replace(/\s+/g, '_');
            console.log(`   Topic auto-generated: "${topic}"`);
        }

        console.log(`   Compiling document sections...`);
        // Compile sections
        const { pdfSections } = compileDocumentSections(topic, response);
        console.log(`   ✓ Compiled ${pdfSections.length} PDF sections`);

        console.log(`   Generating PDF buffer...`);
        // Generate PDF only (PowerPoint disabled due to library issue)
        const pdfBuffer = await generatePDF('Business Development Guide', topic, pdfSections);
        console.log(`   ✓ PDF buffer created (${pdfBuffer.length} bytes)`);

        const timestamp = Date.now();
        const topicSlug = topic.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        const pdfFilename = `guide_${topicSlug}_${timestamp}.pdf`;

        console.log(`   Saving to MongoDB: ${pdfFilename}`);
        // Save PDF to MongoDB
        const pdfResource = await new Resource({
            filename: pdfFilename,
            title: `${topic} - Guide (AI-Generated)`,
            description: `Comprehensive PDF guide on ${topic}`,
            category: 'Strategy',
            keywords: topic.split(' ').filter(w => w.length > 2),
            tags: ['AI-Generated', 'Guide', 'PDF'],
            mimetype: 'application/pdf',
            size: pdfBuffer.length,
            data: pdfBuffer,
            isActive: true,
            isPublic: true
        }).save();
        
        console.log(`✅ Generated PDF: ${pdfFilename} (${pdfBuffer.length} bytes), saved with ID: ${pdfResource._id}`);

        return [
            {
                id: pdfResource._id,
                filename: pdfFilename,
                title: pdfResource.title,
                description: pdfResource.description,
                fileType: 'pdf',
                size: pdfResource.size,
                downloadUrl: `/api/resources/${pdfResource._id}/download`
            }
        ];
    } catch (error) {
        console.error('❌ Document generation error:', error.message);
        console.error('Full error:', error);
        console.error('Stack trace:', error.stack);
        return [];
    }
}

/**
 * POST /api/chat/stream — Streaming chat with SSE
 */
router.post('/stream', async (req, res) => {
    try {
        const { message, conversationId = `conv_${Date.now()}` } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        // Load from DB
        const conv = await getConversation(conversationId);
        conv.messages.push({ role: 'user', content: message });

        const isGreeting = isGreetingOrChitChat(message);
        const isBusiness = isBusinessQuestion(message);

        if (!isBusiness && !isGreeting) {
            const fallback = getSmartFallback(message);
            res.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true, resources: [] })}\n\n`);
            res.end();

            conv.messages.push({ role: 'assistant', content: fallback });
            await saveConversation(conv);
            return;
        }

        const context = await buildContext(message);
        const systemContent = context
            ? SYSTEM_PROMPT + `\n\n**Relevant Internal Content:**\n${context}`
            : SYSTEM_PROMPT;

        // --- Lead Capture Logic ---
        const emailMatch = message.match(/\S+@\S+\.\S+/);
        if (emailMatch) {
            console.log(`📋 Lead detected: ${emailMatch[0]} — syncing to Airtable...`);
            airtableService.createLead({
                email: emailMatch[0],
                message: message,
                source: 'MelissAI Chatbot (Stream)',
                conversationId: conversationId
            }).catch(err => console.error('⚠️ Lead sync deferred:', err.message));
        }
        // ---------------------------------------------------------

        let fullResponse = '';

        try {
            const stream = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'system', content: systemContent }, ...conv.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))],
                temperature: 0.1,
                max_tokens: 400,
                top_p: 0.9,
                stream: true,
            });

            for await (const chunk of stream) {
                const token = chunk.choices[0]?.delta?.content || '';
                if (token) {
                    fullResponse += token;
                    res.write(`data: ${JSON.stringify({ token })}\n\n`);
                }
            }
        } catch (streamErr) {
            console.error('⚠️ OpenAI stream error:', streamErr.message);
            // Smart fallback: greeting vs business question
            if (!fullResponse) {
                fullResponse = getSmartFallback(message);
                res.write(`data: ${JSON.stringify({ token: fullResponse })}\n\n`);
            }
        }

        // Only fetch/generate resources for real business questions — NOT greetings
        const isRealQuestion = isBusinessQuestion(message) && !isGreetingOrChitChat(message);

        // 📚 Get suggested resources (only for business questions) — kept awaited but fast (DB query)
        const suggestedResources = isRealQuestion ? await suggestResources(message, 5) : [];

        // 📄 Generate PDF only for real business questions with a substantive AI response
        let generatedDocs = [];
        if (isRealQuestion && fullResponse && fullResponse.length > 100 && !fullResponse.includes('temporary connection issue') && !fullResponse.includes('MelissAI, your business development assistant')) {
            try {
                generatedDocs = await generateDocuments(message.substring(0, 60), fullResponse);
                console.log(`✅ Generated ${generatedDocs.length} documents for topic: ${message.substring(0, 60)}`);
            } catch (error) {
                console.error('❌ Document generation error:', error.message);
            }
        } else {
            if (!isRealQuestion) console.log(`💬 Greeting/chitchat detected — skipping PDF generation for: "${message}"`);
        }

        // Combine all resources and deduplicate by title
        const allResources = deduplicateResources([...suggestedResources, ...generatedDocs]);
        console.log(`📚 Sending ${allResources.length} resources (${suggestedResources.length} suggested + ${generatedDocs.length} generated, after deduplication)`);

        // Send done event with resources - FLUSH immediately
        res.write(`data: ${JSON.stringify({ done: true, resources: allResources })}\n\n`);
        res.end();

        // Persist to MongoDB asynchronously
        if (fullResponse) {
            conv.messages.push({ role: 'assistant', content: fullResponse });
            saveConversation(conv).catch(e => console.warn('Save failed:', e.message));
        }

    } catch (error) {
        console.error('Stream chat error:', error);
        try {
            res.write(`data: ${JSON.stringify({ error: 'Failed to generate response' })}\n\n`);
            res.end();
        } catch (e) { /* already closed */ }
    }
});


/**
 * POST /api/chat — Standard (non-streaming) endpoint
 */
router.post('/', async (req, res) => {
    try {
        const { message, conversationId = `conv_${Date.now()}` } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const startTime = Date.now();
        const conv = await getConversation(conversationId);
        conv.messages.push({ role: 'user', content: message });

        const isGreeting = isGreetingOrChitChat(message);
        const isBusiness = isBusinessQuestion(message);

        if (!isBusiness && !isGreeting) {
            const fallback = getSmartFallback(message);
            conv.messages.push({ role: 'assistant', content: fallback });
            await saveConversation(conv);
            return res.json({
                response: fallback,
                conversationId,
                responseTime: Date.now() - startTime,
                contextUsed: false,
                resources: []
            });
        }

        const context = await buildContext(message);
        
        // --- Lead Capture Logic ---
        const emailMatch = message.match(/\S+@\S+\.\S+/);
        if (emailMatch) {
            airtableService.createLead({
                email: emailMatch[0],
                message: message,
                source: 'MelissAI Chatbot (Standard)',
                conversationId: conversationId
            }).catch(e => console.error('⚠️ Lead sync failed:', e.message));
        }
        // -------------------------

        let response;
        try {
            response = await generateResponse(conv.messages.slice(-6).map(m => ({ role: m.role, content: m.content })), context);
        } catch (aiErr) {
            console.error('⚠️ AI response error:', aiErr.message);
            response = getSmartFallback(message);
        }

        conv.messages.push({ role: 'assistant', content: response });
        saveConversation(conv).catch(e => console.warn('Save failed:', e.message));

        // Only fetch/generate resources for real business questions — NOT greetings
        const isRealQuestion = isBusinessQuestion(message) && !isGreetingOrChitChat(message);

        // 📚 Get suggested resources (only for business questions)
        const suggestedResources = isRealQuestion ? await suggestResources(message, 5) : [];

        // 📄 Generate PDF only for real business questions with substantive AI response
        let generatedDocs = [];
        if (isRealQuestion && response && response.length > 100 && !response.includes('temporary connection issue') && !response.includes('MelissAI, your business development assistant')) {
            try {
                generatedDocs = await generateDocuments(message.substring(0, 60), response);
                console.log(`✅ Generated ${generatedDocs.length} documents for: ${message.substring(0, 60)}`);
            } catch (error) {
                console.error('❌ Document generation error:', error.message);
            }
        } else if (!isRealQuestion) {
            console.log(`💬 Greeting detected — skipping PDF for: "${message}"`);
        }

        // Combine all resources and deduplicate by title
        const allResources = deduplicateResources([...suggestedResources, ...generatedDocs]);

        res.json({ 
            response, 
            conversationId, 
            responseTime: Date.now() - startTime, 
            contextUsed: !!context,
            resources: allResources
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process message', message: error.message });
    }
});

/**
 * GET /api/chat/conversations — List all conversations for admin panel
 */
router.get('/conversations', async (req, res) => {
    try {
        const convs = await Conversation.find({})
            .sort({ updatedAt: -1 })
            .limit(50)
            .lean();

        const conversationList = convs.map(c => ({
            id: c.conversationId || c._id,
            messageCount: Array.isArray(c.messages) ? c.messages.length : 0,
            lastMessage: Array.isArray(c.messages) && c.messages.length > 0
                ? c.messages[c.messages.length - 1]
                : null,
            updatedAt: c.updatedAt || c.createdAt,
            createdAt: c.createdAt
        }));

        console.log(`📊 Admin: Fetched ${conversationList.length} recent conversations`);
        res.json({ conversations: conversationList });
    } catch (error) {
        console.error('❌ Get conversations error:', error.message);
        res.status(500).json({ conversations: [], error: error.message });
    }
});

/**
 * GET /api/chat/conversation/:id — Get full conversation
 */
router.get('/conversation/:id', async (req, res) => {
    try {
        const conv = await Conversation.findOne({ conversationId: req.params.id }).lean();
        if (!conv) return res.status(404).json({ error: 'Conversation not found' });
        res.json({ conversation: conv.messages });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load conversation' });
    }
});

/**
 * DELETE /api/chat/conversation/:id
 */
router.delete('/conversation/:id', async (req, res) => {
    try {
        await Conversation.deleteOne({ conversationId: req.params.id });
        res.json({ message: 'Conversation deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});

module.exports = router;
