const mongoose = require('mongoose');
const Knowledge = require('../../backend/models/Knowledge');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

async function cleanLegacyDb() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB.');

        console.log('Identifying legacy Melissa AI data...');
        // We will remove all documents that DO NOT have tenant = "sage"
        const count = await Knowledge.countDocuments({ 'metadata.tenant': { $ne: 'sage' } });
        console.log(`Found ${count} legacy knowledge chunks.`);

        if (count > 0) {
            console.log('Deleting legacy knowledge chunks...');
            await Knowledge.deleteMany({ 'metadata.tenant': { $ne: 'sage' } });
            console.log('Legacy knowledge chunks deleted successfully.');
        } else {
            console.log('No legacy knowledge chunks found.');
        }
        
    } catch (error) {
        console.error('Error during database cleanup:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

cleanLegacyDb();
