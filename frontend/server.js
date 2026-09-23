const http = require('http');
const fs = require('fs');
const path = require('path');

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
  const urlPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const filePath = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const safePath = path.normalize(path.join(root, filePath));

  if (!safePath.startsWith(root) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) {
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
