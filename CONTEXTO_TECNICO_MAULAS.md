# Contexto Técnico y Reglas de Negocio - Peña Las Maulas

## 1. Introducción

Este documento sirve como "memoria de seguridad" centralizada para cualquier asistente de IA o desarrollador que retome el proyecto tras una pérdida de contexto. Contiene las **reglas de negocio complejas, excepciones y arquitectura principal** que serían muy lentas y difíciles de inferir únicamente leyendo el código fuente.

## 2. Arquitectura y Tecnologías

- **Frontend**: HTML5, CSS (Vanilla), JS (Vanilla). Sin frameworks pesados.
- **Backend/Base de Datos**: Firebase (`firebase-init.js`, `db-service.js`).
- **Módulos JS (Carpeta `/js/`)**:
  - `bote.js`: Interfaz de usuario del bote, desglose visual de saldos, extractos, gráficos y simulación histórica de la peña.
  - `bote-engine.js`: Motor matemático desacoplado de finanzas (saldos individuales, costes variables de dobles, exenciones automáticas, timeline de transacciones, repartos y liquidaciones de temporada).
  - `dice-service.js`: Servicio del "Dado de Quinielas" (🎲), automatización de sellado aleatorio para socios ausentes o de viaje dentro de rangos de fechas definidos (máximo 3 jornadas por temporada).
  - `text-importer.js`: Analizador inteligente de texto copiado de webs externas (Revista Quinielista y Loterías y Apuestas del Estado) para importar jornadas, partidos, resultados y desglose oficial de premios por categoría.
  - `pronosticos.js`: Gestión de las apuestas individuales y la columna combinada (MAULA). Incluye auto-guardado silencioso, lógica de desmarcado de signos, bloqueo de jornadas iniciadas, indicador visual del Dado y notificaciones.
  - `scoring.js`: Lógica de puntuación (bonificaciones, penalizaciones, lógica PIG/Pleno al 15).
  - `resumen-temporada.js`: Clasificación acumulada de la temporada y estadísticas detalladas por socio, incluyendo herramientas de **visualización avanzada (Zoom y Ventana Deslizante)** para las gráficas.
  - `resultados.js`: Generación de la tabla de resultados acumulada (Aciertos Base) y gestión de penalizaciones.
  - `dashboard.js`: Panel de inicio con el líder actual, próxima jornada, premios semanales y **asignación dinámica de roles** (Sella/Rellena).
  - `rss-importer.js`: Motor histórico de extracción de datos, partidos y resultados desde fuentes de terceros (redirigido a `text-importer.js`).
  - `telegram-service.js`: Integración de notificaciones, informes de resultados y recordatorios automatizados.
  - `votaciones.js`: Módulo de propuestas, quórum y votaciones democráticas de la peña con edición de fechas límite e integración con Telegram.

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
- **Penalización por Perder la Jornada (Maula)**: El socio que queda último en la jornada (determinado mediante `wasLoserOfJornada`, priorizando infractores por retraso o no jugado y desempatando por menor puntuación e histórico) recibe la penalización monetaria de perdedor (`penalizacionMaula`, por defecto 1,00€ o el valor histórico configurado). Dicha penalización se añade a su aportación semanal en el Bote y, además, le asigna automáticamente la responsabilidad de sellar la quiniela de la peña en la jornada siguiente (`isSealer = true`).
- **Penalizaciones Semanales en Boleto**:
  - **Por "Unos"**: Multa monetaria progresiva si un socio envía su boleto con 10 o más signos '1' (desde 0,10€ hasta 1,00€).
  - **Por Bajos Aciertos**: Multa si el socio obtiene entre 0 y 3 aciertos en la jornada.
  - **Por Fallo en PIG**: Penalización monetaria por fallar el partido de interés general catalogado.
- **Penalizaciones por Clasificación (Cierre de Vuelta/Temporada)**: Al final de la primera vuelta y al final de la temporada, se cobran penalizaciones a los socios basándose en su clasificación. Los cobros escalan desde el 2º clasificado (0,50€) hasta el último (5,00€), estando el 1º exento. En caso de empates en puntos, se desempata por la diferencia entre ganancias y pérdidas de cada ronda, luego a favor del de mayores ganancias totales, y si persiste el empate absoluto se dividirá la suma de las penalizaciones de los puestos compartidos entre los empatados.

