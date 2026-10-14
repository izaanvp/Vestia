# Vestia — armario virtual con Vistelo AI

Vestia es una web app (PWA) para iPhone que convierte tu ropa en un armario digital, con vestidor virtual, test de color y **Vistelo AI**, una estilista que funciona dentro del propio iPhone.

## Funciones

- **Armario**
  - **Escáner de prendas**: haz una foto con la cámara o elige una de la galería. Vistelo AI recorta el fondo con precisión (también si la prenda está sobre la cama o el suelo), la digitaliza y detecta:
    - el tipo de prenda, con su porcentaje de seguridad y alternativas;
    - sus colores principales;
    - el estampado, el material y el estilo.

    Un comparador antes/después te enseña el recorte, y puedes ajustarlo antes de guardarlo.
  - Las fotos que subes también se recortan automáticamente.
  - Ficha de cada prenda con todas sus especificaciones, colores y combinaciones.
  - Puedes organizarlo por **tipo**, **color** o **marca**.
- **Vestidor**
  - **Maniquí personalizable**:
    - figura (mujer, hombre o neutro sin pelo) y complexión;
    - tono de piel (cámara, foto o selección);
    - siete peinados y color de pelo;
    - barba y rasgos de la cara.
  - **Ropa confeccionada a medida**: cada prenda se dibuja sobre el cuerpo del maniquí, siguiendo su postura y medidas (mangas, perneras, cuellos, botones, canalé, pliegues, solapas, cinturones), con el color y el material de la prenda real. Los estampados se toman de la foto. Si lo prefieres, el modo «Foto» pone la imagen original.
  - «Completar con Vistelo», «Sorpréndeme», análisis del look con tu piel, ideas por ocasión y looks guardados. El maniquí recuerda tu último look.
- **Vistelo AI**: test de color, tono de piel y chat de estilo:
  - look de hoy según el tiempo;
  - leer el enlace de una tienda;
  - novedades de tus marcas;
  - maleta cápsula y estadísticas de tu armario.
- **Drops**: noticias reales de tus marcas, analizador de enlaces, lista de deseos, marcas recomendadas y huecos del armario.
- **Perfil**: datos, maniquí, Vistelo AI (visión avanzada y recorte con IA), apariencia, modo demo y copias de seguridad.
- **Diseño**:
  - telón de teatro animado (focos, pliegues que se recogen en ola, destello de luz);
  - figuras de costura en el fondo con efecto de profundidad;
  - cambio de sección deslizando el dedo, con indicador de página;
  - transiciones suaves.

## IA dentro del iPhone

Vistelo AI no usa servicios de IA externos: los modelos se descargan una vez y funcionan en el dispositivo.

| Función | Modelo | Descarga |
|---|---|---|
| Reconocer prendas, estampados, materiales y estilo | MobileCLIP S0 (Apple) | ~25 MB |
| Recortar el fondo de las fotos | RMBG-1.4 (BRIA AI) | ~44 MB |

El recorte con IA usa la gráfica del iPhone (WebGPU) cuando está disponible, y si no, el procesador. Sin el modelo de recorte, la app usa un **recorte rápido** propio que funciona bien con fondos lisos.

> RMBG-1.4 es gratuito para uso personal y no comercial. Si algún día quieres vender la app, necesitarás una licencia comercial de BRIA o cambiar de modelo.

## Privacidad

Tus fotos y tu armario **nunca salen del iPhone**: se guardan en el propio navegador (IndexedDB). Vestia solo se conecta para:

- descargar una vez los modelos de visión y de recorte (Hugging Face) y la librería que los ejecuta (jsDelivr);
- leer las webs, enlaces y noticias que pides. Para ello usa el lector público `r.jina.ai`, que solo recibe la dirección pública de la página;
- consultar el tiempo con tu ubicación aproximada (Open-Meteo), solo cuando pides el «look de hoy».

No hay cuentas, claves ni costes.

### Lector web propio (opcional)

Algunas tiendas bloquean a los lectores automáticos, y el lector público tiene un límite de peticiones. Si quieres más fiabilidad, despliega gratis tu propio lector en Cloudflare Workers con el archivo [`proxy/worker.js`](proxy/worker.js). Después pega su dirección en **Perfil → Vistelo AI → Qué sale de tu iPhone → Lector web propio**.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo llamado `vestia` en GitHub.
2. Sube el contenido de esta carpeta: `index.html`, `css/`, `js/`, `icons/`, `proxy/`, `manifest.json`, `sw.js`, `.nojekyll` y `.gitignore`. La carpeta `.claude/` es solo para pruebas locales y no hace falta subirla.
3. Ve a **Settings → Pages → Build and deployment**, elige *Deploy from a branch*, la rama `main` y la carpeta `/ (root)`.
4. Al cabo de un minuto la app estará en `https://TU-USUARIO.github.io/vestia/`.

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
