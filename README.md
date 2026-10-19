# Vestia — armario virtual con Vistelo AI

Vestia es una web app (PWA) para iPhone que convierte tu ropa en un armario digital, con vestidor virtual, test de color y **Vistelo AI**, una estilista que funciona dentro del propio iPhone.

## Funciones

- **Armario**
  - **Escáner de prendas**:
    1. Primero eliges **qué vas a escanear**: camiseta/top, camisa/blusa, jersey/sudadera, chaqueta/abrigo, pantalón/vaqueros, falda, shorts, vestido/mono, calzado, bolso, accesorio o automático.
    2. La cámara muestra la **silueta guía** de esa prenda y un consejo para colocarla.
    3. Vistelo AI recorta el fondo. Si la prenda está sobre algo rectangular (una foto, una pantalla, una cartulina), vuelve a recortar dentro. Después quita la percha, endereza la prenda si la foto está torcida y limpia el borde.
    4. Reconoce el tipo **solo entre los de la categoría elegida**, y la prenda concreta (p. ej. «Sudadera con capucha», «Pantalón cargo»). También detecta los colores, el estampado, el material y el estilo.
    5. Te enseña **tu prenda puesta en tu maniquí** antes de guardarla, y también un comparador antes/después.

    Para mejores resultados: la prenda sola (sin persona ni maniquí), extendida y sobre un fondo liso.
  - **Escaneo en serie**: haces una foto por prenda sin salir de la cámara (puedes cambiar de categoría entre foto y foto). Cada foto se recorta y se reconoce en segundo plano mientras sigues. Al final revisas todas, corriges el tipo si hace falta y las guardas de golpe. Si eliges varias fotos de la galería, también se procesan en serie.
  - **Lectura de la etiqueta**: desde la ficha de una prenda, haz una foto a su etiqueta, encuádrala y Vestia lee la composición (por ejemplo «55 % algodón, 30 % lino, 15 % viscosa», en varios idiomas), los cuidados escritos y el país de fabricación. Los símbolos de lavado son dibujos y no se leen: si la etiqueta no trae texto de cuidados, Vistelo los recomienda según el material.
  - **Estadísticas**: valor del armario, veces puestas, coste por uso, lo que más te pones, prendas olvidadas, colores, zonas, marcas, materiales y un mapa de actividad de 12 semanas.
  - Las fotos que subes también se recortan automáticamente.
  - Ficha de cada prenda con todas sus especificaciones, colores y combinaciones.
  - Puedes organizarlo por **tipo**, **color** o **marca**.