### 3.4. Vista Excel y Retrospectiva Histórica

Para facilitar la transición del antiguo sistema de hojas de cálculo al entorno web, la aplicación dispone de una **"Vista Excel (Histórico Detallado)"** ubicada en el Bote de la plataforma.

- **Cálculo Real, no Estático:** Esta vista **no** carga datos pasivos desde ningún archivo `.xlsx`. Toda la información (sellados, recaudación total, ingresos, gastos, premios, ganancias y pérdidas y cuotas de dobles variables) es fruto de la simulación iterativa en tiempo real de la base de datos de Firebase, pasando por el motor de transacciones hasta recrear los mismos resultados que emitiría una tabla tradicional.
- **Orden Heredado:** Mantiene intencionadamente la matriz de ordenamiento de filas caprichosa original o "rara" de la peña (orden alfabético estricto, excepto variaciones históricas toleradas como la de `Valdi` situado cerca de la `J` por José Antonio Valdivieso) para ayudar a la agilidad visual y memoria de los gestores clásicos de la Peña.

### 3.5. Desacoplamiento del Motor Financiero (`bote-engine.js`)

Para optimizar el rendimiento y la mantenibilidad, todo el núcleo matemático del Bote se ha desacoplado de la interfaz gráfica (`bote.js`) y reside en la clase `BoteEngine` (`js/bote-engine.js`):

- **Motor Puro e Independiente**: La clase `BoteEngine` no manipula el DOM; recibe los datos planos (`members`, `jornadas`, `pronosticos`, `pronosticosExtra`, `repartos`, `cierresVuelta`, `ingresos`, `cashPayments`) y calcula determinísticamente la cronología completa de movimientos (`calculateAllMovements`).
- **Línea de Tiempo Unificada**: Ordena cronológicamente jornadas, ingresos manuales libres (sin jornada asignada), cobros de cierres de vuelta y repartos extraordinarios.
- **Exenciones Automatizadas de Pago**: En cada jornada `j`, el motor determina automáticamente si el socio ganó algún premio económico en la jornada inmediata anterior `j-1` (`getPrizesForMemberJornada > 0`). Si ganó premio, queda exento de pagar su cuota semanal (0.75€).
- **Cómputo de Premios por Categoría (`jornada.prizes`)**: Los premios individuales se calculan cruzando los aciertos del socio con el objeto oficial de premios de la jornada (`'15'`, `'14'`, `'13'`, `'12'`, `'11'`, `'10'`). Este desglose se importa de forma exacta desde la web oficial de Loterías y Apuestas del Estado mediante el nuevo importador de resultados.
- **Columna de Dobles y Reducciones Comunitarias**: `getExtraPrizesForJornada` escruta las apuestas múltiples comunitarias cruzando combinaciones y premios para computar los ingresos comunales de la peña.

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

4. **Aciertos Base (Consistencia Estadística)**: El sistema utiliza `potentialHits` para asegurar que los aciertos reales de un socio que sella tarde se contabilicen en las estadísticas acumuladas (aunque sume 0 puntos). Esto garantiza que el total de "Aciertos Base" coincida con la suma visual de la tabla.
5. **Lógica PIG Independiente**: La validación de aciertos en el partido PIG se ha desacoplado de la penalización por retraso. Un socio que sella tarde puede fallar los puntos de la jornada pero seguir siendo un "Acertante PIG" si su pronóstico fue correcto, computando para el Bote de la peña.
6. **Roles de Jornada**: El dashboard muestra siempre quién tiene asignados los roles de "Sella la Quiniela" (✍️) y "Rellena de Dobles" (🍻) para la jornada en curso o la siguiente disponible, especificando siempre el número de jornada para evitar confusiones.

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

