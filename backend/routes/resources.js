const express = require('express');
const router = express.Router();
const Resource = require('../models/Resource');

/**
 * GET /api/resources
 * Fetch all active resources, optionally filtered by category or search term
 */
router.get('/', async (req, res) => {
    try {
        const { category, search, limit = 50, skip = 0 } = req.query;

        let query = { isActive: true, isPublic: true };

        // Filter by category if provided
        if (category) {
            query.category = category;
        }

        // Full-text search if search term provided
        if (search) {
            query.$text = { $search: search };
        }

        const resources = await Resource.find(query)
            .select('-data') // Exclude binary data for list endpoint
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        const total = await Resource.countDocuments(query);

        res.json({
            success: true,
            count: resources.length,
            total,
            resources: resources.map(r => ({
                id: r._id,
                filename: r.filename,
                title: r.title,
                description: r.description,
                category: r.category,
                keywords: r.keywords,
                tags: r.tags,
                mimetype: r.mimetype,
                size: r.size,
                createdAt: r.createdAt,
                fileType: getFileType(r.mimetype)
            }))
        });
    } catch (error) {
        console.error('Resource list error:', error);
        res.status(500).json({ error: 'Failed to fetch resources', message: error.message });
    }
});

/**
 * GET /api/resources/category/:category
 * Fetch resources by category
 */
router.get('/category/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const { limit = 20, skip = 0 } = req.query;

        const resources = await Resource.find({ category, isActive: true, isPublic: true })
            .select('-data')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        res.json({
            success: true,
            category,
            count: resources.length,
            resources: resources.map(r => ({
                id: r._id,
                filename: r.filename,
                title: r.title,
                description: r.description,
                category: r.category,
                keywords: r.keywords,
                tags: r.tags,
                mimetype: r.mimetype,
                size: r.size,
                fileType: getFileType(r.mimetype)
            }))
        });
    } catch (error) {
        console.error('Category fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch resources by category', message: error.message });
    }
});

/**
 * GET /api/resources/search
 * Search resources by keywords or title
 */
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const { limit = 10, skip = 0 } = req.query;

        // Search by keywords array or text search
        const resources = await Resource.find({
            $or: [
                { keywords: { $in: [new RegExp(query, 'i')] } },
                { title: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } },
                { tags: { $in: [new RegExp(query, 'i')] } }
            ],
            isActive: true,
            isPublic: true
        })
            .select('-data')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(parseInt(skip));

        res.json({
            success: true,
            query,
            count: resources.length,
            resources: resources.map(r => ({
                id: r._id,
                filename: r.filename,
                title: r.title,
                description: r.description,
                category: r.category,
                keywords: r.keywords,
                tags: r.tags,
                mimetype: r.mimetype,
                size: r.size,
                fileType: getFileType(r.mimetype)
            }))
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to search resources', message: error.message });
    }
});

/**
 * GET /api/resources/stats/categories
 * Get count of resources by category
 * IMPORTANT: Must come before /:id route
 */
router.get('/stats/categories', async (req, res) => {
    try {
        const stats = await Resource.aggregate([
            { $match: { isActive: true, isPublic: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics', message: error.message });
    }
});

/**
 * GET /api/resources/:id/download
 * Download a resource file
 * IMPORTANT: This route MUST come before the generic /:id route
 */
router.get('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;

        const resource = await Resource.findById(id);

        if (!resource) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        if (!resource.isActive || !resource.isPublic) {
            return res.status(403).json({ error: 'Resource not accessible' });
        }

        // Set response headers for file download
        res.setHeader('Content-Type', resource.mimetype);
        res.setHeader('Content-Disposition', `attachment; filename="${resource.filename}"`);
        res.setHeader('Content-Length', resource.data.length);

        // Send binary data
        res.send(resource.data);

        console.log(`📥 Resource downloaded: ${resource.filename} (${resource.size} bytes)`);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: 'Failed to download resource', message: error.message });
    }
});

/**
 * GET /api/resources/:id
 * Fetch a single resource metadata (without binary data)
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const resource = await Resource.findById(id).select('-data');

        if (!resource) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        if (!resource.isActive || !resource.isPublic) {
            return res.status(403).json({ error: 'Resource not accessible' });
        }

        res.json({
            success: true,
            resource: {
                id: resource._id,
                filename: resource.filename,
                title: resource.title,
                description: resource.description,
                category: resource.category,
                keywords: resource.keywords,
                tags: resource.tags,
                mimetype: resource.mimetype,
                size: resource.size,
                fileType: getFileType(resource.mimetype),
                createdAt: resource.createdAt
            }
        });
    } catch (error) {
        console.error('Resource fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch resource', message: error.message });
    }
});

/**
 * POST /api/resources/suggest
 * Suggest resources based on chat message/context
 */
router.post('/suggest', async (req, res) => {
    try {
        const { message, keywords = [], category = null, limit = 5 } = req.body;

        if (!message && keywords.length === 0) {
            return res.status(400).json({ error: 'Message or keywords required' });
        }

        let query = { isActive: true, isPublic: true };

        // If category specified, filter by it
        if (category) {
            query.category = category;
        }

        // Search by keywords or text
        let searchQuery;
        if (keywords.length > 0) {
            searchQuery = {
                ...query,
                $or: [
                    { keywords: { $in: keywords } },
                    { tags: { $in: keywords } }
                ]
            };
        } else if (message) {
            const messageKeywords = extractKeywords(message);
            searchQuery = {
                ...query,
                $or: [
                    { keywords: { $in: messageKeywords } },
                    { title: { $regex: messageKeywords.join('|'), $options: 'i' } },
                    { tags: { $in: messageKeywords } }
                ]
            };
        }

        const resources = await Resource.find(searchQuery)
            .select('-data')
            .limit(parseInt(limit));

        res.json({
            success: true,
            count: resources.length,
            resources: resources.map(r => ({
                id: r._id,
                filename: r.filename,
                title: r.title,
                description: r.description,
                category: r.category,
                keywords: r.keywords,
                tags: r.tags,
                mimetype: r.mimetype,
                size: r.size,
                fileType: getFileType(r.mimetype)
            }))
        });
    } catch (error) {
        console.error('Suggestion error:', error);
        res.status(500).json({ error: 'Failed to suggest resources', message: error.message });
    }
});

// ─── Utility functions ───────────────────────────────────────────────────────
function getFileType(mimetype) {
    if (mimetype.includes('pdf')) return 'PDF';
    if (mimetype.includes('spreadsheet') || mimetype.includes('sheet')) return 'Excel';
    if (mimetype.includes('presentation')) return 'PowerPoint';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'Word';
    return 'Document';
}

function extractKeywords(message) {
    // Simple keyword extraction - split by spaces and remove common words
    const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'what', 'how', 'why', 'when', 'where', 'who', 'that', 'this', 'these', 'those']);
    
    return message
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3 && !commonWords.has(word))
        .slice(0, 5); // Limit to 5 keywords
}

module.exports = router;
