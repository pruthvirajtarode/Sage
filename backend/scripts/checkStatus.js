const mongoose = require('mongoose');
require('dotenv').config();

async function checkCount() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const Knowledge = mongoose.model('Knowledge', new mongoose.Schema({
            metadata: Object
        }), 'knowledges'); // Direct model creation for check

        const total = await Knowledge.countDocuments();
        const adminUploaded = await Knowledge.countDocuments({ 'metadata.adminUploaded': true });
        const isActive = await Knowledge.countDocuments({ 'metadata.isActive': true });

        console.log(`Total Chunks: ${total}`);
        console.log(`Admin Uploaded Chunks: ${adminUploaded}`);
        console.log(`Active Chunks: ${isActive}`);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkCount();
