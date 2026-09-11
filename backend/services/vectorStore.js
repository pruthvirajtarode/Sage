const fs = require('fs');
const path = require('path');
const { generateEmbedding } = require('./openai');

const DATA_DIR = path.join(__dirname, '../../data/vectors');
const KNOWLEDGE_FILE = path.join(DATA_DIR, 'store.json');

class VectorStore {
    constructor() {
        this.cache = null;
        this._embCache = new Map();
        
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(KNOWLEDGE_FILE)) {
            fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify([]));
        }
    }

    // Load from local JSON instead of MongoDB
    async getChunks() {
        if (this.cache) return this.cache;
        try {
            const data = fs.readFileSync(KNOWLEDGE_FILE, 'utf8');
            const chunks = JSON.parse(data);
            // Filter active chunks (assuming admin structure)
            this.cache = chunks.filter(c => c.metadata && c.metadata.isActive !== false);
            return this.cache;
        } catch (e) {
            console.error('Failed to load knowledge file:', e);
            return [];
        }
    }

    async search(query, topK = 6) {
        try {
            const STOP_WORDS = new Set(['the', 'is', 'in', 'at', 'of', 'on', 'and', 'a', 'to', 'for', 'it', 'what', 'who', 'how', 'tell', 'me', 'about', 'can', 'you', 'explain', 'describe', 'details', 'know', '是', '的', '在', '了', '和', '与', '为', '请', '你', '我', '他', '她', '它', '介绍', '详细']);
            const queryWords = query.toLowerCase()
                .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 1 && !STOP_WORDS.has(w));

            const cacheKey = query.toLowerCase().trim();
            let embPromise;
            
            const cached = this._embCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
                embPromise = Promise.resolve(cached.emb);
            } else {
                embPromise = generateEmbedding(query).then(emb => {
                    if (this._embCache.size >= 200) this._embCache.delete(this._embCache.keys().next().value);
                    this._embCache.set(cacheKey, { emb, ts: Date.now() });
                    return emb;
                });
            }

            const [fullChunks, queryEmbedding] = await Promise.all([
                this.getChunks(),
                embPromise
            ]);

            const results = fullChunks.map(doc => {
                if (!doc.embedding) return { similarity: -1 };
                let score = this.cosineSimilarity(queryEmbedding, doc.embedding);

                const filename = (doc.metadata?.filename || doc.metadata?.source || '').toLowerCase().replace(/[_\-\.]/g, ' ');
                const filenameMatchCount = queryWords.filter(w => filename.includes(w)).length;
                if (filenameMatchCount > 0) score += 0.15 * Math.min(filenameMatchCount, 3);

                if (doc.metadata?.summary) {
                    const summaryLower = doc.metadata.summary.toLowerCase();
                    const summaryMatchCount = queryWords.filter(w => summaryLower.includes(w)).length;
                    if (summaryMatchCount > 0) score += 0.08 * Math.min(summaryMatchCount, 4);
                }

                return { text: doc.text, source: doc.metadata?.source, similarity: score };
            }).filter(res => res.similarity > 0);

            results.sort((a, b) => b.similarity - a.similarity);
            return results.slice(0, topK);
        } catch (error) {
            console.error('Error searching JSON Vector Store:', error.message);
            return [];
        }
    }

    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dotProduct = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
        }
        return dotProduct;
    }

    async addDocuments(docs) {
        console.log(`📥 Adding ${docs.length} documents to local store...`);
        const currentChunks = await this.getChunks();
        
        for (const doc of docs) {
            const { text, metadata } = doc;
            const embedding = await generateEmbedding(text);
            currentChunks.push({
                text,
                embedding,
                metadata: {
                    ...metadata,
                    isActive: metadata.isActive !== undefined ? metadata.isActive : true
                }
            });
        }

        fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(currentChunks, null, 2));
        this.cache = currentChunks;
        console.log(`✅ Saved ${docs.length} new chunks to local storage.`);
    }

    async clearAll() {
        fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify([]));
        this.cache = null;
    }
}

module.exports = new VectorStore();
