const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    let products = [];

    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('getPtListByTypeNbr')) {
            try {
                const json = await response.json();
                if (json && json.data && json.data.list) {
                    console.log(`Found ${json.data.list.length} products from API`);
                    products = products.concat(json.data.list);
                }
            } catch (e) {}
        }
    });

    console.log('Navigating to Selected Products (dp1e10)...');
    await page.goto('https://www.yasshoescare.com/lns/items?typeNbr=dp1e10', { waitUntil: 'networkidle0', timeout: 30000 });
    
    console.log('Navigating to All Items (all)...');
    await page.goto('https://www.yasshoescare.com/lns/items?typeNbr=all', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Deduplicate products by ptNbr
    const uniqueProducts = Array.from(new Map(products.map(item => [item.ptNbr, item])).values());
    
    fs.writeFileSync(path.join(__dirname, 'raw_products.json'), JSON.stringify(uniqueProducts, null, 2));
    console.log(`Saved ${uniqueProducts.length} unique products to raw_products.json`);

    await browser.close();
    console.log('Done.');
})();
