const Knowledge = require('../models/Knowledge');
const { generateEmbedding } = require('./openai');

/**
 * MongoDB-backed vector store for production use.
 */
class VectorStore {
    constructor() {
        this.groupedCache = null;
    }

    /**
     * Add document chunks to MongoDB with parallel embedding generation
     * @param {Array<{text: string, metadata: object}>} docs - Array of documents
     */
    async asyncPool(poolLimit, array, iteratorFn) {
        const ret = [];
        const executing = [];
        for (const item of array) {
            const p = Promise.resolve().then(() => iteratorFn(item, array));
            ret.push(p);

            if (poolLimit <= array.length) {
                const e = p.then(() => executing.splice(executing.indexOf(e), 1));
                executing.push(e);
                if (executing.length >= poolLimit) {
                    await Promise.race(executing);
                }
            }
        }
        return Promise.all(ret);
    }

    async addDocuments(docs) {
        try {
            console.log(`📥 Adding ${docs.length} documents to MongoDB...`);
            const startTime = Date.now();

            // Process embeddings in parallel batches for speed
            const batchSize = 5;
            const chunksToInsert = await this.asyncPool(batchSize, docs, async (doc, idx) => {
                const { text, metadata } = doc;
                try {
                    const embedding = await generateEmbedding(text);
                    return {
                        text,
                        embedding,
                        metadata: {
                            ...metadata,
                            isActive: metadata.isActive !== undefined ? metadata.isActive : false
                        }
                    };
                } catch (embErr) {
                    console.error(`❌ Embedding generation failed for chunk:`, embErr.message);
                    throw embErr;
                }
            });

            if (chunksToInsert.length > 0) {
                // Insert in batches of 50 to avoid MongoDB timeout on large documents
                const BATCH_SIZE = 50;
                for (let i = 0; i < chunksToInsert.length; i += BATCH_SIZE) {
                    const batch = chunksToInsert.slice(i, i + BATCH_SIZE);
                    await Knowledge.insertMany(batch, { timeout: false });
                    console.log(`   ✅ Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunksToInsert.length / BATCH_SIZE)} (${batch.length} chunks)`);
                }
            }

            this.groupedCache = null; // Invalidate cache
            this._activeChunksCache = null;
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Bulk addition to MongoDB complete in ${duration}s`);
        } catch (error) {
            console.error('❌ Error in addDocuments:', error.message);
            throw error;
        }
    }

    /**
     * Search for similar documents using MongoDB (cosine similarity in memory for now, or using $vectorSearch if available)
     * Note: Standard MongoDB Atlas Vector Search requires specific setup. 
     * For now we'll fetch active docs and rank in memory if the dataset is small (<2000 chunks).
     */
    async search(query, topK = 6) {
        try {
            const STOP_WORDS = new Set(['the', 'is', 'in', 'at', 'of', 'on', 'and', 'a', 'to', 'for', 'it', 'what', 'who', 'how', 'tell', 'me', 'about', 'can', 'you', 'explain', 'describe', 'details', 'know', '是', '的', '在', '了', '和', '与', '为', '请', '你', '我', '他', '她', '它', '介绍', '详细']);
            const queryWords = query.toLowerCase()
                .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 1 && !STOP_WORDS.has(w));

            // For SAGE AI, we only have a small number of chunks (from the website crawl).
            // Instead of doing multiple slow $regex full-collection scans, 
            // we will fetch all active SAGE chunks (up to 400) and rank them purely in-memory using cosine similarity.
            // This drops DB query time from ~5000ms to ~50ms.
            const fullChunks = await Knowledge.find(
                { 'metadata.isActive': true, 'metadata.tenant': 'sage' },
                { embedding: 1, text: 1, 'metadata.source': 1, 'metadata.filename': 1, 'metadata.summary': 1 }
            ).limit(400).lean();

            if (fullChunks.length === 0) return [];

            if (!this._embCache) this._embCache = new Map();
            const cacheKey = query.toLowerCase().trim();
            let queryEmbedding;
            const cached = this._embCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < 30 * 60 * 1000) {
                queryEmbedding = cached.emb;
            } else {
                queryEmbedding = await generateEmbedding(query);
                if (this._embCache.size >= 200) this._embCache.delete(this._embCache.keys().next().value);
                this._embCache.set(cacheKey, { emb: queryEmbedding, ts: Date.now() });
            }

            const results = fullChunks.map(doc => {
                if (!doc.embedding) return { similarity: -1 };
                let score = this.cosineSimilarity(queryEmbedding, doc.embedding);

                const filename = (doc.metadata.filename || doc.metadata.source || '').toLowerCase().replace(/[_\-\.]/g, ' ');
                const filenameMatchCount = queryWords.filter(w => filename.includes(w)).length;
                if (filenameMatchCount > 0) score += 0.15 * Math.min(filenameMatchCount, 3);

                if (doc.metadata.summary) {
                    const summaryLower = doc.metadata.summary.toLowerCase();
                    const summaryMatchCount = queryWords.filter(w => summaryLower.includes(w)).length;
                    if (summaryMatchCount > 0) score += 0.08 * Math.min(summaryMatchCount, 4);
                }

                return { text: doc.text, source: doc.metadata.source, similarity: score };
            }).filter(res => res.similarity > 0);

            results.sort((a, b) => b.similarity - a.similarity);
            return results.slice(0, topK);
        } catch (error) {
            console.error('Error searching MongoDB:', error);
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

    /**
     * Get grouped sources for admin dashboard
     */
    async getGroupedDocuments() {
        try {
            // ✅ Only show documents explicitly uploaded via admin upload panel
            const grouped = await Knowledge.aggregate([
                {
                    $match: {
                        'metadata.adminUploaded': true   // Only admin-uploaded docs
                    }
                },
                {
                    $group: {
                        _id: "$metadata.source",
                        source: { $first: "$metadata.source" },
                        filename: { $first: "$metadata.filename" },
                        path: { $first: "$metadata.path" },
                        category: { $first: "$metadata.category" },
                        mimetype: { $first: "$metadata.mimetype" },
                        summary: { $first: "$metadata.summary" },
                        isActive: { $first: "$metadata.isActive" },
                        adminUploaded: { $first: "$metadata.adminUploaded" },
                        chunks: { $sum: 1 },
                        createdAt: { $min: "$createdAt" },
                        lastModified: { $max: "$createdAt" }
                    }
                },
                { $sort: { lastModified: -1 } }
            ]);

            // Check which sources have an original file stored (for download button)
            const OriginalDocument = require('../models/OriginalDocument');
            const originalSources = await OriginalDocument.distinct('source');
            const originalSourceSet = new Set(originalSources);

            return grouped.map(g => {
                const source = g.source || 'Unknown Source';
                return {
                    ...g,
                    id: g._id || Math.random().toString(36).substr(2, 9),
                    source,
                    type: (source && typeof source === 'string' && source.startsWith('http')) ? 'webpage' : 'file',
                    hasOriginal: originalSourceSet.has(source)
                };
            });
        } catch (error) {
            console.error('Aggregation error:', error);
            return [];
        }
    }

    async approveBySource(source) {
        const result = await Knowledge.updateMany(
            { $or: [{ 'metadata.source': source }, { 'metadata.filename': source }] },
            { $set: { 'metadata.isActive': true } }
        );
        this.groupedCache = null;
        this._activeChunksCache = null;
        return result.modifiedCount;
    }

    async deactivateBySource(source) {
        const result = await Knowledge.updateMany(
            { $or: [{ 'metadata.source': source }, { 'metadata.filename': source }] },
            { $set: { 'metadata.isActive': false } }
        );
        this.groupedCache = null;
        this._activeChunksCache = null;
        return result.modifiedCount;
    }

    async deleteBySource(source) {
        const result = await Knowledge.deleteMany({ 'metadata.source': source });

        // Also delete original document if it exists
        const OriginalDocument = require('../models/OriginalDocument');
        await OriginalDocument.deleteMany({ source });

        this.groupedCache = null;
        this._activeChunksCache = null;
        return result.deletedCount;
    }

    async clearAll() {
        await Knowledge.deleteMany({});

        // Also clear all original documents
        const OriginalDocument = require('../models/OriginalDocument');
        await OriginalDocument.deleteMany({});

        this.groupedCache = null;
        this._activeChunksCache = null;
    }

    async reindex() {
        console.log('🔄 Re-indexing MongoDB store...');
        const allDocs = await Knowledge.find({});
        console.log(`   Found ${allDocs.length} chunks to re-index.`);

        // Use asyncPool to process in parallel
        await this.asyncPool(10, allDocs, async (doc) => {
            try {
                doc.embedding = await generateEmbedding(doc.text);
                await doc.save();
            } catch (err) {
                console.error(`   ❌ Failed to re-index chunk ${doc._id}:`, err.message);
            }
        });

        console.log('✅ Re-indexing completed.');
        this.groupedCache = null;
        this._activeChunksCache = null;
    }
}

module.exports = new VectorStore();

