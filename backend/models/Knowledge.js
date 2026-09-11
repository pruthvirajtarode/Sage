const mongoose = require('mongoose');

const knowledgeSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    embedding: {
        type: [Number],
        required: true
    },
    metadata: {
        source: String,
        filename: String,
        path: String,
        category: String,
        mimetype: String,
        summary: String,
        chunkIndex: Number,
        totalChunks: Number,
        adminUploaded: { type: Boolean, default: false },
        tenant: String,
        brand: String,
        language: String,
        isActive: {
            type: Boolean,
            default: false
        },
        type: {
            type: String,
            enum: ['file', 'webpage'],
            default: 'file'
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Add index for faster metadata searches
knowledgeSchema.index({ 'metadata.source': 1 });
knowledgeSchema.index({ 'metadata.isActive': 1 });

module.exports = mongoose.model('Knowledge', knowledgeSchema);
