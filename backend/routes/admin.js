const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const vectorStore = require('../services/vectorStore');
const { SYSTEM_PROMPT } = require('../services/openai');
const Knowledge = require('../models/Knowledge');

// Simple authentication middleware
const authenticateAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key_for_sage');
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

/**
 * POST /api/admin/login
 * Admin login
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Use environment variables or fallback to default credentials if not set
        const validUser = process.env.ADMIN_USERNAME || 'admin';
        const validPass = process.env.ADMIN_PASSWORD || 'admin123';

        if (username === validUser && password === validPass) {
            const token = jwt.sign(
                { username },
                process.env.JWT_SECRET || 'fallback_secret_key_for_sage',
                { expiresIn: '24h' }
            );

            res.json({ token, username });
        } else {
            res.status(401).json({ error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * GET /api/admin/documents
 * Get all documents
 */
router.get('/documents', authenticateAdmin, async (req, res) => {
    try {
        const documents = await vectorStore.getGroupedDocuments();
        res.json({ documents });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

/**
 * POST /api/admin/document/approve
 * Approve/Activate document
 */
router.post('/document/approve', authenticateAdmin, async (req, res) => {
    try {
        const { source } = req.body;
        if (!source) return res.status(400).json({ error: 'Source is required' });

        const count = await vectorStore.approveBySource(source);
        res.json({ message: 'Document approved and added to chatbot knowledge', chunksActivated: count });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Failed to approve document' });
    }
});

/**
 * POST /api/admin/document/deactivate
 * Deactivate/Exclude document
 */
router.post('/document/deactivate', authenticateAdmin, async (req, res) => {
    try {
        const { source } = req.body;
        if (!source) return res.status(400).json({ error: 'Source is required' });

        const count = await vectorStore.deactivateBySource(source);
        res.json({ message: 'Document deactivated and removed from chatbot knowledge', chunksDeactivated: count });
    } catch (error) {
        console.error('Deactivate error:', error);
        res.status(500).json({ error: 'Failed to deactivate document' });
    }
});

/**
 * DELETE /api/admin/document/:id
 * Delete document
 */
router.delete('/document/source', authenticateAdmin, async (req, res) => {
    try {
        const { source } = req.query;
        if (!source) return res.status(400).json({ error: 'Source is required' });

        const count = await vectorStore.deleteBySource(source);
        res.json({ message: 'Document deleted successfully', chunksDeleted: count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete document' });
    }
});

/**
 * GET /api/admin/document/download
 * Download original document
 */
router.get('/document/download', authenticateAdmin, async (req, res) => {
    try {
        const { source } = req.query;
        if (!source) return res.status(400).json({ error: 'Source is required' });

        const OriginalDocument = require('../models/OriginalDocument');

        console.log(`📥 Download requested for source: "${source}"`);

        let doc = await OriginalDocument.findOne({ source });

        // Fallback: If source included a folder path, OriginalDocument might only have the basename
        if (!doc) {
            const basename = source.split(/[\\/]/).pop();
            doc = await OriginalDocument.findOne({
                $or: [
                    { filename: basename },
                    { source: basename }
                ]
            });
        }

        if (!doc) {
            console.warn(`⚠️ No original file stored for: "${source}" — was it purged or not uploaded via admin panel?`);
            return res.status(404).json({
                error: 'Original file not found. The file binary was either purged to free DB space, or this document was indexed without saving the original. Please re-upload the document.'
            });
        }

        if (!doc.data || doc.data.length === 0) {
            console.warn(`⚠️ Document found but binary data is empty for: "${source}"`);
            return res.status(404).json({
                error: 'File data is empty. Please re-upload the document.'
            });
        }

        // Sanitize filename to prevent header injection
        const safeFilename = (doc.filename || source.split('/').pop() || 'download').replace(/["\r\n]/g, '_');

        console.log(`✅ Serving download: "${safeFilename}" (${doc.data.length} bytes, ${doc.mimetype})`);

        res.set({
            'Content-Type': doc.mimetype || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${safeFilename}"`,
            'Content-Length': doc.data.length
        });

        res.send(doc.data);
    } catch (error) {
        console.error('❌ Download route error:', error.message, error.stack);
        res.status(500).json({ error: `Download failed: ${error.message}` });
    }
});

/**
 * POST /api/admin/reindex
 * Re-index all documents
 */
router.post('/reindex', authenticateAdmin, async (req, res) => {
    try {
        await vectorStore.reindex();
        res.json({ message: 'Re-indexing completed successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Re-indexing failed' });
    }
});



/**
 * GET /api/admin/analytics
 * Get usage analytics from MongoDB
 */
router.get('/analytics', authenticateAdmin, async (req, res) => {
    try {
        const grouped = await vectorStore.getGroupedDocuments();
        const totalChunks = await Knowledge.countDocuments();

        const analytics = {
            totalDocuments: grouped.length,
            totalChunks: totalChunks,
            storageSize: totalChunks * 1024,
        };

        res.json(analytics);
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * GET /api/admin/data-summary
 * Get a breakdown of documents by type and status for the admin listing header
 */
router.get('/data-summary', authenticateAdmin, async (req, res) => {
    try {
        const grouped = await vectorStore.getGroupedDocuments();

        const typeCounts = {};
        let activeCount = 0;
        let pendingCount = 0;

        grouped.forEach(doc => {
            const mime = (doc.mimetype || '').toLowerCase();
            let type = 'Other';
            if (doc.source && typeof doc.source === 'string' && doc.source.startsWith('http')) {
                type = 'Web';
            } else if (mime.includes('pdf')) {
                type = 'PDF';
            } else if (mime.includes('word') || mime.includes('docx')) {
                type = 'Word';
            } else if (mime.includes('sheet') || mime.includes('xlsx')) {
                type = 'Excel';
            } else if (mime.includes('presentation') || mime.includes('pptx')) {
                type = 'PowerPoint';
            } else if (mime.includes('text')) {
                type = 'Text';
            }
            typeCounts[type] = (typeCounts[type] || 0) + 1;
            if (doc.isActive) activeCount++;
            else pendingCount++;
        });

        res.json({ total: grouped.length, activeCount, pendingCount, byType: typeCounts });
    } catch (error) {
        console.error('Data summary error:', error);
        res.status(500).json({ error: 'Failed to fetch data summary' });
    }
});


/**
 * GET /api/admin/system-prompt
 * Get system prompt
 */
router.get('/system-prompt', authenticateAdmin, (req, res) => {
    res.json({ systemPrompt: SYSTEM_PROMPT });
});

/**
 * DELETE /api/admin/clear-all
 * Clear all documents
 */
router.delete('/clear-all', authenticateAdmin, async (req, res) => {
    try {
        await vectorStore.clearAll();
        res.json({ message: 'All documents cleared' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear documents' });
    }
});

/**
 * DELETE /api/admin/purge-originals
 * Delete all stored original document binaries to free MongoDB space.
 * This does NOT delete the Knowledge chunks — the chatbot continues to work.
 */
router.delete('/purge-originals', authenticateAdmin, async (req, res) => {
    try {
        const OriginalDocument = require('../models/OriginalDocument');
        const result = await OriginalDocument.deleteMany({});
        console.log(`🗑️ Purged ${result.deletedCount} original document binaries to free storage`);
        res.json({
            message: `Storage freed! Deleted ${result.deletedCount} stored file binaries from database.`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Purge originals error:', error);
        res.status(500).json({ error: 'Failed to purge original documents' });
    }
});

// ─── Resource Management Routes ─────────────────────────────────────────────────

/**
 * GET /api/admin/resources
 * Get all resources for management
 */
router.get('/resources', authenticateAdmin, async (req, res) => {
    try {
        const Resource = require('../models/Resource');
        const resources = await Resource.find({})
            .select('-data')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            count: resources.length,
            resources: resources.map(r => ({
                id: r._id,
                filename: r.filename,
                title: r.title,
                category: r.category,
                keywords: r.keywords,
                tags: r.tags,
                isActive: r.isActive,
                isPublic: r.isPublic,
                size: r.size,
                createdAt: r.createdAt
            }))
        });
    } catch (error) {
        console.error('Resource list error:', error);
        res.status(500).json({ error: 'Failed to fetch resources', message: error.message });
    }
});

/**
 * PUT /api/admin/resources/:id
 * Update resource metadata
 */
router.put('/resources/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, category, keywords, tags, isActive, isPublic } = req.body;

        const Resource = require('../models/Resource');
        const resource = await Resource.findByIdAndUpdate(
            id,
            {
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(category && { category }),
                ...(keywords && { keywords }),
                ...(tags && { tags }),
                ...(isActive !== undefined && { isActive }),
                ...(isPublic !== undefined && { isPublic }),
                updatedAt: new Date()
            },
            { new: true }
        ).select('-data');

        if (!resource) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        res.json({
            success: true,
            message: 'Resource updated successfully',
            resource: {
                id: resource._id,
                filename: resource.filename,
                title: resource.title,
                category: resource.category,
                keywords: resource.keywords,
                tags: resource.tags,
                isActive: resource.isActive,
                isPublic: resource.isPublic
            }
        });
    } catch (error) {
        console.error('Resource update error:', error);
        res.status(500).json({ error: 'Failed to update resource', message: error.message });
    }
});

/**
 * DELETE /api/admin/resources/:id
 * Delete a resource
 */
router.delete('/resources/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;

        const Resource = require('../models/Resource');
        const result = await Resource.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        res.json({
            success: true,
            message: 'Resource deleted successfully',
            filename: result.filename
        });
    } catch (error) {
        console.error('Resource delete error:', error);
        res.status(500).json({ error: 'Failed to delete resource', message: error.message });
    }
});

/**
 * POST /api/admin/resources/activate-all
 * Activate all resources
 */
router.post('/resources/activate-all', authenticateAdmin, async (req, res) => {
    try {
        const Resource = require('../models/Resource');
        const result = await Resource.updateMany({}, { isActive: true });

        res.json({
            success: true,
            message: `Activated ${result.modifiedCount} resources`
        });
    } catch (error) {
        console.error('Activate all error:', error);
        res.status(500).json({ error: 'Failed to activate resources', message: error.message });
    }
});

module.exports = router;
