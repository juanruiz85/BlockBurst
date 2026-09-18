/* Servidor estatico minimo, sin dependencias, para probar BLOCKBURST en local.
   Uso: node tools/serve.js [puerto] */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');

var root = path.resolve(path.join(__dirname, '..'));
var port = Number(process.argv[2] || 8080);

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

http.createServer(function (req, res) {
  var url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  var file = path.resolve(path.join(root, url));

  if (file.indexOf(root) !== 0) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403');
  }

  fs.readFile(file, function (err, data) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404');
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', function () {
  console.log('BLOCKBURST disponible en http://127.0.0.1:' + port + '/');
});
