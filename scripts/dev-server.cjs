/**
 * ALIP dev server — a tiny zero-dependency static file server.
 * Serves the app over http:// (cleaner origin than file:// for fetch/CORS).
 *
 *   npm run dev            → http://127.0.0.1:5173
 *   PORT=8080 npm run dev  → custom port
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.PORT, 10) || 5173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

const server = http.createServer(function (req, res) {
  try {
    var urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') { urlPath = '/index.html'; }

    // resolve safely inside ROOT (no path traversal)
    var filePath = path.normalize(path.join(ROOT, urlPath));
    if (filePath.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end('Forbidden'); }

    fs.stat(filePath, function (err, stat) {
      if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 Not Found: ' + urlPath); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') { console.error('Port ' + PORT + ' is in use. Try: PORT=8080 npm run dev'); process.exit(1); }
  throw e;
});

server.listen(PORT, HOST, function () {
  console.log('\n  ALIP dev server running');
  console.log('  ➜  http://' + HOST + ':' + PORT + '\n');
  console.log('  Upload sample_data/srihari_mumbai_crm.xlsx on the CRM Upload page to see the pipeline.\n');
});
