const fs = require('fs');
const path = require('path');

const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, 'raw_products.json'), 'utf8'));

let contentText = "YAS Shoe Care 完整商品與服務目錄及價格表 (Complete Product & Service Catalog):\n\n";

rawData.forEach((item, idx) => {
    contentText += `${idx + 1}. 商品/服務名稱 (Product/Service Name): ${item.title}\n`;
    contentText += `   - 價格 (Price): NTD ${item.price}\n`;
    if (item.desc) {
        // Simple HTML strip
        const cleanDesc = item.desc.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        contentText += `   - 描述 (Description): ${cleanDesc}\n`;
    }
    contentText += "\n";
});

const doc = {
  "source": "YAS Shoe Care",
  "source_url": "https://www.yasshoescare.com/lns/items",
  "language": "zh-CN",
  "category": "website-content",
  "title": "YAS 鞋類洗護中心 - 完整商品與服務目錄 (Complete Product Catalog)",
  "content": contentText,
  "crawled_at": new Date().toISOString()
};

const outPath = path.join(__dirname, 'knowledge-base', 'website-content', 'all_products.json');
fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));

console.log('Successfully formatted and saved to all_products.json');
