# Historial de cambios

## v0.5.3 - Aciertas cuando apuntas, y los bots son mas justos

### Precision ("disparo y parece que no acierto")
- La causa era la **dispersion**: el rifle tenia 1,1 grados de base (y mas al moverte). A 35 m
  eso es un circulo de mas de un metro, asi que apuntar a una cabeza de 60 cm fallaba a
  menudo sin que se viera el motivo.
- Dispersión reducida: rifle 1,1 -> **0,5** grados, pistola 0,9 -> **0,55**, subfusil 1,7 ->
  **1,1**, francotirador 0,14 -> **0,05**. El castigo por moverse baja de 1,0 a 0,55 y el de
  disparar en rafaga tambien.
- **Hitbox de cabeza** algo mas generoso (0,68 m de ancho en vez de 0,60) y empieza un poco
  mas abajo, de modo que un tiro al cuello cuenta como cabeza.
- Medido: **12 de 12 aciertos a la cabeza** a 8, 20 y 35 m con el rifle.

### Bots mas justos ("matan muy rapido")
- Disparan **mas pausado** que la cadencia maxima del arma (1,5 veces el tiempo entre
  disparos), las rafagas son mas cortas y hay mas pausa entre ellas.
- **Menos dano por bala** en todos los niveles (normal 0,6 -> 0,45), **menos alcance de
  vision** (72 -> 55 m) y mas tiempo de reaccion.
- La **invulnerabilidad al reaparecer** baja de 1,6 a 0,8 s: antes, si disparabas justo tras
  su reaparicion, parecia que no acertabas.
- Medido: con 3 bots en Normal, el muñeco de prueba (que **no se cubre ni esquiva**) aguanta
  entre 20 y 30 s; antes caia en pocos segundos. La escala se nota: en Facil aguanta mas que
  en Dificil.
- Los zombis pegan algo mas que en la version anterior (se habian quedado flojos), pero
  siguen sin matar de dos golpes.

## v0.5.2 - El corte de la katana se ve

- **Tajo por fases**: amago arriba a la derecha, corte diagonal rapido y recuperacion. El
  golpe entra cuando llega la hoja (a los 0,17 s de un tajo de 0,46 s), no al pulsar.
- **Estela visible del corte**: un arco claro barre la pantalla siguiendo el filo y se
  desvanece, de modo que el tajo **se ve**, no solo se nota.
- **Silbido del filo** mas definido (barrido de ruido mas brillo metalico).
- **Impactos visibles** en cada enemigo alcanzado por el barrido.
- En **tercera persona** el brazo tambien ejecuta el tajo, asi que se ve desde fuera.

## v0.5.1 - Ajustes que destaparon las pruebas

Al ejecutar la bateria completa varias veces seguidas, las comprobaciones automaticas
detectaron comportamientos que no se veian en una sola partida:

- **Los zombis se atascaban contra las paredes.** Solo perseguian si te veian, y en una
  ciudad densa se quedaban dando vueltas: una oleada podia pasar 60 s sin una sola baja.
  Ahora perciben al jugador siempre, rodean los obstaculos siguiendo el grafo de rutas y se
  desatascan solos si dejan de avanzar.
- **Apariciones y rutas solo en terreno accesible a pie.** Antes se podia aparecer en una
  azotea o en una pasarela elevada: los enemigos cuerpo a cuerpo se quedaban abajo sin poder
  llegar (y sin recibir dano). Ahora los puntos de aparicion, las rutas y los objetos se
  limitan a superficies bajas.
- **Distancia de aparicion jugable.** Los jugadores aparecen repartidos pero a una distancia
  razonable del rival mas proximo (unos 30 m), en lugar del punto mas lejano del mapa, que
  dejaba a los bots demasiado tiempo sin encontrarse.
- **Persecucion que rodea**: cuando un bot persigue y no tiene linea de vista, sigue las
  calles en vez de empujar la pared.

Verificado con varias pasadas seguidas de la bateria completa (0 incidencias) y con la
prueba de salas de tres navegadores.

## v0.5.0 - Katana, bots que navegan y mapa de islas

### Katana
- El tajo es ahora un movimiento completo: **el golpe se aplica al llegar la hoja**, no al
  pulsar; el arma barre de derecha a izquierda y el ataque da una **pequeña zancada** hacia
  delante. Se puede **mantener pulsado** para encadenar tajos.

