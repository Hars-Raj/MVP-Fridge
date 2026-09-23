const http = require('http');
const fs = require('fs');
const path = require('path');

// MAPBOX_ENV_FILE can point to an existing private configuration outside this site.
const envFile = process.env.MAPBOX_ENV_FILE || path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*MAPBOX_ACCESS_TOKEN\s*=\s*(.*?)\s*$/);
    if (match && !process.env.MAPBOX_ACCESS_TOKEN) process.env.MAPBOX_ACCESS_TOKEN = match[1].replace(/^['"]|['"]$/g, '');
  }
}

const port = Number(process.env.PORT) || 3000;
const root = __dirname;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

http.createServer((request, response) => {
  if (request.url === '/mapbox-config.js') {
    const token = process.env.MAPBOX_ACCESS_TOKEN || '';
    response.writeHead(200, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
    response.end('window.MAPBOX_ACCESS_TOKEN = '+JSON.stringify(token.startsWith('pk.') ? token : '')+';');
    return;
  }
  let urlPath;
  try { urlPath = decodeURIComponent((request.url || '/').split('?')[0]); }
  catch { response.writeHead(400);response.end('Bad request');return; }
  if (urlPath.split(/[\\/]/).some(part => part.startsWith('.'))) {
    response.writeHead(404);response.end('Not found');return;
  }
  const filePath = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const safePath = path.normalize(path.join(root, filePath));

  if (!safePath.startsWith(root + path.sep) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const type = mime[path.extname(safePath).toLowerCase()] || 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(safePath).pipe(response);
}).listen(port, () => {
  console.log(`Outspoke running at http://localhost:${port}`);
});