- **Vestidor**
  - **Maniquí personalizable**:
    - figura (mujer, hombre o neutro sin pelo) y complexión;
    - tono de piel (cámara, foto o selección);
    - siete peinados y color de pelo;
    - barba y rasgos de la cara.
  - **Tu ropa real en el maniquí** (modo «Real», por defecto): Vestia analiza la silueta de la foto de cada prenda (cuello, hombros, axilas, mangas, cintura, entrepierna y perneras) y la deforma con una malla para que se adapte a la postura y las medidas del maniquí. Las mangas siguen los brazos y las perneras siguen las piernas. El largo respeta la prenda y lo normal para su tipo: una camiseta llega a la cadera, un vaquero al tobillo y un vestido corto a medio muslo. Se le añade luz y sombra para darle volumen.
  - **Ropa a escala**: cada prenda se pone con su **caída** (ajustada, normal, holgada u oversize) y, en pantalones y faldas, con su **tiro** (bajo, medio o alto). Vestia lo deduce del nombre («slim», «oversize», «mom», «tiro bajo»…) y de la forma de la foto (lo ancho que es el pecho, lo baja que cae la sisa o lo ancho que es el bajo de la pernera). Una camiseta oversize cae con el hombro caído y más ancha que el cuerpo; un vaquero de tiro bajo se queda en la cadera y uno de tiro alto sube a la cintura. Si se equivoca, lo cambias en la ficha de la prenda (**Caída** y **Tiro**).
  - **Poses**: relajada, manos en la cintura, pasarela, paseo, saludo y brazos abiertos. La ropa, el calzado y el bolso siguen la pose (con las manos en la cintura, el bolso cuelga del codo).
  - **Maniquí detallado**: ojos con iris y brillo, pestañas, labios, manos con pulgar, pies en tres cuartos, clavículas, articulaciones, sombras de contacto y brillo en el pelo. La ropa se dibuja con el triple de resolución.
  - **Calzado y bolsos en el maniquí**: los zapatos (fotografiados de lado) se ponen en cada pie con la puntera hacia fuera, como en un figurín de moda; las botas cubren la pierna. El bolso cuelga de la mano según su tipo (de mano, tote, clutch o mochila).
  - **Probador con tu foto**: con una foto tuya de cuerpo entero y de frente, Vestia detecta tu postura y tus medidas (hombros, brazos, cintura, caderas, piernas y pies) y te pone tus prendas encima con el mismo motor que al maniquí. Cambias entre «Maniquí» y «Mi foto» en el Probador. La foto se queda en tu iPhone.
  - Modo «Ilustrada»: cada prenda se dibuja a medida con su color y su material. Modo «Foto»: la imagen original.
  - «Completar con Vistelo», «Sorpréndeme», análisis del look con tu piel, ideas por ocasión y looks guardados. El maniquí recuerda tu último look.
  - **Compartir el look como imagen**: un escaparate de Vestia (toldo, pespunte, tu maniquí o tu foto vestidos, las prendas, la paleta y la armonía) listo para Instagram o WhatsApp.
  - **Diario y calendario**: «Me lo pongo hoy» apunta el look del día y suma las veces puestas de cada prenda. El calendario del mes muestra qué llevaste cada día, puedes planificar looks para días futuros y Vestia te avisa si repites un look. También lleva la cuenta de tu racha de días.
- **Vistelo AI**: test de color, tono de piel y chat de estilo:
  - look de hoy según el tiempo;
  - leer el enlace de una tienda;
  - novedades de tus marcas;
  - maleta cápsula y estadísticas de tu armario.
- **Drops**: noticias reales de tus marcas, analizador de enlaces, lista de deseos, marcas recomendadas y huecos del armario.
  - **Avisos de bajada de precio**: cada vez que abres la app (como mucho cada 12 horas) Vestia vuelve a mirar el precio de tu lista de deseos. Si algo baja, lo marca (precio tachado y porcentaje), pone un punto en Drops y, si lo activas, te manda una notificación. Sin servidor no puede vigilar los precios con la app cerrada.
- **Perfil**: datos, maniquí, Vistelo AI (visión avanzada y recorte con IA), apariencia, modo demo y copias de seguridad.
  - **Pasar el armario a otro móvil con QR**, sin cuentas: el móvil que envía muestra un código, el otro lo escanea y responde con otro código, y el armario completo (prendas, looks y diario) pasa directamente de un móvil a otro. También se puede enviar como archivo (AirDrop, WhatsApp…).
  - **Tu servidor Vestia** (opcional y gratis, ver más abajo): tu armario sincronizado en todos tus móviles, consultable desde cualquier sitio y con tu **mini Vestia** pública.
  - **Tarjeta Vestia con QR**: una mini versión de ti (tu avatar, tu nombre, tu maniquí con el último look, tus cifras y tu paleta) con un código QR:
    - **Mini Vestia pública**: quien lo escanee ve tu escaparate (perfil, armario colgado en barras y looks). Solo funciona si la activas, y nunca muestra precios, notas ni tu diario.
    - **Vincular otro móvil**: escanéalo con tu otro iPhone y tendrá el mismo armario, sincronizado. Da acceso completo: no lo compartas.
