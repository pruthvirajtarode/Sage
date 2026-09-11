const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    botName: {
        type: String,
        default: 'MelissAI'
    },
    welcomeMessage: {
        type: String,
        default: "Hi! I'm MelissAI, your business development assistant. How can I help you today?"
    },
    avatarUrl: {
        type: String,
        default: 'images/bot-silhouette.svg'
    },
    // For storing uploaded avatars directly in MongoDB (Base64/Buffer)
    avatarData: {
        type: String, // Store as base64 string
        default: null
    },
    avatarMimeType: {
        type: String,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
