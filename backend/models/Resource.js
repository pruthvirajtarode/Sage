const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    mimetype: {
        type: String,
        required: true,
        enum: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
    },
    size: {
        type: Number,
        required: true
    },
    data: {
        type: Buffer,
        required: true
    },
    // Resource categorization and searchability
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        default: ''
    },
    category: {
        type: String,
        enum: ['Strategy', 'Sales', 'Marketing', 'Operations', 'Finance', 'HR', 'Technology', 'Training', 'Templates', 'Case Studies', 'Tools', 'Other'],
        default: 'Other'
    },
    keywords: {
        type: [String],
        default: []
    },
    tags: {
        type: [String],
        default: []
    },
    // Track resource usage and relevance
    relevantQuestions: {
        type: [String],
        default: []
    },
    // Availability and permissions
    isActive: {
        type: Boolean,
        default: true
    },
    isPublic: {
        type: Boolean,
        default: true
    },
    // Metadata
    source: {
        type: String,
        default: 'Admin Upload'
    },
    uploadedBy: {
        type: String,
        default: 'admin'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Add indexes for faster searches
resourceSchema.index({ category: 1, isActive: 1 });
resourceSchema.index({ keywords: 1 });
resourceSchema.index({ tags: 1 });
resourceSchema.index({ title: 'text', description: 'text', keywords: 'text' });
resourceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Resource', resourceSchema);
