require('dotenv').config();
const mongoose = require('mongoose');
const Settings = require('./backend/models/Settings');

async function fixDatabase() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB.");
        
        await Settings.deleteMany({});
        console.log("Deleted old settings.");
        
        const newSettings = new Settings();
        await newSettings.save();
        console.log("Created new settings with SAGE AI defaults!");
        
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

fixDatabase();
