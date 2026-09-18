/* Prueba del cliente MQTT minimo contra el broker publico.
   Uso: node tools/mqtttest.js */
'use strict';

global.window = global;
require('../src/mqtt.js');
var B = global.BLITZ;

var URL = process.env.BB_MQTT || 'wss://broker.emqx.io:8084/mqtt';
var room = 'bb-selftest-' + Math.random().toString(36).slice(2, 8);
var topicA = room + '/a';
var topicB = room + '/b';
var done = 0, fails = 0;

function finish(msg, bad) {
  if (bad) { fails++; console.log('FALLO: ' + msg); }
  else console.log('OK: ' + msg);
  done++;
  if (done >= 2) {
    console.log(fails ? ('Resultado: ' + fails + ' fallos') : 'Resultado: broker accesible y mensajes entregados.');
    process.exit(fails ? 1 : 0);
  }
}

var a = new B.Mqtt(URL, 'bb-a-' + Math.random().toString(36).slice(2, 10)).connect();
var b = new B.Mqtt(URL, 'bb-b-' + Math.random().toString(36).slice(2, 10)).connect();

var readyA = false, readyB = false, subA = false, subB = false;
var sent = false;
function tryGo() {
  if (sent || !readyA || !readyB || !subA || !subB) return;
  sent = true;
  a.publish(topicB, JSON.stringify({ hola: 'desde A', n: 42 }));
  b.publish(topicA, JSON.stringify({ hola: 'desde B', n: 7 }));
}

a.on('open', function () { readyA = true; a.subscribe(topicA); tryGo(); });
b.on('open', function () { readyB = true; b.subscribe(topicB); tryGo(); });
a.on('suback', function () { subA = true; tryGo(); });
b.on('suback', function () { subB = true; tryGo(); });

a.on('message', function (topic, text) {
  try {
    var m = JSON.parse(text);
    if (m.hola !== 'desde B') return finish('contenido inesperado en A', true);
    finish('A recibio el mensaje de B por ' + topic);
  } catch (e) { finish('mensaje ilegible en A: ' + text, true); }
});
b.on('message', function (topic, text) {
  try {
    var m = JSON.parse(text);
    if (m.hola !== 'desde A') return finish('contenido inesperado en B', true);
    finish('B recibio el mensaje de A por ' + topic);
  } catch (e) { finish('mensaje ilegible en B: ' + text, true); }
});

a.on('error', function () { });
b.on('error', function () { });

setTimeout(function () {
  console.log('FALLO: tiempo agotado esperando al broker ' + URL);
  process.exit(1);
}, 25000);
