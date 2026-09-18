# BLOCKBURST

Shooter de arena para navegador con personajes y escenarios de bloques de colores.
Nace como un homenaje jugable: toma la idea base de un shooter de cuaderno dibujado a
mano (todos contra todos, oleadas, grapnel, katana) y le suma las caracteristicas de
arena de un shooter tipo Roblox (mapas de bloques, equipos, objetivos), con seis mapas
propios y cinco modos de juego.

No usa ningun recurso remoto: todo el motor, las fuentes y el audio viajan dentro del
repositorio, asi que abre incluso sin conexion.

![Partida en tercera persona](docs/captura-partida.png)

![Vista en primera persona con arma y reticula](docs/captura-primera-persona.png)

## Como abrirlo

**Opcion 1 - abrir el archivo (lo mas rapido)**

Abre `index.html` con doble clic en Chrome, Edge o Firefox.

**Opcion 2 - servidor local (recomendado)**

```bash
npm run serve
# o
npx --yes serve .
```

Y entra en la direccion que imprime la consola.

**Requisitos:** un navegador con WebGL y raton. No hay build, no hay `npm install`.

## Jugar publicado

- **GitHub Pages:** <https://juanruiz85.github.io/BlockBurst/> (el repositorio es publico y el
  sitio se sirve estatico desde la rama `main`).
- **Un solo archivo:** `npm run build:single` genera `dist/BlockBurst.html`, un HTML
  autocontenido de menos de 1 MB con el motor, las fuentes y el codigo dentro. Se puede
  abrir con doble clic o subir a cualquier hosting de artefactos, por ejemplo la opcion de
  publicar de space-z.ai.

## Multijugador

Se juega de dos en dos por conexion directa entre los navegadores (WebRTC). No hay
servidor intermedio ni cuentas: los dos jugadores intercambian una vez dos codigos de
texto y a partir de ahi hablan entre ellos.

| Paso | Anfitrion | Invitado |
|---|---|---|
| 1 | Pestana Multijugador, pulsa **Crear sala** | |
| 2 | Envia su **codigo de sala** al invitado | Pega el codigo y pulsa **Generar respuesta** |
| 3 | Pega la **respuesta** y pulsa **Conectar** | Envia su respuesta al anfitrion |
| 4 | La partida arranca sola | Entra a la partida automaticamente |

Detalles utiles:

- El **anfitrion** simula todo (jugadores, bots, modos) y decide los impactos. El invitado
  envia su entrada 30 veces por segundo, predice su propio movimiento y recibe instantaneas
  20 veces por segundo, que se interpolan para que se vea fluido.
- El modo y el mapa son los elegidos en la pestana **Jugar**; en los modos por equipos los
  dos jugadores van al **mismo bando** contra los bots.
- Los codigos son largos porque contienen la negociacion cifrada del enlace.
- Si una red es muy restrictiva (NAT simetrico sin salida UDP), el enlace puede no cuajar:
  cambia de red o intercambia quien crea la sala. No hay servidor de retransmision.

## Controles

| Accion | Tecla |
|---|---|
| Moverse | `W` `A` `S` `D` |
| Mirar | Raton |
| Disparar | Clic izquierdo |
| Apuntar (mira cerrada) | Clic derecho |
| Saltar | `Espacio` |
| Correr | `Shift` |
| Agacharse | `Ctrl` |
| Recargar | `R` |
| Cambiar de arma | `1` a `7` o rueda |
| Cambiar camara (1a / 3a persona) | `V` |
| Marcador | `Tab` |
| Pausa | `Esc` |

## Modos de juego

| Modo | Formato | Objetivo |
|---|---|---|
| Todos contra todos | Individual | Primero en llegar a 25 bajas, o mas bajas al agotarse el tiempo |
| Duelo por equipos | Rojo vs Azul | El equipo que alcanza 50 bajas |
| Supervivencia | Individual | Resistir oleadas de zombis; cada oleada trae mas y mas fuertes |
| Captura la bandera | Rojo vs Azul | Robar la bandera rival y traerla a la base propia, tres veces |
| Rey de la colina | Rojo vs Azul | Acumular 150 segundos dentro de la zona central |

## Mapas

| Mapa | Tema | Rasgo distintivo |
|---|---|---|
| Distrito Doodle | Atardecer urbano | Calles amplias, azoteas con rampas y plaza con fuente |
| Caldera Voxel | Roca y fuego | Rios de lava que quitan vida si los pisas |
| Glaciar Azul | Hielo | Superficie resbaladiza y lagunas heladas que frenan |
| Templo Selva | Jungla | Terrazas, pasarelas de piedra y pozas de agua |
| Azoteas Neon | Noche | Rascacielos, pasarelas suspendidas y niebla |
| Islas Flotantes | Cielo | Plataformas sobre el vacio; caer es morir |

