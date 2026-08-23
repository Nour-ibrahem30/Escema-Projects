/**
 * Local Development Server for AI Proxy
 * Runs the Vercel serverless function locally
 */
import { config } from 'dotenv';
import express from 'express';
import cors from 'cors';
import handler from './api/ai-proxy.ts';

// Load environment variables from .env.local
config({ path: '.env.local' });

console.log('Environment check:');
console.log('- AI_API_KEY:', process.env.AI_API_KEY ? '✓ Set' : '✗ Missing');
console.log('- AI_BASE_URL:', process.env.AI_BASE_URL || '(not set)');
console.log('- AI_MODEL:', process.env.AI_MODEL || '(not set)');

const app = express();
const PORT = 3001;

// CORS
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// Body parser with increased limit
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - Body size: ${JSON.stringify(req.body || {}).length} bytes`);
  next();
});

// AI Proxy endpoint
app.post('/api/ai-proxy', async (req, res) => {
  try {
    // Create Vercel-like request/response objects
    const vercelReq = {
      method: req.method,
      headers: req.headers,
      body: req.body,
    };

    const vercelRes = {
      status: (code) => {
        res.status(code);
        return vercelRes;
      },
      json: (data) => {
        res.json(data);
      },
      end: () => {
        res.end();
      },
      setHeader: (key, value) => {
        res.setHeader(key, value);
      },
    };

    await handler(vercelReq, vercelRes);
  } catch (error) {
    console.error('AI Proxy Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Local AI Proxy running on http://localhost:${PORT}`);
});
