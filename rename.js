const fs = require('fs');
const path = require('path');

const filesToUpdate = [
    'frontend/manifest.json',
    'frontend/demo.html',
    'frontend/EMBED_GUIDE.md',
    'package.json',
    'data/settings.json',
    'backend/index.js',
    'backend/services/documentGenerator.js',
    'backend/routes/chat.js',
    'backend/config/db.js',
    'scripts/setup-ssl.sh'
];

filesToUpdate.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        content = content.replace(/Melissa AI/gi, 'SAGE AI');
        content = content.replace(/MelissAI/gi, 'SAGE AI');
        content = content.replace(/melissa_ai/gi, 'sage_ai');
        content = content.replace(/melissa-ai/gi, 'sage-ai');
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${file}`);
    }
});
