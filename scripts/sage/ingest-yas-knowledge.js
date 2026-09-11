const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Knowledge = require('../../backend/models/Knowledge');
const { generateEmbedding } = require('../../backend/services/openai');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const KNOWLEDGE_DIR = path.join(__dirname, 'knowledge-base', 'website-content');

// Helper to chunk text
function chunkText(text, maxChars = 800) {
    const chunks = [];
    const sentences = text.split(/([。！？.!?]+)/);
    
    let currentChunk = '';
    for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i] + (sentences[i+1] || '');
        if ((currentChunk.length + sentence.length) > maxChars && currentChunk.length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += ' ' + sentence;
        }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    return chunks;
}

async function ingestKnowledge() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected.');

        if (!fs.existsSync(KNOWLEDGE_DIR)) {
            console.error('Knowledge directory not found:', KNOWLEDGE_DIR);
            return;
        }

        const files = fs.readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith('.json'));
        console.log(`Found ${files.length} documents to ingest.`);

        for (const file of files) {
            const docPath = path.join(KNOWLEDGE_DIR, file);
            const doc = JSON.parse(fs.readFileSync(docPath, 'utf8'));

            console.log(`Processing: ${doc.title} (${doc.source_url})`);

            // Chunk the text
            const chunks = chunkText(doc.content);
            console.log(`Generated ${chunks.length} chunks.`);

            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks[i];
                if (chunkText.length < 20) continue; // Skip very small chunks

                try {
                    const embedding = await generateEmbedding(chunkText);
                    
                    const knowledge = new Knowledge({
                        text: chunkText,
                        embedding: embedding,
                        metadata: {
                            source: doc.source_url,
                            filename: file,
                            category: doc.category,
                            summary: doc.title,
                            chunkIndex: i,
                            totalChunks: chunks.length,
                            tenant: 'sage',
                            brand: 'YAS Shoe Care',
                            language: doc.language,
                            isActive: true,
                            type: 'webpage'
                        }
                    });

                    await knowledge.save();
                    console.log(`  Saved chunk ${i+1}/${chunks.length}`);
                } catch (e) {
                    console.error(`  Error saving chunk ${i+1}:`, e.message);
                }
            }
        }
        
        console.log('Ingestion completed successfully.');

    } catch (error) {
        console.error('Ingestion error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

ingestKnowledge();
