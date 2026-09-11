# Backend

This directory contains all the backend files for the MelissAI Business Development Chatbot.

## Structure

```
backend/
├── index.js              # Express server entry point
├── routes/              # API route handlers
│   ├── admin.js        # Admin API endpoints
│   ├── chat.js         # Chat API endpoints
│   └── upload.js       # Document upload endpoints
├── services/           # Business logic services
│   ├── aiService.js    # OpenAI integration
│   ├── documentProcessor.js  # Document processing
│   └── vectorStore.js  # Vector storage for RAG
├── scripts/            # Utility scripts
│   └── initVectorStore.js  # Initialize sample knowledge base
├── data/               # Data storage
│   └── vectors/        # Vector database files
├── uploads/            # Temporary file uploads
└── sample-content/     # Sample documents

```

## Features

- **RESTful API**: Express-based API for chat, admin, and upload operations
- **RAG System**: Retrieval-Augmented Generation using vector embeddings
- **Document Processing**: Support for PDF, DOCX, and TXT files
- **Web Scraping**: Extract content from web pages
- **OpenAI Integration**: GPT-4 powered conversational AI

## Technologies

- Node.js & Express
- OpenAI API (GPT-4)
- Natural language processing
- Vector embeddings for semantic search
- Multer for file uploads
- Cheerio for web scraping

## API Endpoints

### Chat
- `POST /api/chat` - Send message and get AI response

### Admin
- `GET /api/admin/documents` - List all uploaded documents
- `DELETE /api/admin/documents/:id` - Delete a document

### Upload
- `POST /api/upload` - Upload and process a document
- `POST /api/upload/url` - Process a web page URL

## Environment Variables

Create a `.env` file in the root directory with:

```
PORT=3000
OPENAI_API_KEY=your_openai_api_key
```