- **Regla Primera División**: Una jornada solo se importa si al menos **5 equipos** de sus 15 partidos pertenecen a la **Primera División española (LaLiga EA Sports)**. Este umbral evita que partidos aislados de otras competiciones disparen la importación.
- **Implementación**: El método `hasPrimeraTeams` en `rss-importer.js` realiza esta comprobación cruzando los equipos de la jornada con el listado de palabras clave definido en `AppUtils.isLaLigaTeam` (`js/utils.js`).
- **Mantenimiento Estacional**: Dado que hay ascensos y descensos, el listado de equipos en `js/utils.js` (y su fallback en `rss-importer.js`) **debe actualizarse manualmente al inicio de cada temporada** para reflejar los 20 equipos que componen la Primera División ese año. Si el sistema empieza a importar jornadas de Segunda por error (como ocurrió con la J51 de la temporada 25/26), es señal de que la lista contiene equipos descendidos como Valladolid, Leganés o Las Palmas.
- **Temporada 2026-2027 (ACTIVA)**: Bajan Real Oviedo, Girona y Mallorca. Suben Real Racing Club y RC Deportivo (un ascendido más pendiente de confirmar). La lista `isLaLigaTeam` ya está actualizada en `utils.js` y `rss-importer.js`.

### 5.5. Nuevo Sistema de Importación por Pegado de Texto (`text-importer.js`)

Debido a que las webs y servicios externos de scraping (RSS, PDF y páginas de periódicos) sufrieron cortes definitivos o alteraciones estructurales continuas, se implementó una solución robusta y autosuficiente basada en el **análisis inteligente de texto copiado y pegado** (`js/text-importer.js`):

#### A. Importar Partidos (Fuente: Revista Quinielista)
- **Método**: `TextImporterService.parseMatchesText(rawText)`.
- **Extracción Automática**:
  - **Número de Jornada**: Detecta patrones como `Jornada:\n8` o `Jornada 8`.
  - **Fecha**: Extrae fechas tipo `20/09/2026` y avisa si no cae en domingo (regla Maula).
  - **Entidades HTML**: Descodifica automáticamente entidades tanto numéricas como con nombre (`Alav&#233;s` -> `Alavés`, `Castell&#243;n` -> `Castellón`, `M&#225;laga` -> `Málaga`).
  - **Partidos 1 al 14**: Extrae local y visitante descartando ordinales (`1º`), columnas repetidas de porcentajes y signos.
  - **Pleno al 15 en 2 Líneas**: Resuelve el formato típico de Revista Quinielista donde el equipo local va en una línea (`15º At. Madrid`) y el visitante en la siguiente (`R. Madrid`).
  - **Detección PIG**: Reconoce alias abreviados (`R. Madrid`, `Rayo V.`, etc.) identificando inmediatamente si el partido 15 es PIG (`🐷 PIG`).

#### B. Importar Resultados y Premios (Fuente: Web Oficial Loterías y Apuestas del Estado)
- **Método**: `TextImporterService.parseResultsText(rawText)`.
- **Extracción Automática**:
  - **Jornada y Fecha Oficial**: Extrae el número de jornada (`Jornada 7ª` -> `7`) y fecha oficial del evento.
  - **Marcadores y Signos 1X2**: Extrae el marcador real de cada partido (ej: `2 - 1`) y el signo oficial de la quiniela correspondiente (`1`, `X`, `2`). Si faltase el signo, se deriva automáticamente del marcador.
  - **Pleno al 15 (`1-M`)**: Interpreta marcadores como `1 - 3` y los signos oficiales combinados (`1-M`, `M-1`, `0-0`, `M-M`, etc., donde 3 o más goles equivalen a `M`).
  - **Limpieza de Nombres**: Elimina sufijos masculinos como `(m)` (`Rayo Vallecano (m)` -> `Rayo Vallecano`) y normaliza identificadores femeninos como `(F)`.
  - **Desglose de Premios por Categoría**: Extrae para las 6 categorías (`Pleno al 15`, `14`, `13`, `12`, `11`, `10 aciertos`) el número de acertantes y el importe exacto en euros (ej: `211.710,36 €` -> `211710.36`). Se guarda en `jornada.prizes` para el reparto en el Bote.

#### C. Flujo de Usuario de Doble Paso (Preview & Confirm)
1. **Paso 1 (Pegado y Análisis)**: El usuario pega el texto sin formatear en el modal y pulsa `Analizar`. Si hay errores estructurales, se detallan con advertencias claras.
2. **Paso 2 (Resumen Interactivo)**: Muestra una ficha completa con:
   - Estado de la jornada (si actualizará una existente o creará una nueva).
   - Lista numerada de los 15 partidos con escudos, marcadores e insignias de colores para signos (`1`, `X`, `2`, `1-M`).
   - Tabla con desglose de premios (categoría, acertantes y euros).
   - Opciones: `Confirmar` (persiste en la base de datos), `Volver a Editar` o `Desechar`.
