# GUÍA PASO A PASO: PUBLICAR TU WEB (PARA PRINCIPIANTES)

No te preocupes, es normal perderse al principio. Vamos a ir muy despacio.

Tú tienes ahora mismo tu web "terminada" en tu carpeta `D:\PROYECTO_MAULAS`. Pero solo está ahí, en tu disco duro.
Para que los demás la vean, necesitamos subirla a una "nube" llamada **GitHub**.

Sigue estos pasos EXACTOS.

### PARTE 1: Preparar GitHub Desktop (Solo se hace una vez)

1.  **Abre el programa "GitHub Desktop"**.
2.  Si es la primera vez que lo abres, te pedirá iniciar sesión (`Sign in`).
    *   Si ya creaste cuenta en la web de GitHub.com, usa esos datos.
    *   Si no, verás un enlace para "Create your free account" (Crear cuenta gratuita). Hazlo, confirma tu email y vuelve al programa.
3.  Una vez dentro del programa, verás una pantalla de bienvenida con opciones como "Create a tutorial repository", etc. **NO toques eso**.

### PARTE 2: Conectar tu carpeta (Crear el Repositorio)

1.  En GitHub Desktop, ve al menú de arriba del todo: **File** (Archivo) -> **Add Local Repository...** (Añadir repositorio local).
2.  Se abrirá una ventanita. Pulsa el botón **Choose...** (Elegir).
3.  Navega por tu disco duro y selecciona TU carpeta: `D:\PROYECTO_MAULAS`.
4.  Pulsa "Select Folder" (Seleccionar carpeta).
5.  Ahora verás un mensaje rojo o de aviso que dice algo como: *"This directory does not appear to be a Git repository"*. **ESTO ES CORRECTO**.
6.  Justo debajo de ese mensaje, habrá un pequeño enlace azul que dice: **Create a repository here** (Crear un repositorio aquí). **PÚLSALO**.
7.  Se abrirá otra ventana ("Create a New Repository").
    *   En **Name**, pon: `web-maulas` (o lo que quieras, pero sin espacios raros).
    *   Deja lo demás como está.
    *   Pulsa el botón azul **Create Repository**.

### PARTE 3: Subir la web a Internet

1.  Ahora GitHub Desktop ya "controla" tu carpeta.
2.  Busca un botón azul arriba a la derecha que dice **Publish repository**. Púlsalo.
3.  Saldrá una ventana:
    *   **Name**: `web-maulas`.
    *   **IMPORTANTE**: Desmarca la casilla que dice "Keep this code private" (Mantener código privado). **Tiene que estar DESMARCADA** para que sea gratis y público.
    *   Pulsa **Publish repository**.
4.  Espera a que termine la barra de carga.

### PARTE 4: Activar la página web (GitHub Pages)

Ya está subido el código, ahora hay que decirle a GitHub que lo muestre como una página web.

1.  Ve a la página web: [www.github.com](https://www.github.com) e inicia sesión.
2.  A la izquierda (o arriba a la derecha en tu perfil -> "Your repositories"), deberías ver el nuevo proyecto: `web-maulas`. Entra en él.
3.  Dentro del proyecto, busca arriba una pestaña (icono de engranaje ⚙️) que se llama **Settings** (Configuración). Haz clic.
4.  En el menú de la izquierda de esa página de configuración, baja hasta encontrar el apartado **Pages** (Páginas). Haz clic.
5.  En la sección central "Build and deployment", verás un apartado **Branch**.
    *   Donde dice "None", haz clic y selecciona **main** (o master).
    *   Pulsa el botón **Save** (Guardar) que aparecerá al lado.
6.  **¡YA ESTÁ!**
    *   Espera 1 o 2 minutos. Refresca la página (F5).
    *   Arriba del todo de esa misma página aparecerá un mensaje: *"Your site is live at..."* seguido de un enlace (ej: `https://tu-usuario.github.io/web-maulas/`).

**Ese es el enlace que tienes que pasar a los socios.**

---

### ¿Y si hago cambios en el futuro? (Como ahora que he conectado la Base de Datos)

Si yo te hago cambios en el código (como los que acabo de hacer hoy):

1.  Abres **GitHub Desktop**.
2.  Verás a la izquierda una lista de los archivos que han cambiado.
3.  Abajo a la izquierda (donde pone "Summary"), escribes qué has hecho (ej: "Actualización Base de Datos").
4.  Pulsas el botón azul **Commit to main**.
5.  Pulsas el botón de arriba a la derecha **Push origin**.
6.  Esperas 2 minutos y la web se actualiza sola.

Inténtalo siguiendo estos pasos y dime si te atascas en algún punto concreto.
