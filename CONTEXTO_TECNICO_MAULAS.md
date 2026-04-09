# Contexto Técnico y Reglas de Negocio - Peña Las Maulas

## 1. Introducción

Este documento sirve como "memoria de seguridad" centralizada para cualquier asistente de IA o desarrollador que retome el proyecto tras una pérdida de contexto. Contiene las **reglas de negocio complejas, excepciones y arquitectura principal** que serían muy lentas y difíciles de inferir únicamente leyendo el código fuente.

## 2. Arquitectura y Tecnologías

- **Frontend**: HTML5, CSS (Vanilla), JS (Vanilla). Sin frameworks pesados.
- **Backend/Base de Datos**: Firebase (`firebase-init.js`, `db-service.js`).
- **Módulos JS (Carpeta `/js/`)**:
  - `bote.js`: Núcleo financiero de la peña (ingresos, repartos, costes variables, dobles, evolución del bote, penalizaciones). El archivo más grande y complejo.
  - `pronosticos.js`: Gestión de las apuestas individuales y la columna combinada (MAULA). Incluye **auto-guardado silencioso**, lógica de desmarcado de signos y notificaciones de completado basadas en frases aleatorias.
  - `scoring.js`: Lógica de puntuación (bonificaciones, penalizaciones, lógica PIG/Pleno al 15).
  - `resumen-temporada.js`: Clasificación acumulada de la temporada y estadísticas por socio.
  - `dashboard.js`: Panel de inicio con el líder actual, próxima jornada, premios semanales y **asignación dinámica de roles** (Sella/Rellena).
  - `rss-importer.js`: Motor de extracción de datos, partidos y resultados desde fuentes de terceros.
  - `telegram-service.js`: Integración de notificaciones y recordatorios automatizados.

## 3. Lógica Financiera y Gestión del Bote (Crítico)

### 3.1. Cálculo del Bote Individual

El bote de cada socio es dinámico y su saldo en cada jornada es el resultado de la siguiente ecuación:
`Saldo Anterior` + `Ingresos Manuales/Bizum` + `Premios Ganados` - `Coste Apuesta Individual` - `Coste Parte Proporcional de Dobles` - `Penalizaciones` - `Repartos Aprobados`

- **Ingresos y Premios**: Sumandos positivos. Los premios se contabilizan cruzando la base de premios reales con la puntuación de cada socio.
- **Coste Apuesta Individual**: Se resta automáticamente su importe por participar (generalmente 0.75€).
- **Repartos del Bote**: Se registran como un **evento de extracción única** en fechas concretas y bajo demanda (ej. fin de temporada o un bote muy abultado). *Regla clave:* Un reparto restado un día concreto NUNCA debe arrastrarse mes a mes en la gráfica de evolución del bote como si fuera un gasto recurrente.

### 3.2. Columnas de Dobles (Sello de la Peña)

El grupo juega una quiniela extra grupal combinada.

- **Coste Variable**: Ya no es un costo fijo (antes 26,25€). Se calcula dinámicamente en base al coste real de la combinación (dobles/triples) generada en esa jornada.
- **Participación**: El coste total de esta columna se "prorratea" entre todos los socios que participan.
- **Reducciones y Premios**: Cuando la peña sella una quiniela reducida o con condiciones complejas, el "Escrutinio Real" (que se puede visualizar en el simulador) detalla los premios en todas las combinaciones que arroja el desarrollo de la reducida (desglose mostrando de forma transparente cuántas apuestas han tenido 10, 11, 12, 13, 14, o el Pleno al 15). Existen listados de premios separados. Si la columna de Dobles es premiada, cuenta como un premio comunal que engrosa los saldos correspondientes (existen vistas específicas solo para estos premios).

### 3.3. Jugar Gratis y Penalizaciones

- **Jugar Gratis en la jornada**: Un socio no paga su cuota individual en una ronda *sólo si el grupo en su conjunto ganó algún premio económico en la jornada anterior*. Ser el ganador de aciertos de la semana no da la gratuidad por sí mismo, la condición es que se haya ingresado dinero.
- **Penalizaciones por "Unos"**: Existe un sistema que impone una multa monetaria (se resta de su bote) si un socio envía su boleto con una cantidad exagerada/restringida de signos "1". Un filtro de riesgo.
- **Penalizaciones por Clasificación (Cierre de Vuelta/Temporada)**: Al final de la primera vuelta y al final de la temporada, se cobran penalizaciones a los socios basándose en su clasificación. Los cobros escalan desde el 2º clasificado (0,50€) hasta el último (5,00€), estando el 1º exento. En caso de empates en puntos, se desempata por la diferencia entre ganancias y pérdidas de cada ronda, luego a favor del de mayores ganancias totales, y si persiste el empate absoluto se dividirá la suma de las penalizaciones de los puestos compartidos entre los empatados.

