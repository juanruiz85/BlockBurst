/* Comprueba la sintaxis de todos los modulos del juego.
   Uso: node tools/check-syntax.js */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = path.join(__dirname, '..', 'src');
var files = fs.readdirSync(dir).filter(function (f) { return /\.js$/.test(f); }).sort();
var bad = 0;

files.forEach(function (f) {
  try {
    new vm.Script(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
    console.log("OK   src/" + f);
  } catch (e) {
    bad++;
    console.log("FALLO src/" + f + ": " + e.message);
  }
});

console.log("\n" + files.length + " modulos, " + bad + " con errores de sintaxis.");
process.exit(bad ? 1 : 0);
