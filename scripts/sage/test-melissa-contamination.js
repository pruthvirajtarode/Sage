const vectorStore = require('../../backend/services/vectorStore');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

async function testContamination() {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(process.env.MONGODB_URI);

        const testQuestions = [
            "What is MelissAI?",
            "Can you tell me about New Majority Ventures?",
            "What is the Accelerate track?",
            "Who is Melissa?",
            "How does NMV work?"
        ];

        let hasContamination = false;

        for (const q of testQuestions) {
            console.log(`\nTesting Query: "${q}"`);
            const results = await vectorStore.search(q);
            console.log(`Found ${results.length} relevant chunks.`);
            
            if (results.length > 0) {
                // Check if any returned chunks contain 'Melissa' or 'NMV' explicitly
                const hasForbiddenWords = results.some(r => {
                    const textLower = r.text.toLowerCase();
                    return textLower.includes('melissa') || textLower.includes('nmv') || textLower.includes('new majority');
                });

                if (hasForbiddenWords) {
                    console.log('⚠️ CONTAMINATION DETECTED! Found legacy keywords in chunks.');
                    hasContamination = true;
                } else {
                    console.log('Chunks returned, but no direct contamination keywords found.');
                }
            } else {
                console.log('No chunks found (Clean).');
            }
        }

        if (!hasContamination) {
            console.log('\n✅ Contamination test passed. SAGE AI is clean.');
        } else {
            console.log('\n❌ Contamination test failed. Legacy data is still bleeding through.');
        }

    } catch (e) {
        console.error('Test error:', e);
    } finally {
        await mongoose.disconnect();
    }
}

testContamination();