### 3.4. Vista Excel y Retrospectiva Histórica

Para facilitar la transición del antiguo sistema de hojas de cálculo al entorno web, la aplicación dispone de una **"Vista Excel (Histórico Detallado)"** ubicada en el Bote de la plataforma.

- **Cálculo Real, no Estático:** Esta vista **no** carga datos pasivos desde ningún archivo `.xlsx`. Toda la información (sellados, recaudación total, ingresos, gastos, premios, ganancias y pérdidas y cuotas de dobles variables) es fruto de la simulación iterativa en tiempo real de la base de datos de Firebase, pasando por el motor de transacciones hasta recrear los mismos resultados que emitiría una tabla tradicional.
- **Orden Heredado:** Mantiene intencionadamente la matriz de ordenamiento de filas caprichosa original o "rara" de la peña (orden alfabético estricto, excepto variaciones históricas toleradas como la de `Valdi` situado cerca de la `J` por José Antonio Valdivieso) para ayudar a la agilidad visual y memoria de los gestores clásicos de la Peña.

## 4. Lógica de Puntuación — Reglas Críticas

### 4.1. Fórmula General (`scoring.js`)

`Puntos = Aciertos + Bonificación/Penalización`

Las bonificaciones (10–15 aciertos) y penalizaciones (0–3 aciertos) son configurables desde el panel de Administración y se almacenan con historial por fecha en `localStorage`.

### 4.2. Lógica del Pleno al 15 (PIG y Ordinarias)

Se ha establecido una regla global de exclusión para el partido número 15 (el Pleno al 15):

- **Exclusión Universal**: El partido 15 **NUNCA se computa en el recuento numérico de aciertos** (`hits`) utilizado para los puntos de la temporada. Los puntos se calculan exclusivamente sobre los 14 primeros partidos.
- **Sin descuentos manuales**: Se ha eliminado la antigua lógica de "descontar 1 acierto" si se acertaba el PIG, ya que ahora el sistema base (en `scoring.js`) directamente ignora el índice 14 para la suma de aciertos.
- **Jornadas PIG (Interés General)**: Cuando el pleno al 15 involucra a equipos grandes (Madrid, Barça, Atleti), la jornada se marca como PIG. En estos casos, aunque no sume puntos, el sistema realiza un **seguimiento detallado** de quién acierta y quién falla para su mención especial en informes y Telegram.

### 4.3. Consistencia entre Dashboard y Resumen Temporada

**⚠️ Regla clave:** `dashboard.js` y `resumen-temporada.js` deben usar **exactamente el mismo algoritmo** para calcular la puntuación de cada socio. Las tres diferencias que causaron inconsistencias en el pasado (y que ya están corregidas) fueron:

1. **Filtro de jornadas**: solo cuentan las jornadas con `j.active && resultado !== '' && AppUtils.isSunday(fecha)`. Sin el filtro de domingo, se incluían jornadas incorrectas.
2. **Comparación de IDs**: usar `==` (laxa) en vez de `===` (estricta), porque Firestore puede devolver los IDs como string o como número indistintamente.
3. **Lógica PIG**: aplicar el descuento del partido 15 en ambos módulos.
4. **Roles de Jornada**: El dashboard muestra siempre quién tiene asignados los roles de "Sella la Quiniela" (✍️) y "Rellena de Dobles" (🍻) para la jornada en curso o la siguiente disponible, especificando siempre el número de jornada para evitar confusiones.

### 4.4. Cálculo Diferido de Penalizaciones y Bonus

Para evitar que la clasificación se desvirtúe durante el transcurso de una jornada (por ejemplo, mostrando -5 puntos a todos al empezar por tener 0 aciertos), se aplica un **Cálculo Diferido**:

- **Jornada en Curso:** Mientras la jornada esté activa y con partidos por jugar, solo se muestran los **aciertos reales**. Los totales de temporada solo suman esos aciertos, sin aplicar bonus (10-15) ni penalizaciones (0-3 o por retraso).
- **Jornada Finalizada:** Las bonificaciones y penalizaciones solo se consolidan cuando se considera que la jornada ha terminado. Los criterios para esto son:
    1. Que tenga los **15 resultados oficiales** grabados.
    2. Que el administrador la marque como **inactiva**.
    3. Que hayan pasado más de **2 días** desde el domingo de la jornada (margen de cierre automático).
