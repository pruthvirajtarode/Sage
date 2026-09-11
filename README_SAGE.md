# SAGE AI - YAS Shoe Care Business Assistant

SAGE AI is an enterprise-grade Chinese AI business assistant developed specifically for YAS Shoe Care. It serves as a domain-expert chatbot capable of answering inquiries about products, OEM/ODM services, manufacturing, quality certification, and business cooperation, strictly based on official YAS Shoe Care documentation.

## Project Structure

- `frontend/` - Contains the UI for the SAGE AI chatbot widget and demonstration pages.
- `backend/` - Node.js Express server handling API requests, RAG logic, and MongoDB integration.
- `scripts/sage/` - Dedicated automation scripts for maintaining the knowledge base:
  - `crawl-yas-site.js` - Playwright-based scraper to extract content from yasshoescare.com.
  - `ingest-yas-knowledge.js` - Script to chunk and embed scraped data into MongoDB Vector Store.
  - `clean-legacy-db.js` - Purges the database of legacy non-SAGE data.
  - `test-sage-chat.js` & `test-melissa-contamination.js` - Test suites for accuracy and isolation.
- `legacy-melissa-backup/` - Contains all deprecated files from the previous "Melissa AI" project version.

## Setup

1. Copy `.env.example` to `.env` and fill in the required `OPENAI_API_KEY` and `MONGODB_URI`.
2. Install dependencies: `npm install`
3. Run the backend: `npm run dev`

## Knowledge Base Maintenance

To update the SAGE AI knowledge base:
1. Run `node scripts/sage/crawl-yas-site.js` to scrape the latest website content.
2. Run `node scripts/sage/ingest-yas-knowledge.js` to index the new content into MongoDB.

## Architecture & Security

- **Language Support:** Native Simplified Chinese (zh-CN) logic and parsing.
- **RAG & Isolation:** Uses MongoDB Atlas Vector Search. All SAGE AI knowledge chunks are metadata-tagged with `tenant: 'sage'` to guarantee isolation from any legacy data.
- **Prompt Engineering:** Strict system prompts prevent hallucinations, guard against competitor bleed, and enforce a professional Chinese business tone.
