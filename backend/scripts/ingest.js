const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const fs = require('fs');
const { processDocument } = require('../services/documentProcessor');
const vectorStore = require('../services/vectorStore');

const CONTENT_DIR = path.join(__dirname, '../../NMV Online Content');

async function walk(dir) {
    let files = [];
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
            files = files.concat(await walk(fullPath));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.pdf': return 'application/pdf';
        case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.txt': return 'text/plain';
        default: return null;
    }
}

async function ingest() {
    console.log('🚀 Starting ingestion of NMV Online Content...');

    try {
        const allFiles = await walk(CONTENT_DIR);
        const supportedFiles = allFiles.filter(f => getMimeType(f) !== null);

        console.log(`Found ${supportedFiles.length} supported files out of ${allFiles.length} total files.`);

        for (const filePath of supportedFiles) {
            const filename = path.basename(filePath);
            const mimetype = getMimeType(filePath);

            console.log(`📄 Processing: ${filename}...`);

            try {
                const buffer = fs.readFileSync(filePath);
                const processed = await processDocument(buffer, mimetype, filename);

                const docsToAdd = processed.chunks.map((chunk, index) => ({
                    text: chunk,
                    metadata: {
                        source: filename,
                        fullPath: filePath,
                        mimetype: mimetype,
                        chunkIndex: index,
                        totalChunks: processed.chunks.length,
                        isActive: true // Set to active by default
                    }
                }));

                await vectorStore.addDocuments(docsToAdd);
                console.log(`✅ Added ${processed.chunks.length} chunks from ${filename}`);
            } catch (err) {
                console.error(`❌ Error processing ${filename}:`, err.message);
            }
        }

        console.log('✨ Ingestion complete!');
    } catch (error) {
        console.error('❌ Ingestion failed:', error);
    }
}

ingest();