Los seis mapas se generan con semilla fija, asi que son identicos en cada partida y
siempre colocan puntos de aparicion, rutas de bots y objetos contra la geometria real:
un validador automatico comprueba que nada quede dentro de un bloque.

## Armas

| Tecla | Arma | Rol |
|---|---|---|
| 1 | Pistola | Precision media, municion practicamente infinita |
| 2 | Subfusil | Cadencia alta, control a corta distancia |
| 3 | Escopeta | Ocho postas, letal de cerca |
| 4 | Rifle | Automatico equilibrado, el arma por defecto |
| 5 | Francotirador | Un disparo, mucho dano, retroceso fuerte |
| 6 | Katana | Cuerpo a cuerpo, sin municion |
| 7 | Lanzacohetes | Dano en area, ideal contra grupos |

Los barriles rojos explotan si les disparas y hacen dano en area a todo el mundo.

## Entidades del mapa

- **Cubos verdes:** +40 de vida.
- **Cubos azules:** +50 de escudo (absorbe la mitad del dano entrante).
- **Cubos amarillos:** recargan municion de todas las armas.
- **Cubos naranjas:** +2 cohetes.
- **Barriles rojos:** explotan.

Los objetos reaparecen solos tras 22 segundos y, en Supervivencia, se reabastecen al
superar cada oleada.

## Estructura del proyecto

```
index.html                 Estructura de la interfaz (menu, HUD, pausa, resultados)
styles/ui.css              Sistema visual completo (paleta, tipografia, paneles)
src/util.js                Utilidades y generador pseudoaleatorio con semilla
src/audio.js               Efectos de sonido sintetizados con WebAudio
src/input.js               Teclado, raton y pointer lock
src/world.js               Construccion del mundo, colisiones, rampas y raycast
src/avatar.js              Personajes de bloques y animacion
src/weapons.js             Definicion de armas y modelos en primera persona
src/maps.js                Generacion de los seis mapas
src/bots.js                IA de bots y zombis
src/modes.js               Logica de los cinco modos
src/hud.js                 HUD, marcador, killfeed y minimapa
src/game.js                Nucleo: bucle, fisica, combate y camara
src/main.js                Arranque, menus y pantallas
vendor/three.min.js        Motor 3D local (Three.js r149, licencia MIT)
assets/fonts/              Fuentes auto-hospedadas (Chakra Petch, JetBrains Mono)
tools/                     Validadores y simulacion sin navegador
```

Todo el codigo del juego son scripts clasicos bajo un unico espacio de nombres
(`window.BLITZ`), cargados en orden desde `index.html`. Eso permite abrir el proyecto
directamente desde el disco sin servidor ni empaquetador.

## Desarrollo y verificacion

```bash
npm run check        # Comprueba la sintaxis de todos los modulos
npm run validate     # Verifica geometria, spawns, rutas y objetivos de los 6 mapas
npm run simulate     # Ejecuta 6 partidas completas sin navegador y prueba el protocolo de red
npm run build:single # Genera dist/BlockBurst.html (un solo archivo autocontenido)
npm run capture      # Abre el juego en Chrome headless y guarda capturas en docs/
npm run nettest      # Abre DOS navegadores y verifica el multijugador de extremo a extremo
npm test             # check + validate + simulate + build:single
```

`tools/simulate.js` sustituye Three.js y el DOM por stubs y corre partidas reales
(fisica, disparos, IA, modos, HUD) durante decenas de segundos simulados. Es la forma
mas rapida de detectar una regresion sin abrir el navegador.

`tools/screenshot.js` levanta el servidor local, abre Chrome en modo headless por el
protocolo de depuracion y guarda cinco vistas (menu, partida, personaje, supervivencia y
primera persona), ademas de informar de cualquier error de consola. Necesita Chrome o Edge
instalados y no usa dependencias externas.

## Como modificar cosas

| Quieres cambiar | Toca esto |
|---|---|
| Colores, tipografia, tamano de paneles | `styles/ui.css` (variables al principio de `:root`) |
| Textos del menu, resumen y consejos | `src/main.js` |
| Un mapa (geometria, tema, tamano) | `src/maps.js` |
| Danos, cadencia, cargadores | `src/weapons.js` |
| Dificultad y comportamiento de los bots | `src/bots.js` (tabla `PRESETS`) |
| Reglas de un modo | `src/modes.js` |
| Velocidad, salto, gravedad, retroceso | `src/game.js` y el campo `friction`/`jump` del mapa |

## Estado y siguientes pasos

Version jugable en solitario: tu contra bots con IA, con los cinco modos completos.
Lo siguiente en la lista:

- Multijugador en red (servidor autoritativo y salas).
- Editor de mapas dentro del juego.
- Mas armas y granadas.
- Progresion y desbloqueables.

## Creditos y licencia

Codigo bajo licencia MIT (ver `LICENSE`). Three.js r149 bajo licencia MIT.
No reproduce marcas, logos ni recursos de terceros: el estilo de bloques es una
interpretacion propia del genero.