3. **Automatizaciones al Confirmar**:
   - Actualiza o crea la jornada en Firebase (`DataService`).
   - Ejecuta el **Dado de Quinielas** para socios ausentes si procede.
   - Si los 15 partidos tienen resultado grabado, envía de inmediato el **Informe Completo a Telegram**.
4. **Optimización de Pantalla**: La pantalla `jornadas.html` se ha ensanchado al 96% (máx. 2500px) con botonera flexible (`flex-wrap: wrap`) para mostrar todos los botones (`📋 Importar Partidos`, `📥 Importar Resultados`, `➕ Nueva Jornada`, `🗑️ Borrar TODO`) sin cortes ni barras de desplazamiento horizontal.

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
    - **Cálculo de Totales**: Para el sumatorio de "Aciertos Base", el sistema prioriza los `potentialHits` sobre los `hits` penalizados (0) para reflejar el rendimiento real.

### 6.7. Visualización Avanzada en Gráficas

El Resumen de Temporada incluye herramientas para manejar la densidad de datos en temporadas largas:

- **Ventana Deslizante (Sliding Window)**: Permite seleccionar un número de jornadas (ej. 10) y desplazar esa ventana a lo largo de toda la temporada para analizar tramos específicos.
- **Zoom Vertical Automático**: El eje Y de la gráfica no empieza obligatoriamente en cero (`beginAtZero: false`), sino que se ajusta dinámicamente al rango de puntos de los socios visibles, maximizando la claridad de las diferencias de puntuación.
- **Barras de Rendimiento Adaptativas**: El ancho de las barras en el gráfico de rendimiento por jornada se reduce automáticamente (de 55px a 40px) conforme aumenta el número de jornadas jugadas para evitar desbordamientos visuales.

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
- **Soporte Extendido de Escudos (`js/utils.js`)**: El sistema mapea y normaliza dinámicamente nombres de equipos hacia ficheros locales en múltiples directorios (`escudos/primera/`, `escudos/segunda/`, `escudos/OTROS/` y `escudos/Femeninos/` incluyendo equipos como Badalona, Logroño, Madrid CFF, Alcorcón, Ibiza, Marbella, Mérida, Ferrol, Pontevedra, etc.).
- **Auditoría de Correcciones**:
  - Al modificar una jornada cerrada (Modo Corrección), se activa un **Modal de Auditoría** obligatorio de alta visibilidad (`z-index: 9,000,000`).
  - La visibilidad de las ventanas se gestiona mediante la clase `.active`, asegurando que la opacidad pase a 1 y el sistema no quede bloqueado de forma invisible.
  - Se registra el motivo del cambio en el log de modificaciones de Firebase.

### 7.1. Bloqueo Inteligente de Jornadas Iniciadas y Relleno Fuera de Plazo
- **Protección de Integridad**: Si en la pantalla de Resultados Partidos (`jornadas.html` o base de datos) ya se ha informado el resultado/signo de **al menos un partido** para esa jornada, la jornada entra automáticamente en estado `hasStarted` y queda **completamente bloqueada**.
- **Regla Estricta para Rellenar Fuera de Plazo**:
  - **Antes del primer resultado**: Un socio que llegue tarde (después del cierre/deadline) **SÍ puede rellenar su quiniela** con retraso (`late: true`, penalización aplicable según el sistema de puntuación) siempre y cuando todavía **NO se haya registrado ningún signo ni resultado** en dicha jornada.
  - **En cuanto haya al menos un signo registrado**: La jornada se bloquea de forma total e irrevocable para los socios. **No se permite rellenar ni modificar ninguna quiniela**. Los selectores de signos quedan deshabilitados, el botón de guardar se oculta y el sistema muestra la advertencia `🔒 JORNADA EN JUEGO - NO SE ADMITEN PRONÓSTICOS`.
- **Modo Corrección Exclusivo para Administradores**: La única forma de introducir o alterar un pronóstico una vez que hay al menos un resultado registrado es mediante la activación manual del **Modo Corrección** por parte de un administrador (con motivo justificado en el modal de auditoría).

