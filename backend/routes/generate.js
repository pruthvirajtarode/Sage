const express = require('express');
const router = express.Router();
const {
    generatePDF,
    generatePowerPoint,
    compileDocumentSections
} = require('../services/documentGenerator');
const Resource = require('../models/Resource');

/**
 * POST /api/generate/pdf
 * Generate and save a PDF document based on chat response
 */
router.post('/pdf', async (req, res) => {
    try {
        const { topic, response, format = 'pdf' } = req.body;

        if (!topic || !response) {
            return res.status(400).json({
                error: 'Missing required fields: topic, response'
            });
        }

        // Compile content sections
        const { pdfSections } = compileDocumentSections(topic, response);

        // Generate PDF
        const pdfBuffer = await generatePDF(
            'Business Development Guide',
            topic,
            pdfSections
        );

        // Create filename
        const filename = `${topic.replace(/\s+/g, '_')}_${Date.now()}.pdf`;

        // Save to MongoDB as Resource
        const resource = new Resource({
            filename: filename,
            title: `${topic} - Comprehensive Guide`,
            description: `AI-generated guide on ${topic} based on NMV frameworks`,
            category: 'PDF',
            keywords: topic.split(' ').filter(word => word.length > 3),
            tags: ['AI-Generated', 'Guide', 'PDF'],
            mimetype: 'application/pdf',
            size: pdfBuffer.length,
            data: pdfBuffer,
            isActive: true,
            isPublic: true
        });

        const savedResource = await resource.save();

        res.json({
            success: true,
            message: 'PDF generated successfully',
            resourceId: savedResource._id,
            filename: filename,
            size: pdfBuffer.length,
            downloadUrl: `/api/resources/${savedResource._id}/download`
        });
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({
            error: 'Failed to generate PDF',
            message: error.message
        });
    }
});

/**
 * POST /api/generate/ppt
 * Generate and save a PowerPoint presentation based on chat response
 */
router.post('/ppt', async (req, res) => {
    try {
        const { topic, response } = req.body;

        if (!topic || !response) {
            return res.status(400).json({
                error: 'Missing required fields: topic, response'
            });
        }

        // Compile content sections
        const { powerPointSlides } = compileDocumentSections(topic, response);

        // Generate PowerPoint
        const pptBuffer = await generatePowerPoint(
            'Business Development Strategy',
            topic,
            powerPointSlides
        );

        // Create filename
        const filename = `${topic.replace(/\s+/g, '_')}_${Date.now()}.pptx`;

        // Save to MongoDB as Resource
        const resource = new Resource({
            filename: filename,
            title: `${topic} - Presentation`,
            description: `AI-generated PowerPoint presentation on ${topic}`,
            category: 'PowerPoint',
            keywords: topic.split(' ').filter(word => word.length > 3),
            tags: ['AI-Generated', 'Presentation', 'PowerPoint'],
            mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            size: pptBuffer.length,
            data: pptBuffer,
            isActive: true,
            isPublic: true
        });

        const savedResource = await resource.save();

        res.json({
            success: true,
            message: 'PowerPoint generated successfully',
            resourceId: savedResource._id,
            filename: filename,
            size: pptBuffer.length,
            downloadUrl: `/api/resources/${savedResource._id}/download`
        });
    } catch (error) {
        console.error('PowerPoint generation error:', error);
        res.status(500).json({
            error: 'Failed to generate PowerPoint',
            message: error.message
        });
    }
});

/**
 * POST /api/generate/both
 * Generate both PDF and PowerPoint from chat response
 */
router.post('/both', async (req, res) => {
    try {
        const { topic, response } = req.body;

        if (!topic || !response) {
            return res.status(400).json({
                error: 'Missing required fields: topic, response'
            });
        }

        // Compile content sections
        const { pdfSections, powerPointSlides } = compileDocumentSections(topic, response);

        // Generate both formats in parallel
        const [pdfBuffer, pptBuffer] = await Promise.all([
            generatePDF('Business Development Guide', topic, pdfSections),
            generatePowerPoint('Business Development Strategy', topic, powerPointSlides)
        ]);

        // Create filenames
        const timestamp = Date.now();
        const pdfFilename = `${topic.replace(/\s+/g, '_')}_${timestamp}.pdf`;
        const pptFilename = `${topic.replace(/\s+/g, '_')}_${timestamp}.pptx`;

        // Save both to MongoDB as Resources
        const [pdfResource, pptResource] = await Promise.all([
            new Resource({
                filename: pdfFilename,
                title: `${topic} - Comprehensive Guide`,
                description: `AI-generated guide on ${topic}`,
                category: 'PDF',
                keywords: topic.split(' ').filter(word => word.length > 3),
                tags: ['AI-Generated', 'Guide'],
                mimetype: 'application/pdf',
                size: pdfBuffer.length,
                data: pdfBuffer,
                isActive: true,
                isPublic: true
            }).save(),
            new Resource({
                filename: pptFilename,
                title: `${topic} - Presentation`,
                description: `AI-generated presentation on ${topic}`,
                category: 'PowerPoint',
                keywords: topic.split(' ').filter(word => word.length > 3),
                tags: ['AI-Generated', 'Presentation'],
                mimetype: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                size: pptBuffer.length,
                data: pptBuffer,
                isActive: true,
                isPublic: true
            }).save()
        ]);

        res.json({
            success: true,
            message: 'PDF and PowerPoint generated successfully',
            documents: [
                {
                    format: 'PDF',
                    resourceId: pdfResource._id,
                    filename: pdfFilename,
                    size: pdfBuffer.length,
                    downloadUrl: `/api/resources/${pdfResource._id}/download`
                },
                {
                    format: 'PowerPoint',
                    resourceId: pptResource._id,
                    filename: pptFilename,
                    size: pptBuffer.length,
                    downloadUrl: `/api/resources/${pptResource._id}/download`
                }
            ]
        });
    } catch (error) {
        console.error('Document generation error:', error);
        res.status(500).json({
            error: 'Failed to generate documents',
            message: error.message
        });
    }
});

module.exports = router;
