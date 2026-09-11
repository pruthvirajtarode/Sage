require('dotenv').config({ path: './.env' });
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function test() {
    try {
        console.log("Testing OpenAI completion...");
        const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: 'Test message' }],
            temperature: 0.1,
            max_tokens: 300,
            top_p: 0.9,
            stream: true,
        });

        for await (const chunk of stream) {
            process.stdout.write(chunk.choices[0]?.delta?.content || '');
        }
        console.log("\nDone!");
    } catch (err) {
        console.error("OpenAI Error:", err.message);
        console.error(err);
    }
}

test();
