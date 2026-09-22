const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 3000;

http.createServer((request, response) => {
  const filePath = request.url === '/' ? 'index.html' : request.url.slice(1);
  const safePath = path.join(__dirname, filePath);

  if (!safePath.startsWith(__dirname) || !fs.existsSync(safePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const type = safePath.endsWith('.css') ? 'text/css' : 'text/html';
  response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  fs.createReadStream(safePath).pipe(response);
}).listen(port, () => {
  console.log(`Hello World app running at http://localhost:${port}`);
});
