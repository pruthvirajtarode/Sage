const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { generateResponse, SYSTEM_PROMPT } = require('../services/openai');
const vectorStore = require('../services/vectorStore');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATA_DIR = path.join(__dirname, '../../data');
const CONV_FILE = path.join(DATA_DIR, 'conversations.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(CONV_FILE)) {
    fs.writeFileSync(CONV_FILE, JSON.stringify({}));
}

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
    if (isGreetingOrChitChat(message)) {
        console.log('⚡ Greeting detected — skipping vector search');
        return '';
    }

    const cached = getCached(message);
    if (cached !== null) { console.log('⚡ Cache hit'); return cached; }

    const relevantDocs = await vectorStore.search(message, 4);
    let context = '';
    let maxSim = 0;

    relevantDocs.forEach(doc => {
        if (doc.similarity > maxSim) maxSim = doc.similarity;
        if (doc.similarity > 0.40) {
            context += `\n[Source: ${doc.source}]\n${doc.text}\n`;
        }
    });

    if (context.length > 4000) context = context.substring(0, 4000) + '...';
    console.log(`🔍 Max similarity: ${maxSim.toFixed(3)}, context: ${context.length} chars`);
    setCache(message, context);
    return context;
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
    if (GREETINGS.has(clean)) return true;
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
        return "您好！我是 SAGE AI，YAS Shoe Care 的智能商务助手。您可以向我了解我们的产品、服务或合作方式！";
    }

    if (isBusinessQuestion(message)) {
        return "抱歉，系统暂时无法连接服务器，请稍后再试。";
    }
    
    return "我是专门为您提供 YAS Shoe Care 相关信息的商务助手。请问您想了解关于我们产品或服务的哪些信息？";
}

// ─── Helper: File-based conversation storage ────────────────────────────────
async function getConversation(conversationId) {
    try {
        const data = fs.readFileSync(CONV_FILE, 'utf8');
        const convs = JSON.parse(data);
        if (convs[conversationId]) {
            return { conversationId, messages: convs[conversationId].messages || [] };
        }
    } catch (e) {
        console.warn('Failed to read conversations.json, creating new.');
    }
    return { conversationId, messages: [] };
}

async function saveConversation(conv) {
    try {
        if (conv.messages.length > 10) conv.messages = conv.messages.slice(-10);
        let convs = {};
        try {
            convs = JSON.parse(fs.readFileSync(CONV_FILE, 'utf8'));
        } catch(e) {}
        convs[conv.conversationId] = { messages: conv.messages, updatedAt: new Date() };
        fs.writeFileSync(CONV_FILE, JSON.stringify(convs, null, 2));
    } catch (e) {
        console.warn('DB conversation save failed:', e.message);
    }
}

/**
 * POST /api/chat/stream — Streaming chat with SSE
 */
router.post('/stream', async (req, res) => {
    try {
        const { message, conversationId = `conv_${Date.now()}` } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders();

        const isGreeting = isGreetingOrChitChat(message);
        const isBusiness = isBusinessQuestion(message);

        let convPromise = getConversation(conversationId);
        let contextPromise = (!isBusiness && !isGreeting) ? Promise.resolve('') : buildContext(message);

        const [conv, context] = await Promise.all([convPromise, contextPromise]);
        
        conv.messages.push({ role: 'user', content: message });

        if (isBusiness) {
            res.write(`data: ${JSON.stringify({ token: "正在检索 YAS Shoe Care 官方资料库..." })}\n\n`);
        }

        if (!isBusiness && !isGreeting) {
            const fallback = getSmartFallback(message);
            res.write(`data: ${JSON.stringify({ token: fallback })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true, resources: [] })}\n\n`);
            res.end();

            conv.messages.push({ role: 'assistant', content: fallback });
            await saveConversation(conv);
            return;
        }

        const systemContent = context
            ? SYSTEM_PROMPT + `\n\n**Relevant Internal Content:**\n${context}`
            : SYSTEM_PROMPT;

        let fullResponse = isBusiness ? '正在检索 YAS Shoe Care 官方资料库...\n\n' : '';

        try {
            const stream = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'system', content: systemContent }, ...conv.messages.slice(-6).map(m => ({ role: m.role, content: m.content }))],
                temperature: 0.1,
                max_tokens: 300,
                top_p: 0.9,
                stream: true,
            });

            let isFirstChunk = true;
            for await (const chunk of stream) {
                const token = chunk.choices[0]?.delta?.content || '';
                if (token) {
                    if (isFirstChunk && isBusiness) {
                         res.write(`data: ${JSON.stringify({ token: "\n\n" })}\n\n`);
                         isFirstChunk = false;
                    }
                    fullResponse += token;
                    res.write(`data: ${JSON.stringify({ token })}\n\n`);
                }
            }
        } catch (streamErr) {
            console.error('⚠️ OpenAI stream error:', streamErr.message);
            if (!fullResponse || fullResponse === '正在检索 YAS Shoe Care 官方资料库...\n\n') {
                fullResponse = getSmartFallback(message);
                res.write(`data: ${JSON.stringify({ token: fullResponse })}\n\n`);
            }
        }

        res.write(`data: ${JSON.stringify({ done: true, resources: [] })}\n\n`);
        res.end();

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
        
        let response;
        try {
            response = await generateResponse(conv.messages.slice(-6).map(m => ({ role: m.role, content: m.content })), context);
        } catch (aiErr) {
            console.error('⚠️ AI response error:', aiErr.message);
            response = getSmartFallback(message);
        }

        conv.messages.push({ role: 'assistant', content: response });
        saveConversation(conv).catch(e => console.warn('Save failed:', e.message));

        res.json({ 
            response, 
            conversationId, 
            responseTime: Date.now() - startTime, 
            contextUsed: !!context,
            resources: []
        });

    } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process message', message: error.message });
    }
});

module.exports = router;
