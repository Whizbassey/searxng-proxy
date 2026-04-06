import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SEARXNG_URL = process.env.SEARXNG_URL || 'https://searxng-railway-production-2160.up.railway.app';

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: [{ id: 'searxng-gpt', object: 'model', created: 1700000000, owned_by: 'searxng' }]
  });
});

app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { messages, model } = req.body;
    const userMessage = messages?.find(m => m.role === 'user');
    let query = Array.isArray(userMessage?.content)
      ? userMessage.content.map(c => c.text || c).join(' ')
      : (userMessage?.content || '');

    if (!query) {
      return res.status(400).json({ error: { message: 'No query found' } });
    }

    const searxngRes = await axios.get(`${SEARXNG_URL}/search`, {
      params: { q: query, format: 'json', engines: 'google', count: 8 },
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
      timeout: 15000
    });

    const results = searxngRes.data.results || [];
    const top = results.slice(0, 5);

    const content = top.length > 0
      ? top.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content || ''}`).join('\n\n')
      : 'No results found.';

    res.json({
      id: `search-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model || 'searxng-gpt',
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop'
      }],
      usage: { prompt_tokens: 10, completion_tokens: 100, total_tokens: 110 }
    });

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).json({ error: { message: error.message } });
  }
});

app.post('/v1/search', async (req, res) => {
  try {
    const { query, count = 5 } = req.body;
    if (!query) return res.status(400).json({ error: 'No query' });

    const { data } = await axios.get(`${SEARXNG_URL}/search`, {
      params: { q: query, format: 'json', engines: 'google', count },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });

    res.json({ query, results: (data.results || []).slice(0, count) });
  } catch (error) {
    res.status(500).json({ error: { message: error.message } });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`SearXNG Proxy running on :${PORT}`);
  console.log(`Backend: ${SEARXNG_URL}`);
});
