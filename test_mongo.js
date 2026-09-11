require('dotenv').config();
const mongoose = require('mongoose');

async function testConnection() {
    console.log("Connecting to:", process.env.MONGODB_URI);
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log("✅ Successfully connected to MongoDB!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Failed to connect to MongoDB:", err.message);
        process.exit(1);
    }
}

testConnection();
