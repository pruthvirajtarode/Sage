const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { processDocument } = require('../services/documentProcessor');
const vectorStore = require('../services/vectorStore');
const Resource = require('../models/Resource');

// Configure multer for file uploads
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: {
        fileSize: 30 * 1024 * 1024 // 30MB limit (increased from 20MB)
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // XLSX
            'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
            'text/plain',
            // Some browsers send these MIME types for office files
            'application/octet-stream',
            'application/msword'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, DOCX, XLSX, PPTX, TXT`));
        }
    }
});

/**
 * POST /api/upload
 * Upload and process document
 */
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            console.warn('⚠️ No file received in upload request');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log(`📥 Received file: ${req.file.originalname} (${req.file.mimetype}), Size: ${req.file.size} bytes`);
        const buffer = req.file.buffer;

        // Process document — extract text, chunk, summarize
        const processed = await processDocument(
            buffer,
            req.file.mimetype,
            req.file.originalname
        );

        // Prepare chunks for vector store
        // isActive: true — admin uploads are trusted and immediately active
        const chunksToAdd = processed.chunks.map((chunk, index) => ({
            text: chunk,
            metadata: {
                source: processed.filename,
                filename: processed.filename,
                mimetype: processed.mimetype,
                summary: processed.summary || '',
                chunkIndex: index,
                totalChunks: processed.chunks.length,
                isActive: true,        // ✅ Auto-approve admin uploads — show immediately
                adminUploaded: true    // ✅ Tag so admin panel shows ONLY these docs
            }
        }));


        // ✅ Store original file binary in MongoDB for download support
        // M10 cluster has 10GB dedicated storage — safe to store originals
        try {
            const OriginalDocument = require('../models/OriginalDocument');
            const existingDoc = await OriginalDocument.findOne({ source: processed.filename });
            if (!existingDoc) {
                await OriginalDocument.create({
                    source: processed.filename,
                    filename: processed.filename,
                    mimetype: processed.mimetype,
                    data: buffer,
                    size: buffer.length
                });
                console.log(`💾 Original file stored in DB: ${processed.filename} (${buffer.length} bytes)`);
            }
        } catch (storageErr) {
            console.warn(`⚠️ Could not store original binary: ${storageErr.message}`);
        }

        // ✅ Create Resource document for resource repository
        try {
            const existingResource = await Resource.findOne({ source: processed.filename });
            if (!existingResource) {
                // Extract file type for categorization
                const fileType = getFileTypeFromMimetype(processed.mimetype);
                
                // Create resource with extracted keywords from content
                const keywords = extractKeywordsFromContent(processed.summary || processed.chunks[0] || '');
                
                await Resource.create({
                    filename: processed.filename,
                    title: processed.filename.replace(/\.[^/.]+$/, ''), // Remove file extension
                    description: processed.summary || 'Uploaded document',
                    mimetype: processed.mimetype,
                    size: buffer.length,
                    data: buffer,
                    category: 'Other', // Default category - can be updated via admin panel
                    keywords: keywords,
                    tags: [fileType],
                    source: 'Admin Upload',
                    uploadedBy: 'admin',
                    isActive: true,
                    isPublic: true
                });
                console.log(`📚 Resource created: ${processed.filename}`);
            }
        } catch (resourceErr) {
            console.warn(`⚠️ Could not create resource: ${resourceErr.message}`);
        }

        // Add text chunks + embeddings to vector store
        await vectorStore.addDocuments(chunksToAdd);

        res.json({
            message: `Document uploaded and active! ${processed.chunks.length} chunks indexed.`,
            filename: processed.filename,
            chunks: processed.chunks.length,
            status: 'active'
        });


    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            error: 'Failed to process document',
            message: error.message || 'Unknown error occurred during processing'
        });
    }
});


/**
 * POST /api/upload/url
 * Process web page(s) from URL(s)
 */
router.post('/url', async (req, res) => {
    try {
        const { url, urls, autoApprove } = req.body;

        // Handle both single url and list of urls
        let urlList = [];
        if (urls && Array.isArray(urls)) {
            urlList = urls;
        } else if (url) {
            urlList = [url];
        }

        if (urlList.length === 0) {
            return res.status(400).json({ error: 'URL(s) required' });
        }

        const { scrapeWebPage, chunkText, summarizeDocument } = require('../services/documentProcessor');

        const results = [];
        const errors = [];

        for (const targetUrl of urlList) {
            try {
                if (!targetUrl.trim()) continue;

                console.log(`🌐 Processing URL: ${targetUrl}`);
                const text = await scrapeWebPage(targetUrl);
                const chunks = chunkText(text);
                const summary = await summarizeDocument(text);

                // Prepare chunks for bulk addition
                const chunksToAdd = chunks.map((chunk, index) => ({
                    text: chunk,
                    metadata: {
                        source: targetUrl,
                        type: 'webpage',
                        summary: summary,
                        chunkIndex: index,
                        totalChunks: chunks.length,
                        isActive: autoApprove === true || autoApprove === 'true', // Use flag if provided
                        adminUploaded: true
                    }
                }));

                // Add documents in bulk
                await vectorStore.addDocuments(chunksToAdd);
                results.push({ url: targetUrl, chunks: chunks.length });
            } catch (err) {
                console.error(`❌ Error processing ${targetUrl}:`, err.message);
                errors.push({ url: targetUrl, error: err.message });
            }
        }

        if (results.length === 0 && errors.length > 0) {
            return res.status(500).json({
                error: 'Failed to process any URLs',
                details: errors
            });
        }

        res.json({
            message: results.length === 1 && errors.length === 0
                ? 'Web page processed successfully'
                : `Processed ${results.length} URLs with ${errors.length} errors`,
            results,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('URL processing error:', error);
        res.status(500).json({
            error: 'Failed to process URLs',
            message: error.message
        });
    }
});

// ─── Utility Functions ────────────────────────────────────────────────────────

function getFileTypeFromMimetype(mimetype) {
    if (mimetype.includes('pdf')) return 'PDF';
    if (mimetype.includes('spreadsheet') || mimetype.includes('sheet')) return 'Excel';
    if (mimetype.includes('presentation')) return 'PowerPoint';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'Word';
    return 'Document';
}

function extractKeywordsFromContent(content) {
    if (!content) return [];
    
    const commonWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
        'is', 'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'should', 'could', 'what', 'how', 'why', 'when', 'where', 'who',
        'that', 'this', 'these', 'those', 'can', 'need', 'want', 'your', 'our', 'their'
    ]);

    const words = content
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 4 && !commonWords.has(word))
        .slice(0, 10);

    return [...new Set(words)]; // Remove duplicates
}

module.exports = router;
