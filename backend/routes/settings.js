const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const Settings = require('../models/Settings');

// Simple authentication middleware
const authenticateAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Use memory storage for MongoDB
const storage = multer.memoryStorage();
const uploadAvatar = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|svg|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Only images allowed'));
    }
});

/**
 * GET /api/settings
 * Publicly accessible settings
 */
router.get('/', async (req, res) => {
    try {
        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings();
            await settings.save();
        }

        // If there's base64 data, we can either serve it directly or just return the URL
        // To keep the frontend working, if we have base64, we'll return that as the URL
        const settingsObj = settings.toObject();
        if (settings.avatarData) {
            settingsObj.avatarUrl = `data:${settings.avatarMimeType};base64,${settings.avatarData}`;
        }

        res.json(settingsObj);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

/**
 * POST /api/settings/avatar
 * Upload new avatar to MongoDB (Requires Admin)
 */
router.post('/avatar', authenticateAdmin, (req, res, next) => {
    uploadAvatar.single('avatar')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        let settings = await Settings.findOne();
        if (!settings) settings = new Settings();

        // Convert buffer to base64
        const base64Data = req.file.buffer.toString('base64');

        settings.avatarData = base64Data;
        settings.avatarMimeType = req.file.mimetype;
        settings.avatarUrl = `data:${req.file.mimetype};base64,${base64Data}`;

        await settings.save();

        res.json({
            message: 'Avatar updated and saved to database',
            avatarUrl: settings.avatarUrl
        });
    } catch (error) {
        console.error('Avatar DB upload error:', error);
        res.status(500).json({ error: 'Failed to save avatar to database' });
    }
});

/**
 * POST /api/settings/update
 * Update general settings (Requires Admin)
 */
router.post('/update', authenticateAdmin, async (req, res) => {
    try {
        const { botName, welcomeMessage, avatarUrl } = req.body;
        let settings = await Settings.findOne();
        if (!settings) settings = new Settings();

        if (botName) settings.botName = botName;
        if (welcomeMessage) settings.welcomeMessage = welcomeMessage;

        // If user provides a direct URL, clear the saved data
        if (avatarUrl) {
            settings.avatarUrl = avatarUrl;
            if (avatarUrl.startsWith('data:')) {
                // If it's a data URL, extract the base64 data to keep it persistent
                const matches = avatarUrl.match(/^data:([^;]+);base64,(.+)$/);
                if (matches) {
                    settings.avatarMimeType = matches[1];
                    settings.avatarData = matches[2];
                }
            } else {
                // If it's a standard link (images/...), clear the base64 data
                settings.avatarData = null;
                settings.avatarMimeType = null;
            }
        }

        await settings.save();

        const settingsObj = settings.toObject();
        if (settings.avatarData) {
            settingsObj.avatarUrl = `data:${settings.avatarMimeType};base64,${settings.avatarData}`;
        }

        res.json({ message: 'Saved successfully', settings: settingsObj });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

module.exports = router;
