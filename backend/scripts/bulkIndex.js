const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { processDocument } = require('../services/documentProcessor');
const vectorStore = require('../services/vectorStore');
const connectDB = require('../config/db');

const CONTENT_DIR = path.join(__dirname, '../../NMV Online Content');

/**
 * Recursively walk directory and find files
 */
function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            const fileName = path.basename(file);
            const ext = path.extname(file).toLowerCase();
            // Exclude temporary files and hidden system files
            if ((ext === '.docx' || ext === '.pdf' || ext === '.txt' || ext === '.pptx' || ext === '.xlsx' || ext === '.csv') &&
                !fileName.startsWith('~$') && !fileName.startsWith('.')) {
                results.push(file);
            }
        }
    });
    return results;
}

async function bulkIndex() {
    await connectDB();
    console.log('🚀 Starting bulk indexing of NMV Online Content...');

    if (!fs.existsSync(CONTENT_DIR)) {
        console.error(`❌ Content directory not found: ${CONTENT_DIR}`);
        return;
    }

    const files = walk(CONTENT_DIR);
    console.log(`Found ${files.length} supported files to process.`);

    let totalChunks = 0;
    const CONCURRENCY = 10; // Process 10 files at once

    async function processFile(filePath, i) {
        const relativePath = path.relative(CONTENT_DIR, filePath);
        const folderName = path.dirname(relativePath).split(path.sep)[0] || 'Other';
        const fileName = path.basename(filePath);

        console.log(`[${i + 1}/${files.length}] Starting: ${relativePath}`);

        try {
            const buffer = fs.readFileSync(filePath);
            const mimetype = getMimetype(filePath);

            const processed = await processDocument(buffer, mimetype, fileName);

            // Save to OriginalDocument so the "Download" button works for these files too
            const OriginalDocument = require('../models/OriginalDocument');
            await OriginalDocument.findOneAndUpdate(
                { source: relativePath },
                {
                    filename: fileName,
                    mimetype: processed.mimetype,
                    data: buffer,
                    source: relativePath,
                    size: buffer.length
                },
                { upsert: true }
            );

            const docsToAdd = processed.chunks.map((chunk, index) => ({
                text: chunk,
                metadata: {
                    source: relativePath,
                    filename: fileName,
                    path: relativePath,
                    category: folderName,
                    mimetype: processed.mimetype,
                    chunkIndex: index,
                    totalChunks: processed.chunks.length,
                    indexedAt: new Date().toISOString(),
                    isActive: true
                }
            }));

            await vectorStore.addDocuments(docsToAdd);
            console.log(`   ✅ Finished ${fileName} (${processed.chunks.length} chunks)`);
            return processed.chunks.length;

        } catch (error) {
            console.error(`   ❌ Error processing ${fileName}:`, error.message);
            return 0;
        }
    }

    async function asyncPool(poolLimit, array, iteratorFn) {
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

    const chunkCounts = await asyncPool(CONCURRENCY, files, async (filePath, list) => {
        const index = list.indexOf(filePath);
        return await processFile(filePath, index);
    });

    totalChunks = chunkCounts.reduce((sum, c) => sum + c, 0);

    console.log(`\n✨ Bulk indexing complete!`);
    console.log(`Total files processed: ${files.length}`);
    console.log(`Total chunks added: ${totalChunks}`);
}

function getMimetype(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.pdf': return 'application/pdf';
        case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        case '.txt': return 'text/plain';
        default: return 'application/octet-stream';
    }
}

// Ensure vector store is loaded before starting
setTimeout(() => {
    bulkIndex().catch(err => {
        console.error('Fatal error during bulk indexing:', err);
    });
}, 1000);
