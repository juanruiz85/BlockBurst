/* Empaqueta el juego en un unico archivo HTML autocontenido.
   Sirve para subirlo a un hosting de artefactos (por ejemplo la opcion de publicar de
   space-z.ai) o para compartirlo como un solo fichero.
   Uso: node tools/build-single.js  ->  dist/BlockBurst.html */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(path.join(__dirname, '..'));
var OUT_DIR = path.join(ROOT, 'dist');
var OUT = path.join(OUT_DIR, 'BlockBurst.html');

function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }
function readBin(p) { return fs.readFileSync(path.join(ROOT, p)); }

var html = read('index.html');
var expectedScripts = (html.match(/<script src="[^"]+"><\/script>/g) || []).length;

/* 1. CSS en linea, con las fuentes convertidas a data URI */
var css = read(path.join('styles', 'ui.css'));
var fontCount = 0;
css = css.replace(/url\("?\.\.\/assets\/fonts\/([^")]+)"?\)/g, function (m, file) {
  fontCount++;
  return 'url("data:font/woff2;base64,' + readBin(path.join('assets', 'fonts', file)).toString('base64') + '")';
});
html = html.replace(/[ \t]*<link rel="stylesheet" href="styles\/ui\.css"[^>]*>\s*/,
  '  <style>\n' + css + '\n  </style>\n');

/* 2. Scripts en linea, en el mismo orden que el original */
var scriptCount = 0;
html = html.replace(/[ \t]*<script src="([^"]+)"><\/script>\s*/g, function (m, src) {
  scriptCount++;
  return '  <script>\n' + read(src) + '\n  </script>\n';
});

var banner = '<!-- BLOCKBURST - archivo unico autocontenido. Generado por tools/build-single.js.\n' +
  '     Se puede abrir con doble clic, subir a un hosting de archivos o publicar como artefacto. -->\n';
html = html.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n' + banner.replace(/\n$/, ''));

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);

var kb = Math.round(fs.statSync(OUT).size / 1024);
console.log('Archivo unico generado: dist/BlockBurst.html');
console.log('  scripts en linea: ' + scriptCount + '  fuentes en linea: ' + fontCount + '  tamano: ' + kb + ' KB');

if (scriptCount !== expectedScripts) {
  console.log('AVISO: se esperaban ' + expectedScripts + ' scripts y se incrustaron ' + scriptCount + '; revisa index.html.');
  process.exit(1);
}
if (/<script src=/.test(html) || /rel="stylesheet"/.test(html)) {
  console.log('AVISO: quedan referencias externas sin embeber.');
  process.exit(1);
}
