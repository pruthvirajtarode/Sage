const mongoose = require('mongoose');

let _connectionPromise = null;

const connectDB = async () => {
    if (_connectionPromise) return _connectionPromise; // reuse existing connection promise

    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) {
        console.error('❌ MongoDB URI not found in environment variables');
        console.error('   Please set MONGODB_URI in your .env.server file');
        console.error('   Example: MONGODB_URI=mongodb://localhost:27017/melissa_ai');
        console.error('   Or: MONGODB_URI=mongodb://username:password@localhost:27017/melissa_ai?authSource=admin');
        return;
    }

    _connectionPromise = mongoose.connect(uri, {
        minPoolSize: 2,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 30000, // Wait up to 30s for Atlas to respond
        socketTimeoutMS: 60000,          // Allow longer operations (large insertMany)
        // Note: bufferCommands is intentionally left as default (true)
        // The DB-ready guard in index.js handles connection timing for all /api routes
    }).then(conn => {
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        return conn;
    }).catch(error => {
        console.error(`❌ MongoDB connection error: ${error.message}`);
        console.error('   Server: ' + (uri.split('@')[1] ? uri.split('@')[1].split('/')[0] : uri));
        console.error('   Troubleshooting:');
        console.error('   1. Is MongoDB running? (mongod or docker container)');
        console.error('   2. Is the connection string correct in .env.server?');
        console.error('   3. Check credentials: MONGO_ROOT_USERNAME and MONGO_ROOT_PASSWORD');
        console.error('   4. PDFs will not be generated without MongoDB - other features work');
        _connectionPromise = null; // allow retry on next request
        if (!process.env.VERCEL) {
            // Don't exit on dev - allow fallback for other features
            // process.exit(1);
        }
        throw error;
    });

    return _connectionPromise;
};

module.exports = connectDB;
