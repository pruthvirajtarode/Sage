require('dotenv').config();
console.log('--- SAGE AI Deployment 1.3.3 ---');
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const settingsRoutes = require('./routes/settings');
const resourceRoutes = require('./routes/resources');
const generateRoutes = require('./routes/generate');
const productRoutes = require('./routes/products');
const paymentRoutes = require('./routes/payment');
const mongoose = require('mongoose');

const app = express();

// Start DB connection immediately (non-blocking, but tracked)
const dbReady = connectDB();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// ✅ DB-ready guard: wait for MongoDB before handling any API request
// This prevents the "buffering timed out" error on cold starts
app.use('/api', async (req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    return next(); // Already connected — proceed immediately
  }
  try {
    await Promise.race([
      dbReady,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timed out. Please try again.')), 15000)
      )
    ]);
    next();
  } catch (err) {
    console.error('❌ DB guard rejected request:', err.message);
    res.status(503).json({ error: 'Service temporarily unavailable. Database is not ready. Please retry in a moment.' });
  }
});

// API Routes
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/products', productRoutes);
app.use('/api/payment', paymentRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'SAGE AI Server Running', version: '1.3.3' });
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  // Specifically detect Vercel read-only filesystem errors
  const isVercelFsError = process.env.VERCEL && (
    err.code === 'EROFS' ||
    err.message.includes('read-only') ||
    err.message.includes('permission denied')
  );

  res.status(500).json({
    error: isVercelFsError ? 'Vercel filesystem is read-only. Use the "Bot Identity" section to update via URL.' : 'Something went wrong!',
    message: err.message
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 SAGE AI Server running on port ${PORT}`);
    console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin.html`);
    console.log(`💬 Chat interface: http://localhost:${PORT}`);
  });
}

module.exports = app;