### Bots
- **Navegacion por rutas**: los bots ya no se pegan a las paredes. El mapa construye un grafo
  de calles con linea de vista y los bots lo siguen para llegar a su destino.
- **Acuden al objetivo**: en Rey de la colina van a la zona central y en Captura la bandera a
  por la bandera rival (medido: distancia media a la colina de 43 a 29 u en 14 s).
- **Apariciones repartidas**: antes se sorteaban diez puntos al azar y podian salir juntos.
  Ahora se evaluan todos los puntos y se elige el mas alejado de cualquier jugador vivo
  (distancia minima medida entre dos apariciones: 25-30 u).
- **Zombis de un mismo bando**: ya no se atacan entre ellos.
- **Saltan huecos cortos**: si el camino tiene un salto de menos de unos 2,4 m, saltan en vez
  de rodearlo.

### Mapa
- **Islas Flotantes rehecho**: siete islas unidas por pasarelas en L que solapan las
  plataformas, de modo que todo el terreno es una sola masa transitable (antes habia saltos
  que los zombis no podian salvar). Verificado: el 100% del terreno transitable esta conectado.

### Pruebas
- Nuevas comprobaciones automaticas: zombis sin fuego amigo, apariciones separadas, bots que
  acuden al objetivo en Rey de la colina, terreno conectado en las islas y tajo de la katana
  con golpe retardado y zancada.

## v0.4.0 - Armas, bots y mapa

### Armas
- **Katana**: ahora es un barrido cuerpo a cuerpo que alcanza a varios enemigos en el cono
  frontal, con animacion de tajo en el modelo. Antes era un golpe puntual y se sentia como
  un arma de fuego. Tambien puede rebanar barriles.
- **Francotirador**: zoom real al apuntar (campo de vision 22) con mira superpuesta y su
  propia reticula, y **muerte de un solo tiro en la cabeza** aunque el rival lleve escudo.
- **Retroceso**: suavizado en pistola, subfusil, francotirador y lanzacohetes; el rifle y la
  escopeta conservan el retroceso de antes.
- **Modelos mas detallados**: pistola (corredera, alza y punto de mira), subfusil (cañon,
  bocacha, culata), escopeta (guardamanos), rifle (carril y miras), francotirador (visor,
  bipode), katana (guardia, vendas y filo) y lanzacohetes (asas, culata y boca).

### Bots
- Nivel de dificultad elegible **al crear la sala**, junto al numero de bots.
- Los bots son menos letales: mas tiempo de reaccion, mas error de punteria y menos dano.
- **Ya no atacan solo al anfitrion.** El jugador remoto se quedaba con la inmunidad puesta
  para siempre: los bots lo ignoraban y ademas no se le podia hacer dano. Corregido.
- **Islas Flotantes**: los bots y zombis ya no se caen al vacio. Eligen ruta dentro de la
  misma isla, evitan los bordes al caminar y, si aun asi uno cae, los zombis vuelven a la
  arena en lugar de desaparecer.
- El mapa Islas Flotantes tiene ahora mas puentes, mas anchos y plataformas intermedias,
  de modo que las islas estan bien conectadas.
- Los zombis pegan mas flojo que un humano con la katana.

### Herramientas
- El simulador incorpora comprobaciones de jugabilidad: retroceso por arma, zoom y muerte de
  un tiro del francotirador, barrido de la katana, que los bots ataquen al jugador remoto y
  que no se caigan en Islas Flotantes.
- La prueba de salas comprueba que la dificultad elegida al crear la partida se aplica.

## v0.3.1 - Arreglo del campo del codigo de sala

- El juego capturaba el teclado a nivel global para WASD y se comia las letras al escribir
  en los formularios del menu: un codigo como `4WF2B` no se podia teclear (la W y la F se
  perdian). Ahora la captura se desactiva cuando el foco esta en un `input`, `textarea` o
  `select`, lo que tambien arregla el campo del nombre y el atajo Ctrl+V.
- Interfaz de sala mas clara: el recuadro del codigo propio queda marcado como **solo lectura**
  (apagado y centrado) y el de unirse como **editable** (contorno y fondo distintos), con
  etiquetas explicitas, boton **PEGAR**, mayusculas automaticas y **Enter** para unirse.
- `tools/typingtest.js`: escribe el codigo con pulsaciones reales de teclado y comprueba que
  el campo lo recibe.

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
