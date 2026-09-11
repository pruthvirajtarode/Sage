const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const BASE_URL = 'https://www.yasshoescare.com';
const OUTPUT_DIR = path.join(__dirname, 'knowledge-base', 'website-content');
const VISITED = new Set();
const TO_VISIT = [BASE_URL];
const ALL_DOCUMENTS = [];

async function extractTextFromPage(page, url) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Auto-scroll to load lazy content
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;
                if(totalHeight >= scrollHeight){
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });

    const html = await page.content();
    const $ = cheerio.load(html);

    // Extract links
    const newLinks = [];
    $('a').each((i, el) => {
        let href = $(el).attr('href');
        if (href) {
            if (href.startsWith('/')) {
                href = BASE_URL + href;
            }
            // Add if it's within domain and not visited
            if (href.startsWith(BASE_URL) && !VISITED.has(href) && !TO_VISIT.includes(href) && !href.includes('#')) {
                newLinks.push(href);
            }
        }
    });

    // Remove scripts, styles, nav, headers, footers for cleaner content
    $('script, style, nav, footer, header').remove();

    const textContent = $('body').text().replace(/\s+/g, ' ').trim();
    const title = $('title').text() || url.split('/').pop() || 'Homepage';

    return { title, content: textContent, newLinks, url };
}

async function crawl() {
    console.log('Starting crawler for:', BASE_URL);
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    // Try up to 15 internal pages
    let limit = 15;
    
    while (TO_VISIT.length > 0 && limit > 0) {
        const url = TO_VISIT.shift();
        if (VISITED.has(url)) continue;
        
        console.log(`Crawling (${limit} left): ${url}`);
        VISITED.add(url);
        limit--;

        try {
            const data = await extractTextFromPage(page, url);
            
            TO_VISIT.push(...data.newLinks);
            
            if (data.content.length > 100) {
                const doc = {
                    source: "YAS Shoe Care",
                    source_url: data.url,
                    language: "zh-CN", // assuming Chinese first
                    category: "website-content",
                    title: data.title,
                    content: data.content,
                    crawled_at: new Date().toISOString()
                };
                ALL_DOCUMENTS.push(doc);
                
                const filename = url.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
                fs.writeFileSync(path.join(OUTPUT_DIR, filename), JSON.stringify(doc, null, 2));
            }
        } catch (e) {
            console.error(`Failed to crawl ${url}:`, e.message);
        }
    }

    await browser.close();
    
    fs.writeFileSync(path.join(__dirname, 'SAGE_KNOWLEDGE_AUDIT.json'), JSON.stringify(ALL_DOCUMENTS, null, 2));
    console.log(`Crawl complete. Extracted ${ALL_DOCUMENTS.length} documents.`);
    
    // Generate markdown audit report
    const auditReport = `# SAGE Knowledge Audit\n\n## Pages Discovered\n${Array.from(VISITED).map(u => '- ' + u).join('\n')}\n\n## Documents Extracted\n${ALL_DOCUMENTS.map(d => `- **${d.title}**: ${d.content.substring(0, 100)}...`).join('\n')}\n`;
    fs.writeFileSync(path.join(__dirname, '../../SAGE_KNOWLEDGE_AUDIT.md'), auditReport);
}

crawl();
