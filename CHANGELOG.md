# Historial de cambios

## v0.3.0 - Salas de hasta 10 jugadores

### Salas por codigo (nuevo)
- Salas de hasta **10 jugadores** con un codigo corto (por ejemplo `K7M2P`). Los invitados
  entran escribiendo el codigo, sin intercambios manuales ni cuentas.
- El encuentro entre jugadores usa un **broker MQTT publico** y un cliente propio sin
  dependencias (`src/mqtt.js`); a partir de ahi el juego va directo entre navegadores.
- Topologia en estrella con la **autoridad en el anfitrion**: el simula, reparte los bots y
  decide los impactos. Cada invitado envia su entrada a 30 Hz, predice su movimiento y
  recibe instantaneas a 20 Hz con interpolacion. Todos se ven entre si.
- **Vida de la sala**: permanece abierta mientras haya alguien dentro; cuando se vacia,
  empieza una **cuenta atras de 1 minuto** y se cierra sola si nadie entra. Si el anfitrion
  sale, la sala termina para todos y los invitados reciben el aviso.
- **Retransmision TURN publica** de respaldo ademas de STUN, para mejorar la conexion entre
  redes distintas.
- El modo manual por codigos se conserva como alternativa sin relay.

### Correcciones
- Dos fallos que solo aparecian con varios jugadores: los mensajes de juego se enviaban por
  el canal equivocado (una segunda definicion de las funciones de envio sobrescribia la
  version con salas) y los jugadores remotos no entraban en la lista de entidades, asi que
  los invitados no se veian entre si.

### Herramientas
- `tools/mqtttest.js`: comprueba el broker publico con dos clientes.
- `tools/roomtest.js`: abre **tres navegadores**, crea una sala, une a dos invitados con el
  codigo, empieza la partida y verifica el cierre cuando se vacia.
- `tools/kill-chrome.ps1`: cierra los navegadores de prueba que hayan quedado abiertos.
- El juego acepta parametros de URL para pruebas (`lowq`, `fps`, `bots`).

## v0.2.0 - Multijugador y publicacion web

### Multijugador (nuevo)
- Partida de dos jugadores por conexion directa entre navegadores (WebRTC), sin servidor
  intermedio y sin cuentas. Se enlaza con dos codigos de texto que se intercambian una vez.
- Autoridad en el anfitrion: el simula la partida, manda los bots y decide los impactos.
  El invitado envia su entrada a 30 Hz, predice su propio movimiento y recibe instantaneas
  a 20 Hz con interpolacion, de modo que el movimiento se siente fluido.
- Canal rapido sin garantias para entradas e instantaneas y canal fiable para el inicio y
  los avisos, con cola de salida para no perder mensajes mientras el enlace abre.
- Pestana Multijugador en el menu, con los dos flujos (crear sala / unirse), estado de la
  conexion en el HUD y latencia.
- En los modos por equipos los dos jugadores van al mismo bando contra los bots.

### Publicacion
- El juego es estatico, asi que funciona en GitHub Pages sin ningun servidor.
- `tools/build-single.js` empaqueta todo (motor, fuentes, estilos y codigo) en un unico
  `dist/BlockBurst.html` de menos de 1 MB, listo para subir como artefacto a cualquier
  hosting que acepte un solo HTML (por ejemplo la opcion de publicar de space-z.ai).
- `.nojekyll` para que Pages sirva el contenido tal cual.

### Herramientas
- `tools/nettest.js`: abre dos navegadores reales, hace el intercambio de codigos con la
  interfaz real y comprueba que se conectan y que el invitado recibe el mundo.
- `tools/screenshot.js` admite ahora capturar un unico archivo indicando su ruta.
- `tools/simulate.js` incluye una prueba del protocolo de red sin navegador (entrada,
  instantanea, plantilla y codec de los codigos de sala).

## v0.1.1 - Pulido visual y herramientas de verificacion

### Visual
- Ciudades mucho mas densas (de unos 27 a entre 60 y 90 bloques solidos por mapa) y calles
  con calzada marcada, aceras y mobiliario urbano: farolas, cajas, barreras y arboles de dos copas.
- Cielo con degradado propio en cada mapa, luz de relleno frio y sombras activadas por defecto.
- Rampas rediseñadas: solo aparecen donde el hueco esta realmente libre, con plataforma de
  aterrizaje y color neutro para que lean como infraestructura y no como vigas sueltas.
