const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    botName: {
        type: String,
        default: 'SAGE AI'
    },
    welcomeMessage: {
        type: String,
        default: "你好！我是 SAGE AI，YAS Shoe Care 的专属商务助手。有什么我可以帮您的吗？"
    },
    avatarUrl: {
        type: String,
        default: 'images/sage_avatar.png'
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
