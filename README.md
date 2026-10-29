# Now Playing para Nuclear

Pantalla completa de «ahora suena» para el reproductor [Nuclear](https://github.com/nukeop/nuclear): portada grande, letras sincronizadas, comentarios de SoundCloud en su segundo exacto, visualizador y una cola que se puede buscar y reordenar. Pensada para dejarla en una segunda pantalla.

> *English:* fullscreen now-playing screen for Nuclear with big artwork, synced lyrics, SoundCloud timed comments, an audio visualizer and a searchable, reorderable queue. The interface is in Spanish.

## Qué incluye

**Pantalla de reproducción.** Se abre con el botón junto al volumen, con **F9** o desde Ajustes.
- **Portada:** grande, con el fondo difuminado y el color de acento sacados de ella. Si la canción no tiene portada, muestra un degradado con sus iniciales.
- **Controles:** línea de tiempo, aleatorio, repetir, volumen y favorito ❤️.
- **Letras sincronizadas:** usan los *plugins* de letras que tengas instalados. Haz clic en una línea para saltar a ella.
- **Comentarios de SoundCloud:** aparecen flotando en el segundo en que se escribieron, con marcas en la línea de tiempo.
- **Visualizador:** en barras o en onda. Analiza el audio sin tocar el sonido de Nuclear.
- **Aviso «A continuación»:** una tarjeta con la siguiente canción en los últimos 10 segundos.
- **Cola:** se puede buscar, reordenar arrastrando, redimensionar y plegar, y guardar como lista.

**Extras**
- **Doble clic** en cualquier canción de una lista para reproducirla.
- **Salto automático** de las canciones que no se pueden cargar.
- **Importador de Spotify**, sin cuenta ni clave. Funciona desde la pantalla de importar listas de Nuclear, o desde Ajustes pegando muchos enlaces a la vez.

## Instalación

**Desde el código:**
1. Clona el repositorio.
2. En Nuclear, ve a **Preferences → Plugins → Add Plugin** y elige la carpeta.
3. Actívalo.

**Desde una release:** descarga `plugin.zip` de la [última release](../../releases/latest), descomprímelo en una carpeta y añádela igual que en el paso anterior.

## Atajos de teclado (con la pantalla abierta)

| Tecla | Acción |
|---|---|
| F9 | Abrir o cerrar la pantalla |
| Espacio | Reproducir o pausar |
| ← / → | Canción anterior / siguiente |
| ↑ / ↓ | Volumen |
| M | Silenciar |
| S / R | Aleatorio / repetir |
| H | Favorito |
| L | Letras |
| C | Comentarios de SoundCloud |
| Q | Mostrar u ocultar la cola |
| / | Buscar en la cola |
| F | Pantalla completa |
| Esc | Volver a Nuclear |

## Ajustes

En **Ajustes → Now Playing** puedes cambiar:
- el desenfoque del fondo y si el fondo está animado
- el tipo de visualizador
- el reloj
- si «Volver» se ve siempre
- el aviso «A continuación»
- el salto de canciones que fallan
- los comentarios de SoundCloud
- si la pantalla se abre con las letras

También están ahí el botón para abrir la pantalla y el importador de Spotify.

## Limitaciones

- **El botón de la barra y el doble clic** se añaden directamente a la interfaz de Nuclear, porque la API de *plugins* no permite añadir botones. Una actualización de Nuclear podría romperlos; F9 y Ajustes seguirían funcionando.
- **Spotify:** solo deja leer las primeras **100 canciones** de una lista. El importador trae la información de cada canción (título, artistas, duración y portada), y el audio lo busca tu fuente de streaming. Quita el sufijo «- instrumental» del título para que se busque la versión normal.
- **Comentarios de SoundCloud:** solo se muestran si la canción coincide en SoundCloud por título y, además, por artista o duración.
- **Visualizador:** usa `captureStream()` sobre el audio de Nuclear. Si no recibe señal, cambia a una animación decorativa.

## Publicar una versión

1. Sube la versión en `package.json`.
2. Haz commit, crea la etiqueta y súbela: `git tag v1.0.1 && git push --tags`.
3. GitHub Actions comprueba que todo compila y publica la release con `plugin.zip`.

Para que aparezca en la tienda de *plugins* de Nuclear, hay que abrir un PR en [NuclearPlayer/plugin-registry](https://github.com/NuclearPlayer/plugin-registry) añadiendo el *plugin* a `plugins.json`.

## Licencia

[MIT](LICENSE)
