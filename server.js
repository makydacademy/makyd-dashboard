const http = require('http');
const fs = require('fs');
const path = require('path');

const API_KEY = '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';
const MODEL = 'claude-haiku-4-5-20251001';

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // Proxy Anthropic
  if (req.url === '/api/ai' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { system, user } = JSON.parse(body);
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 1500,
            system: system,
            messages: [{ role: 'user', content: user }]
          })
        });
        const data = await response.json();
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(response.status);
        res.end(JSON.stringify(data));
      } catch (err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Servir archivos estáticos
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(__dirname, filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
    res.setHeader('Content-Type', types[path.extname(filePath)] || 'text/plain');
    res.writeHead(200);
    res.end(data);
  });
});

// Intentar puertos hasta encontrar uno libre
function startOnFreePort(ports) {
  const port = ports.shift();
  server.listen(port, '0.0.0.0')
    .on('listening', () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`\n  Makyd Academy: ${url}`);
      console.log(`  Modelo: ${MODEL} OK\n`);
      // Abrir navegador automáticamente
      const { exec } = require('child_process');
      exec(`start ${url}`);
    })
    .on('error', () => {
      if (ports.length > 0) startOnFreePort(ports);
      else console.error('No se encontró puerto libre');
    });
}

startOnFreePort([8080, 8081, 8082, 8083, 9000, 9001]);