- **Control Visual "Late":** La marca de `LATE` (fuera de plazo) es la única que aparece en tiempo real, aunque su efecto en puntos (bajar a 0 los aciertos) no se ejecute hasta el cierre de la jornada.

## 5. Obtención de Datos: Partidos, Resultados y Escrutinio

Históricamente el sistema ha consumido datos de diferentes administraciones de loterías y periódicos, enfrentando cortes y cambios de estructura (web scraping inestable).

- **RSS de Loterías y Apuestas del Estado**: Usado preferentemente para obtener la lista oficial de partidos (quién juega contra quién).
- **El País (RSS, Web Parse o PDF)**: Es la fuente principal o secundaria para extraer aciertos, resultados (M-1, 2-M) y recompensas monetarias.
- **Adaptaciones Parches**: El fichero `rss-importer.js` cuenta con múltiples parches en la función `parseElPaisHTML` para procesar tablas irregulares sin guiones separadores entre equipos o en columnas asimétricas. Si algo falla importando, el culpable suele ser un cambio en el DOM del periódico.
- **Conversión de Resultados**: Resultados de goleadas a veces salen como "M-0" o "2-M", el sistema debe normalizarlos a signos absolutos de quiniela (`1`, `X`, `2`) para poder baremar a los socios.
- **Rápida Introducción Manual**: Desde el panel de administración, los resultados se introducen cómodamente mediante botoneras interactivas (1, X, 2 para los 14 primeros partidos; y dos selectores independientes 0, 1, 2, M para el Pleno al 15 local y visitante). Toda esta ventana emergente es totalmente responsiva y escalable en dispositivos móviles.

### 5.4. Filtro de Relevancia por División

Para evitar la importación de jornadas que no corresponden a la competición principal de la Peña (como jornadas exclusivas de Segunda División o parones internacionales de selecciones), el sistema aplica un filtro estricto:

- **Regla Primera División**: Una jornada solo se importa si al menos uno de sus 15 partidos involucra a un equipo de la **Primera División española (LaLiga EA Sports)**.
- **Implementación**: El método `hasPrimeraTeams` en `rss-importer.js` realiza esta comprobación cruzando los equipos de la jornada con el listado de palabras clave definido en `AppUtils.isLaLigaTeam` (`js/utils.js`).
- **Mantenimiento Estacional**: Dado que hay ascensos y descensos, el listado de equipos en `js/utils.js` (y su fallback en `rss-importer.js`) **debe actualizarse manualmente al inicio de cada temporada** para reflejar los 20 equipos que componen la Primera División ese año. Si el sistema empieza a importar jornadas de Segunda por error (como ocurrió con la J51 de la temporada 25/26), es señal de que la lista contiene equipos descendidos como Valladolid, Leganés o Las Palmas.

## 6. Tabla de Resultados y "Columna MAULA"

En la Vista Cuadrante / Panel de Partidos o de Resultados se enfrentan los boletos introducidos por cada jugador con los resultados oficiales.

### La Columna MAULA (Consenso de la Peña)

Se genera de forma sintética lo que sería el "voto popular" del grupo:

1. Para el Partido 1, se suma cuántos socios han votado '1', cuántos 'X', cuántos '2'.
2. El signo vencedor por **mayoría absoluta** pasa a ser el signo de la "Columna MAULA" para ese partido.
3. Esto se repite para los 15 plenarios. Este pronóstico estadístico se enfrenta a la realidad, demostrando con frecuencia si la sabiduría popular de la peña es mejor que el voto individual de sus integrantes.
4. **Desempates/Ganadores Semanales**: Cuando en la tabla de resultados varios miembros empatan a aciertos, se utilizan reglas algorítmicas (vía función `resolveTie`) para decidir quién recibe la corona o el farolillo rojo. El desempate se realiza mirando hacia atrás en las jornadas anteriores (**Puntos Históricos**) de forma recursiva hasta deshacer el empate. Si persiste, el ganador es el de menor ID (socio más antiguo) y el perdedor el de mayor ID.
5. **Ordenación de la Lista de Resultados (Informes)**: Para que el mensaje de resultados sea coherente con la elección del ganador y el perdedor, la lista se ordena siguiendo este orden estricto de prioridad:
    - **Estado de Penalización**: Los "Offenders" (no jugados o sellados tarde sin perdón) aparecen siempre al final de la lista, independientemente de sus puntos.
    - **Puntos de la Jornada**: Orden descendente.
    - **Aciertos de la Jornada**: Orden descendente.
    - **Desempate por Historial**: Si hay empate en puntos/aciertos, se comparan los puntos de jornadas anteriores (J-1, J-2...) una a una.
    - **Fallback ID**: Menor ID arriba, mayor ID abajo.
