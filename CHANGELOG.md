# Historial de cambios

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