### 7.2. El Dado de Quinielas (🎲 `DiceService` - Propuesto por Buzón)
Ideado a propuesta del socio **Buzón** para situaciones en las que un socio se encuentra de viaje, en el extranjero o sin cobertura móvil/internet y no podrá rellenar manualmente la quiniela, se ha incorporado una alternativa automatizada lúdica y justa:

- **Configuración en Ficha de Socio (`socios.html`)**: El socio o el administrador puede definir un rango de fechas (`fechaInicio` a `fechaFin`, formato `YYYY-MM-DD`) y conmutar un interruptor para activar/desactivar el Dado.
- **Relleno Automático**: Durante ese rango de fechas, cualquier jornada que entre en juego se rellenará automáticamente al azar para ese socio:
  - **Partidos 1 al 14**: Se asignan signos `1`, `X` o `2` generados pseudoaleatoriamente.
  - **Pleno al 15 (PIG)**: Solo se rellena al azar (`1`, `X`, `2`) si la jornada está catalogada como de Interés General (PIG). Si es una jornada ordinaria, el Pleno al 15 se deja deshabilitado (`null`).
  - **Columna de Dobles**: Si al socio le correspondía esa jornada la responsabilidad de rellenar la combinación comunal de dobles, esta **se deja en blanco** para no comprometer el dinero grupal de la peña con selecciones aleatorias.
- **Límite Estricto por Temporada (Máximo 3 Jornadas)**: Para evitar el absentismo reiterado, el sistema impone un tope inquebrantable de **3 jornadas por temporada**. Aunque el rango de fechas siga activo o el socio lo reactive, una vez alcanzadas las 3 jornadas selladas por Dado, el sistema rechazará más rellenos automáticos.
- **Tratamiento del Pronóstico**:
  - Se marca internamente con la bandera `isDice: true`.
  - Muestra visualmente el icono de un dado (`🎲`) en su fila de pronóstico.
  - **Exención de Sanción**: Los pronósticos generados por el Dado **NUNCA se marcan como tarde (`late: false`)**, permitiendo al socio puntuar con normalidad.

### 7.3. Refinamientos de Usabilidad (UX)
- **Separadores de Bloques en Boleto (Idea de Juanjo)**: Inserción de líneas divisorias agrupando los partidos según la distribución tradicional del boleto físico (bloques de 4, 4, 3 y 3 partidos, más el bloque destacado para el Pleno al 15), aportando orden visual y haciendo mucho más cómoda y familiar la comprobación de pronósticos.
- **Ampliación de Pantalla en Resultados Partidos**: Contenedor ensanchado al 96% (máximo 2500px) con distribución flexible para evitar que los botones de acción se corten o requieran barras de desplazamiento horizontal.
- **Claridad en Pronósticos**: Al consultar un pronóstico ya completado, se sustituyó el confuso botón "Cambiar pronóstico" por un explícito botón **"Cerrar"** que cierra la ficha directamente.
- **Limpieza de Enlaces**: Se retiró el texto/enlace redundante "Ir a la tabla" en el encabezado de pronósticos.
- **Escudos Femeninos y Normalización**: Incorporación de escudos oficiales de la Liga Femenina en `escudos/Femeninos/` (`Badalona (f)`, `Logroño (f)`, `Madrid CFF (f)`) y enriquecimiento del mapa de alias en `utils.js` para admitir variantes abreviadas habituales de la prensa (`Rayo V.`, `R. Madrid`, `R. Sociedad`, `R. Valladolid`, etc.).

## 8. Comunicaciones y Notificaciones: Telegram

- Existe un servicio (`telegram-service.js`) que ejerce como "Bot", conectado a la API de Telegram.
- **Por Fin es Jueves**: Una rutina con días, hora, fechas límite de intervalo ("Date Range") definibles, que lanza recordatorios a los socios para que rellenen su pronóstico si no lo han sellado todavía.
- El administrador puede definir mediante el panel de control o por variables el mensaje customizado de ese aviso semanal.
- **Recordatorio Especial PIG**: Si la jornada activa es de tipo PIG (Pleno al 15 con Grandes Clubes), el mensaje de notificación incluirá automáticamente una coletilla extra recordando a los socios "sellar también el PIG".
- **Informe de Resultados**: Cuando finaliza una jornada, el bot envía el resumen detallado. La lista de socios sigue las reglas de ordenación y desempate históricas (punto 6.5) para que el podio (🥇, 🥈, 🥉) y el encargado de sellar (✍️) coincidan con el orden visual. Si hay PIG, se detalla la lista de socios bajo los epígrafes "✅ Acertantes" y "❌ Fallan". La sección de premio especial de dobles se identifica con una jarra de cerveza (`🍺`).
- **Disparo Automático tras Importar Resultados**: Al confirmar la importación de resultados desde texto oficial en `jornadas.html`, si todos los 15 partidos tienen resultado grabado, el sistema ejecuta de inmediato `TelegramService.sendJornadaReport(jornada.id)`, manteniendo el canal de Telegram puntualmente informado.
- **Notificación de Votaciones**: El bot avisa tanto de la apertura de una nueva votación como del cierre y escrutinio final. Si una votación se prorroga, el indicador `tgNotified` se resetea para enviar el resultado cuando expire el nuevo plazo.
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