6. **Identificación de Penalizaciones en Tabla**:
    - **Cero Natural (0 aciertos)**: La casilla mantiene el color normal (blanco o el color de Maula/líder) y muestra el "0".
    - **Cero por Penalización (Retraso)**: La casilla se vuelve **negra con el número de aciertos potenciales tachado en gris** (ej: ~~12~~). Esto permite distinguir de un vistazo quién no acertó de quién fue sancionado.
    - El tachado se aplica con un estilo evidente (`line-through double`) para evitar confusiones.

## 7. Sistema de Pronósticos y Experiencia de Usuario (UX)

El módulo `pronosticos.js` ha evolucionado para minimizar la pérdida de datos y mejorar la agilidad:

- **Auto-guardado Silencioso**: No es necesario pulsar "Guardar". Cualquier cambio se registra en Firebase tras 800ms de inactividad del usuario.
- **Control de Plazos Automático**: Si un socio modifica un signo después del `deadline` calculado (jueves 17:00), el registro se marca automáticamente como `late: true` para su posterior penalización.
- **Ayuda al Sellado de Dobles (Sello de la Peña)**:
  - Se ha implementado un sistema de **Marcado Dinámico** sobre imágenes reales (Boleto Físico e Interfaz Web de Loterías).
  - **Universalidad**: El botón está disponible para todos los socios. El sistema busca automáticamente el pronóstico de dobles guardado para la jornada activa (independientemente de quién lo haya rellenado) y genera una "plantilla visual".
  - **Marcas de Precisión**: Dibuja cruces rojas (`X`) sobre el boleto indicando los 14 signos, el Pleno al 15, el número de dobles en la columna de combinaciones y las casillas de reducción correspondientes.
  - **UX Adaptativa**: El modal de ayuda aprovecha el máximo de pantalla en PC (98% ancho) y permite alternar vistas en dispositivos móviles mediante pestañas.
- **Lógica de Desmarcado y Borrado Total**:
  - Pinchando de nuevo en un signo seleccionado, este se desmarca (queda vacío).
  - Se ha incorporado un botón de **"Borrar Todo el Pronóstico"** (`#btn-clear-forecast`) que permite vaciar todos los campos de una vez. La lógica de guardado permite persistir este estado vacío para facilitar el borrado manual de registros erróneos.
- **Tratamiento de Pronósticos Vacíos ("No Juzgados")**: Para evitar penalizaciones injustas (puntos negativos por tener 0 aciertos) y ruido visual, cualquier pronóstico que esté totalmente vacío o solo contenga guiones (`"-"`) se detecta automáticamente como **"No jugado"** en toda la aplicación (Resultados, Resumen de Temporada y Dashboard).
- **Notificación de Éxito**: Al completar los **14 primeros signos**, salta una alerta con una frase maulera aleatoria (50ms de retardo) confirmando el guardado. El Pleno al 15 no dispara la alerta para permitir que se decida al final.
- **Adaptación y UX en Móvil**:
  - **Sizing Dinámico**: En la vista colectiva de jornadas, el sistema detecta el ancho del dispositivo (`window.innerWidth <= 768`) y reduce proporcionalmente el tamaño de fuentes y celdas para optimizar la visibilidad.
  - **Scroll Horizontal Nativo**: El contenedor del modal utiliza `display: block` y `-webkit-overflow-scrolling: touch` para garantizar un desplazamiento fluido de la tabla en pantallas pequeñas.
  - **Botón de Cierre Flotante**: Se incluye un botón flotante (`Volver a Pronósticos`) en la parte inferior exclusivo para móviles, facilitando la navegación sin depender de la "X" superior de difícil alcance.
- **Visualización Técnica**: La tabla resumen de la peña incluye un **doble scroll horizontal** (barra superior e inferior) para facilitar la consulta de columnas de socios sin desplazarse al final de la página.
- **Soporte Extendido de Escudos (`js/utils.js`)**: El sistema mapea y normaliza dinámicamente nombres de equipos hacia ficheros locales en múltiples directorios (`escudos/primera/`, `escudos/segunda/` y `escudos/OTROS/` incluyendo equipos como Alcorcón, Ibiza, Marbella, Mérida, Ferrol, Pontevedra, etc.).
- **Auditoría de Correcciones**:
  - Al modificar una jornada cerrada (Modo Corrección), se activa un **Modal de Auditoría** obligatorio de alta visibilidad (`z-index: 9,000,000`).
  - La visibilidad de las ventanas se gestiona mediante la clase `.active`, asegurando que la opacidad pase a 1 y el sistema no quede bloqueado de forma invisible.
  - Se registra el motivo del cambio en el log de modificaciones de Firebase.