- **Diseño** (boutique-taller de costura):
  - telón de teatro animado (focos, pliegues que se recogen en ola, destello de luz);
  - el armario es una **barra con perchas**: cada prenda cuelga de su percha y se balancea al aparecer y al tocarla;
  - cabeceras como **etiquetas tejidas**, separadores como **cinta métrica**, **toldo a rayas** en las tarjetas principales, **pespuntes** en las tarjetas, avisos con forma de etiqueta colgante y un **botón cosido** que marca la pestaña activa;
  - figuras de costura en el fondo con efecto de profundidad (percha, botón, aguja, tijeras, cinta, carrete, maniquí, alfiletero, imperdible, dedal, cremallera y lazo) sobre una textura de lino;
  - cambio de sección deslizando el dedo, con indicador de página;
  - transiciones suaves.

## IA dentro del iPhone

Vistelo AI no usa servicios de IA externos: los modelos se descargan una vez y funcionan en el dispositivo.

| Función | Modelo | Descarga |
|---|---|---|
| Reconocer prendas, estampados, materiales y estilo | MobileCLIP S0 (Apple) | ~25 MB |
| Recortar el fondo de las fotos | RMBG-1.4 (BRIA AI) | ~44 MB |
| Leer la etiqueta de la prenda | Tesseract (español e inglés) | ~6 MB |
| Detectar tu postura (probador con tu foto) | MediaPipe Pose Landmarker lite (Google) | ~15 MB |
| Leer y crear códigos QR | jsQR y qrcode-generator | ~0,2 MB |

El recorte con IA usa la gráfica del iPhone (WebGPU) cuando está disponible, y si no, el procesador. Sin el modelo de recorte, la app usa un **recorte rápido** propio que funciona bien con fondos lisos.

> RMBG-1.4 es gratuito para uso personal y no comercial. Si algún día quieres vender la app, necesitarás una licencia comercial de BRIA o cambiar de modelo.

## Privacidad

Tus fotos y tu armario **no salen del iPhone** (salvo que conectes tu propio servidor): se guardan en el propio navegador (IndexedDB). Vestia solo se conecta para:

- descargar una vez los modelos de visión y de recorte (Hugging Face), las librerías que los ejecutan, el lector de etiquetas y el de QR (jsDelivr) y el detector de postura (jsDelivr y Google);
- leer las webs, enlaces, noticias y precios de tu lista de deseos. Para ello usa el lector público `r.jina.ai`, que solo recibe la dirección pública de la página;
- consultar el tiempo con tu ubicación aproximada (Open-Meteo), solo cuando pides el «look de hoy»;
- al pasar el armario a otro móvil, los dos móviles se conectan directamente (WebRTC, cifrado). Un servidor público de Google (STUN) solo les ayuda a encontrarse; tus prendas no pasan por él.
- si conectas **tu servidor Vestia**, tu armario, tus looks, tu diario y tu lista de deseos se guardan también en tu propia cuenta de Cloudflare, protegidos con una clave que solo conocen tus móviles. La mini Vestia pública solo existe si la activas y nunca enseña precios, notas ni tu diario.

Tu foto del probador se guarda solo en tu iPhone y puedes borrarla desde el Probador.

No hay cuentas obligatorias ni costes.

## Tu servidor Vestia (opcional)

[`servidor.js`](servidor.js) es un servidor completo en un solo archivo que funciona gratis en Cloudflare Workers:

- **sincroniza** tu armario (prendas, looks, diario y perfil) entre todos tus móviles;
- **lo deja consultar** con una API (abajo);
- publica tu **mini Vestia**, la página que abre el QR de tu tarjeta;
- **vigila los precios** de tu lista de deseos aunque la app esté cerrada (con el disparador programado);
- hace de **lector web** para Vistelo (sustituye a `worker.js`; el antiguo `worker.js` sigue funcionando si ya lo tenías).

### Montarlo (unos 5 minutos)