## 11. Rendimiento y Optimización (Arquitectura JS)

Conforme la base de datos de la peña ha ido creciendo a lo largo de las jornadas, se han implementado optimizaciones críticas en la capa de procesamiento (front-end JavaScript) para asegurar una carga instantánea y fluida, especialmente en dispositivos móviles:

- **Indexación mediante HashMaps (O(1))**: Se ha abandonado la búsqueda lineal múltiple (`Array.find()` y `Array.filter()`) al cruzar jornadas, miembros y pronósticos en `dashboard.js` y `pronosticos.js`. El sistema ahora construye diccionarios (`Map`) en memoria tras la descarga inicial de Firebase. Para asegurar retrocompatibilidad con registros antiguos, asigna a cada pronóstico claves múltiples cruzando posibles campos (`jId` vs `jornadaId`, `mId` vs `memberId`). Esto reduce millones de iteraciones de cálculo en el hilo principal de JavaScript a búsquedas directas en O(1), previniendo bloqueos del navegador y la "congelación" inicial de la interfaz en los smartphones.
- **Tolerancia a Arrays Dispersos (NoSQL)**: Debido a que las estructuras de array en Firebase pueden contener "huecos" (slots `undefined` o `null`) originados por manipulaciones manuales del histórico, todos los bucles de renderizado principal integran salvaguardas preventivas. Si el mapa no encuentra un dato válido, los algoritmos de puntuación asumen "No jugado", manteniendo intacta la estabilidad visual del panel.

---

## 12. Votaciones y Gobernanza Democrática (`votaciones.js`)

Para dirimir decisiones comunitarias de la Peña (cambios de estatutos, fechas de eventos, reparto extraordinario del bote o nuevas reglas), la plataforma dispone de un módulo de votaciones democráticas (`votaciones.html` y `js/votaciones.js`):

- **Propuestas y Quórum**: Cualquier socio autenticado o administrador puede proponer una votación estableciendo título, descripción, opciones personalizadas (por defecto "Sí" / "No"), elección simple o múltiple (`allowMultiple`) y el umbral de aprobación requerido (`threshold` en %, por defecto 50%).
- **Gestión Dinámica de Plazos**:
  - El creador de la votación o un administrador pueden modificar y prorrogar la fecha y hora límite de una votación activa mediante el modal interactivo `#edit-deadline-modal`.
  - Las votaciones vencidas (`isFinished = true`) quedan irrevocablemente cerradas y su escrutinio se consolida.
  - **Sincronización con Telegram**: Al prorrogar el plazo de una votación activa, el indicador `tgNotified` se restablece a `false` para asegurar que el bot de Telegram emita el informe de resultados cuando se alcance el nuevo vencimiento.
- **Integración con Telegram WebApp**: Los socios pueden emitir sus votos directamente desde la aplicación de Telegram o a través de la interfaz web con sincronización en tiempo real en Firestore (`DataService.save('votaciones', ...)`).

---

## Recomendación de Flujo para la IA

Cuando le pidas a una IA que retome el proyecto, la mejor instrucción es:

1. **"Lee el fichero `CONTEXTO_TECNICO_MAULAS.md` para entender las reglas."**
2. Dale permisos para explorar tu carpeta de proyecto.
3. Indícale en qué vista de la web o qué archivo quieres que se enfoque y qué error concreto ocurre.

*(Nota: Este archivo debe editarse y actualizarse cada vez que implementemos una regla de negocio nueva que sea compleja de entender para alguien externo).*