## 8. Comunicaciones y Notificaciones: Telegram

- Existe un servicio (`telegram-service.js`) que ejerce como "Bot", conectado a la API de Telegram.
- **Por Fin es Jueves**: Una rutina con días, hora, fechas límite de intervalo ("Date Range") definibles, que lanza recordatorios a los socios para que rellenen su pronóstico si no lo han sellado todavía.
- El administrador puede definir mediante el panel de control o por variables el mensaje customizado de ese aviso semanal.
- **Recordatorio Especial PIG**: Si la jornada activa es de tipo PIG (Pleno al 15 con Grandes Clubes), el mensaje de notificación incluirá automáticamente una coletilla extra recordando a los socios "sellar también el PIG".
- **Informe de Resultados**: Cuando finaliza una jornada, el bot envía el resumen detallado. La lista de socios sigue las reglas de ordenación y desempate históricas (punto 6.5) para que el podio (🥇, 🥈, 🥉) y el encargado de sellar (✍️) coincidan con el orden visual. Si hay PIG, se detalla la lista de socios bajo los epígrafes "✅ Acertantes" y "❌ Fallan". La sección de premio especial de dobles se identifica con una jarra de cerveza (`🍺`).
- **Notificación de Perdón**: Cuando un administrador anula/perdona una sanción por retraso desde la tabla de resultados, el bot envía un mensaje indicando qué socio ha perdonado a quién y de qué jornada se trata. Este mensaje es de carácter informativo obligatorio y no se puede desactivar desde el panel de configuración (siempre que Telegram esté activo).

## 9. Identidad Visual y Estilo

- **Colores de Acción**: Los botones críticos de previsualización de cierres y cobros en el Bote utilizan un azul oscuro profundo (`#0d47a1`) para diferenciarse de acciones secundarias.
- **Tipografía**: Basada en 'Inter', 'Montserrat' y 'Outfit' para máxima legibilidad en tablas densas de datos y paneles de control.
- **Feedback Visual**: Las notificaciones de éxito y errores utilizan la paleta semántica estándar de la web (verde para éxitos, naranja para advertencias/retrasos, rojo para errores críticos).

## 10. Funcionalidades Descartadas / Para el Futuro

### Importación desde Google Sheets (Descartada temporalmente)

Se desarrolló y luego eliminó una funcionalidad completa para importar pronósticos directamente desde las hojas de cálculo de Google Drive (carpeta "CAMPEONATO 2025-2026"). La implementación fue:

- **Módulo**: `js/sheets-importer.js` (eliminado)
- **Mecanismo**: Lectura de hojas públicas via URL de exportación CSV (`/gviz/tq?tqx=out:csv&sheet=...`) — sin API key ni autenticación.
- **Flujo**: Selección de jornada → verificación de partidos (≥10/15 coincidencias) → modal de confirmación con tabla de pronósticos → guardado en Firestore con precedencia del Excel sobre la web.
- **Por qué se eliminó**: Era una solución temporal para el final de la temporada 2025-2026 y no merecía el mantenimiento a largo plazo.
- **Si se reactiva en el futuro**: La lógica completa está documentada aquí. El patrón de fetch es `https://docs.google.com/spreadsheets/d/{ID}/gviz/tq?tqx=out:csv&sheet={NombrePestaña}`. La estructura de la hoja "Pronósticos": fila 1 = nombres de socios (col B en adelante); filas 2-16 = signos (1/X/2). La hoja "Partidos": col A = equipo local, col B = equipo visitante, col C = resultado.

---

## Recomendación de Flujo para la IA

Cuando le pidas a una IA que retome el proyecto, la mejor instrucción es:

1. **"Lee el fichero `CONTEXTO_TECNICO_MAULAS.md` para entender las reglas."**
2. Dale permisos para explorar tu carpeta de proyecto.
3. Indícale en qué vista de la web o qué archivo quieres que se enfoque y qué error concreto ocurre.

*(Nota: Este archivo debe editarse y actualizarse cada vez que implementemos una regla de negocio nueva que sea compleja de entender para alguien externo).*
