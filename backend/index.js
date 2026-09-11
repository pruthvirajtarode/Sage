require('dotenv').config();
console.log('--- MelissAI Deployment 1.3.3 ---');
const express = require('express');
const cors = require('cors');
const path = require('path');
const chatRoutes = require('./routes/chat');

const app = express();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'MelissAI Server Running', version: '1.3.3' });
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
    console.log(`🚀 MelissAI Server running on port ${PORT}`);
    console.log(`📊 Admin dashboard: http://localhost:${PORT}/admin.html`);
    console.log(`💬 Chat interface: http://localhost:${PORT}`);
  });
}

module.exports = app;
