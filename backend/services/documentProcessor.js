// Use the lib path to avoid pdf-parse loading test files on startup (Railway fix)
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');
const axios = require('axios');
const cheerio = require('cheerio');
const xlsx = require('xlsx');
const officeparser = require('officeparser');
const { summarizeDocument } = require('./openai');

/**
 * Process PDF file and extract text
 */
async function processPDF(buffer) {
    try {
        console.log(`📄 Parsing PDF (${buffer.length} bytes)...`);

        // Use no-test-data path to avoid Railway/serverless startup issue
        const data = await pdfParse(buffer, {
            // Disable font loading to avoid file system errors in serverless
            max: 0
        });

        const text = data.text?.trim() || '';
        console.log(`✅ PDF parsed, extracted ${text.length} characters, ${data.numpages} pages`);

        if (text.length < 20) {
            // Image-only / scanned PDFs return empty text
            console.warn(`⚠️ PDF appears to be image-based or has no selectable text (${text.length} chars)`);
            // Return a minimal descriptive text so the upload doesn't fail completely
            return `[PDF Document: ${data.numpages || '?'} pages. This document appears to be image-based or scanned. Text content could not be extracted automatically.]`;
        }

        return text;
    } catch (error) {
        console.error('❌ PDF processing error:', error.message);
        throw new Error(`Failed to process PDF: ${error.message}`);
    }
}

/**
 * Process DOCX file and extract text
 */
async function processDOCX(buffer) {
    try {
        console.log(`📄 Parsing DOCX (${buffer.length} bytes)...`);
        const result = await mammoth.extractRawText({ buffer });
        console.log(`✅ DOCX parsed, extracted ${result.value?.length || 0} characters`);
        return result.value || '';
    } catch (error) {
        console.error('❌ DOCX processing error:', error.message);
        throw new Error('Failed to process DOCX');
    }
}

/**
 * Process XLSX file and extract text
 */
async function processXLSX(buffer) {
    try {
        console.log(`📄 Parsing XLSX (${buffer.length} bytes)...`);
        const workbook = xlsx.read(buffer, { type: 'buffer' });
        let text = '';
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            text += `\n--- Sheet: ${sheetName} ---\n`;
            text += xlsx.utils.sheet_to_txt(worksheet);
        });
        console.log(`✅ XLSX parsed, extracted ${text.length} characters`);
        return text;
    } catch (error) {
        console.error('❌ XLSX processing error:', error.message);
        throw new Error('Failed to process XLSX');
    }
}

/**
 * Process PPTX file and extract text
 */
async function processPPTX(buffer) {
    try {
        console.log(`📄 Parsing PPTX (${buffer.length} bytes)...`);
        return new Promise((resolve, reject) => {
            officeparser.parseOffice(buffer, (data, err) => {
                if (err) return reject(err);
                console.log(`✅ PPTX parsed, extracted ${data.length} characters`);
                resolve(data);
            });
        });
    } catch (error) {
        console.error('❌ PPTX processing error:', error.message);
        throw new Error('Failed to process PPTX');
    }
}

/**
 * Scrape text from web page
 * @param {string} url - Web page URL
 * @returns {Promise<string>} Extracted text
 */
async function scrapeWebPage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Upgrade-Insecure-Requests': '1'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Remove script and style elements
        $('script, style, nav, footer, iframe').remove();

        // Extract text from main content areas
        const text = $('body').text()
            .replace(/\s+/g, ' ')
            .trim();

        return text;
    } catch (error) {
        if (error.response?.status === 999 || error.response?.status === 403) {
            console.error(`🛡️ URL Access Blocked by Target Site (${error.response.status}):`, url);
            throw new Error('This site is protected by anti-bot measures (like LinkedIn). Please copy-paste the content into a TXT file and upload instead.');
        }
        console.error('Web scraping error:', error.message);
        throw new Error('Failed to scrape web page. Please check the URL.');
    }
}

/**
 * Chunk text into smaller pieces for better retrieval
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Maximum chunk size
 * @param {number} overlap - Overlap between chunks
 * @returns {Array<string>} Text chunks
 */
function chunkText(text, chunkSize = 1000, overlap = 200) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
    }

    return chunks;
}

/**
 * Process document based on file type
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - File MIME type
 * @param {string} filename - Original filename
 * @returns {Promise<object>} Processed document data
 */
async function processDocument(buffer, mimetype, filename) {
    let text = '';
    console.log(`📄 Processing document: ${filename} (${mimetype})`);

    try {
        if (mimetype === 'application/pdf') {
            text = await processPDF(buffer);
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            text = await processDOCX(buffer);
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            text = await processXLSX(buffer);
        } else if (mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
            text = await processPPTX(buffer);
        } else if (mimetype === 'text/plain') {
            text = buffer.toString('utf-8');
        } else {
            throw new Error(`Unsupported file type: ${mimetype}`);
        }

        // Clean text - removing excessive whitespace but keeping meaningful content
        text = text.trim();
        console.log(`📊 Extracted ${text.length} characters of text`);

        if (text.length === 0) {
            console.warn('⚠️ Extracted text is empty!');
        }

        // Chunk the text
        const chunks = chunkText(text);
        console.log(`🧩 Created ${chunks.length} chunks`);

        // Generate summary - even if text is small
        let summary = 'Summary of the uploaded content.';
        try {
            if (text.length > 0) {
                summary = await summarizeDocument(text);
                console.log('✅ Generated summary');
            }
        } catch (sumErr) {
            console.error('Error generating summary:', sumErr.message);
        }

        return {
            filename,
            mimetype,
            text,
            chunks,
            summary,
            metadata: {
                filename,
                mimetype,
                processedAt: new Date().toISOString(),
                chunkCount: chunks.length,
                totalLength: text.length,
                summary
            }
        };
    } catch (error) {
        console.error(`❌ Document processing error (${filename}):`, error.message);
        throw error;
    }
}

module.exports = {
    processPDF,
    processDOCX,
    scrapeWebPage,
    chunkText,
    processDocument,
    summarizeDocument
};