- Plaza central con fuente de dos niveles, agua y bancos.
- Salida de color en sRGB y ajuste de sombras sin artefactos.

### Interfaz
- Reticula de punteria mas grande y con contorno, visible sobre cualquier fondo.
- Arma en primera persona sobre escena superpuesta dedicada: ya no se oculta ni se recorta.
- Textos y barras de vida/escudo mas grandes y alineados; minimapa mas claro y mas grande.
- El rotulo de inicio de partida pasa a ser una tarjeta con titulo y nombre del modo.
- El aviso de reaparicion se oculta solo en cuanto vuelves a estar vivo.

### Correcciones
- La colocacion de apariciones, rutas, objetos y props ahora es determinista: antes usaba
  aleatoriedad sin semilla y podia dejar elementos dentro de bloques en algunas cargas.
- Los props ya no pueden caer sobre la colina central ni sobre las bases de bandera.
- Edificios hundidos 0.25 en el suelo para eliminar caras coplanares con el terreno.
- El avatar del jugador usa paleta fija y el brazo izquierdo deja de quedar oculto al apuntar.

### Herramientas
- `tools/check-syntax.js`: comprobacion de sintaxis de todos los modulos.
- `tools/serve.js`: servidor estatico local sin dependencias.
- `tools/screenshot.js`: abre el juego en Chrome headless, captura varias vistas y reporta
  los errores de consola y las excepciones del navegador.
- Imagenes de referencia en `docs/`.

## v0.1.0 - Primera version jugable

Primera entrega publica: el juego completo en solitario contra bots, con los cinco
modos y los seis mapas funcionando de principio a fin.

### Jugabilidad
- Bucle de partida completo: aparicion, combate, muerte, reaparicion y fin de partida.
- Fisica de personaje: gravedad, salto, carrera, agachado, rampas transitables y
  deteccion de atasco.
- Siete armas: pistola, subfusil, escopeta, rifle, francotirador, katana y lanzacohetes.
- Retroceso con recuperacion, dispersion dinamica segun movimiento y apuntado con clic
  derecho, recarga manual y recarga automatica al vaciar el cargador.
- Golpes en la cabeza con multiplicador de dano, y dano decreciente con la distancia.
- Barriles explosivos con dano en area.
- Objetos de vida, escudo, municion y cohetes, con reaparicion automatica.
- Escudo que absorbe la mitad del dano entrante.

### Modos
- Todos contra todos (25 bajas).
- Duelo por equipos Rojo contra Azul (50 bajas).
- Supervivencia con oleadas de zombis cada vez mas numerosas y resistentes.
- Captura la bandera (tres capturas).
- Rey de la colina (150 segundos de dominio).

### Mapas
- Seis arenas: Distrito Doodle, Caldera Voxel, Glaciar Azul, Templo Selva, Azoteas Neon
  e Islas Flotantes.
- Generacion con semilla fija y colocacion de puntos de aparicion, rutas, objetos,
  banderas y colina calculada contra la geometria real.
- Peligros por mapa: lava, agua que frena, hielo resbaladizo y vacio.

### Presentacion
- Personajes de bloques con cara, gorra o casco y animacion de caminata.
- Vista en primera persona y en tercera persona con `V`.
- HUD completo: vida, escudo, municion, ranuras de arma, minimapa, marcador, killfeed,
  aviso de reaparicion, marcador con `Tab` y pantalla de resultados.
- Menu con seleccion de modo, mapa, dificultad, numero de bots, calidad grafica,
  sensibilidad y campo de vision, guardado en el navegador.
- Efectos: trazadoras, impactos, explosiones, sacudida de camara, vinetas de dano y
  curacion, y sonido sintetizado con WebAudio (sin archivos de audio).

### Tecnico
- Motor 3D local, sin dependencias remotas ni proceso de compilacion.
- Geometria instanciada por color, hash espacial para colisiones y raycast por muestreo.
- `tools/validate-maps.js`: comprueba geometria, apariciones, rutas y objetivos.
- `tools/simulate.js`: ejecuta partidas completas sin navegador con Three.js simulado.
- Flujo de trabajo con integracion continua y publicaciones versionadas.