1. Crea una cuenta gratis en [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Storage & Databases → KV → Create**: llámalo `VESTIA`.
3. **Workers & Pages → Create → Worker**, ponle de nombre `vestia-servidor` y pulsa **Deploy**.
4. **Edit code**: borra lo que hay, pega el contenido de `servidor.js` y pulsa **Deploy**.
5. En el Worker: **Settings → Bindings → Add → KV namespace**, nombre de variable `VESTIA`, y elige el KV del paso 2.
6. (Opcional) **Settings → Triggers → Cron**: `0 */6 * * *` para vigilar precios cada 6 horas.
7. Copia la dirección del Worker (termina en `.workers.dev`) y pégala en **Perfil → Tu servidor Vestia → Conectar**.

Al conectar, Vestia crea tu armario en el servidor y sube todo. Desde ahí cada cambio se sincroniza solo. Para añadir otro móvil, abre **Mi tarjeta QR → Vincular otro móvil** y escanéalo con él.

### Consultar tu armario (API)

`ID` es tu identificador (aparece en Perfil). Las rutas marcadas con 🔒 necesitan la cabecera `Authorization: Bearer TU_CLAVE`; las demás solo responden si tu mini Vestia es pública (si no, también con la clave). Perfil → Tu servidor Vestia → **Consultar** lo hace por ti con filtros.

| Ruta | Qué devuelve |
|---|---|
| `GET /u/ID` | Tu mini Vestia (página web) |
| `GET /api/u/ID` | Resumen: perfil, número de prendas y enlace |
| `GET /api/u/ID/prendas` | Prendas, con filtros: `?tipo=vaqueros&zona=inferior&color=azul&marca=zara&temporada=invierno&estilo=casual&caida=oversize&q=lino` |
| `GET /api/u/ID/prendas/PRENDA` | Una prenda |
| `GET /api/u/ID/img/PRENDA` | La foto recortada de una prenda |
| `GET /api/u/ID/looks` | Looks guardados |
| `GET /api/u/ID/estadisticas` | Cifras: prendas por tipo, color, marca, zona… |
| `GET /api/u/ID/diario` 🔒 | Tu diario |
| `GET /api/u/ID/precios` 🔒 | Precios vigilados de tu lista de deseos |
| `GET /api/u/ID/indice` 🔒 | Índice de sincronización |

Sin la clave nunca se ven precios ni notas. Si pierdes todos tus móviles, la clave se pierde con ellos: haz también copias de seguridad.

### Solo lector web (opcional)

Si únicamente quieres que Vistelo lea mejor las tiendas, sin sincronizar nada, pega la dirección de tu servidor (o del antiguo [`worker.js`](worker.js)) en **Perfil → Vistelo AI → Qué sale de tu iPhone → Lector web propio**. Al conectar tu servidor Vestia esto se configura solo.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo llamado `vestia` en GitHub.
2. Sube todos los archivos de esta carpeta (todos van sueltos, sin subcarpetas: es más fácil subirlos desde la web de GitHub). La carpeta oculta `.claude/` es solo para pruebas locales y no hace falta subirla.
3. Ve a **Settings → Pages → Build and deployment**, elige *Deploy from a branch*, la rama `main` y la carpeta `/ (root)`.
4. Al cabo de un minuto la app estará en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPOSITORIO/` (respeta mayúsculas y minúsculas).

Desde la terminal:

```bash
git init && git add . && git commit -m "Vestia v3 con Vistelo AI" && git branch -M main
git remote add origin https://github.com/TU-USUARIO/vestia.git && git push -u origin main
```

## Instalar en el iPhone

1. Abre la URL en **Safari**.
2. Pulsa **Compartir** → **Añadir a pantalla de inicio**.
3. Vestia se abre a pantalla completa, con su icono, y funciona sin conexión, salvo la lectura de webs y el tiempo.
4. La primera vez que midas tu piel, Safari te pedirá permiso para usar la cámara.

## Probar en local

```bash
python3 -m http.server 8000
```

Abre <http://localhost:8000>. La cámara solo funciona en `localhost` o con HTTPS, como en GitHub Pages.
