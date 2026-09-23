const http = require('http');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const port = Number(process.env.PORT) || 3000;

http.createServer((request, response) => {
  if (request.url === '/mapbox-config.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(`window.MAPBOX_ACCESS_TOKEN = ${JSON.stringify(process.env.MAPBOX_ACCESS_TOKEN || '')};`);
    return;
  }
  if (request.url === '/app-config.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
    response.end('window.APP_CONFIG = ' + JSON.stringify({
      url: process.env.SUPABASE_URL || '',
      key: process.env.SUPABASE_PUBLISHABLE_KEY || ''
    }) + ';');
    return;
  }
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const allowed = new Set(['/index.html','/styles.css','/app.js','/accounts.js','/places.json']);
  if (pathname !== '/' && !allowed.has(pathname)) {
    response.writeHead(404); response.end('Not found'); return;
  }
  const filePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = path.join(__dirname, filePath);

  if (!safePath.startsWith(__dirname) || !fs.existsSync(safePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const type = {'.css':'text/css','.js':'application/javascript','.json':'application/json','.html':'text/html'}[path.extname(safePath)];
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  fs.createReadStream(safePath).pipe(response);
}).listen(port, () => {
  console.log(`Hello World app running at http://localhost:${port}`);
});
