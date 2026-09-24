# Contexto Técnico y Reglas de Negocio - Peña Las Maulas

## 1. Introducción

Este documento sirve como "memoria de seguridad" centralizada para cualquier asistente de IA o desarrollador que retome el proyecto tras una pérdida de contexto. Contiene las **reglas de negocio complejas, excepciones y arquitectura principal** que serían muy lentas y difíciles de inferir únicamente leyendo el código fuente.

## 2. Arquitectura y Tecnologías

- **Frontend**: HTML5, CSS (Vanilla), JS (Vanilla). Sin frameworks pesados.
- **Backend/Base de Datos**: Firebase (`firebase-init.js`, `db-service.js`) con persistencia offline en IndexedDB (`db.enablePersistence({ synchronizeTabs: true })`).
- **PWA e Instalación**: Service Worker (`service-worker.js`), Web App Manifest (`manifest.json`) y suite de iconos estándar, maskables y Apple Touch Icons.
- **Módulos JS (Carpeta `/js/`)**:
  - `auth.js`: Autenticación, control de accesos, inyección de iconos/metadatos PWA y registro del Service Worker en toda la aplicación.
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

### 3.6. Extracto Individual y Detalle de Movimientos de Socio (`bote.js`, `bote-engine.js`, `utils.js`)

Para garantizar la máxima transparencia en la contabilidad comunal, el modal de detalle de socio (`#member-detail-modal`) ofrece una vista desglosada y auditable de cada movimiento:

- **Orden Cronológico Estricto**: Los movimientos se presentan en secuencia temporal natural con un selector que permite conmutar entre orden cronológico ascendente (`ASC`, por defecto para ver la evolución del saldo) y descendente (`DESC`).
- **Normalización y Parseo Robusto de Fechas (`utils.js`)**: Tratamiento exhaustivo en la función de parseo de fechas (`formatDateForInput` y parseo de cadenas ISO `YYYY-MM-DD`, `DD/MM/YYYY`, Firestore Timestamps y objetos Date nativos). Se elimina cualquier ambigüedad de zona horaria UTC vs. local que provocaba que fechas grabadas como `2026-09-20` se mostraran desfasadas un día antes o se ordenaran incorrectamente.
- **Estructura de Columnas del Extracto**:
  - `JORNADA`: Insignia identificativa (ej. `J8`, `J9`) o etiqueta informativa para movimientos extraordinarios (`Bizum`, `Cierre 1ª Vuelta`, `Reparto`).
  - `CONCEPTO / FECHA`: Detalle descriptivo de la operación (ej. "Apuesta J8 + Dobles", "Ingreso Bizum", "Premio 12 aciertos", "Penalización retraso") junto a la fecha exacta.
  - `APORTA / INGRESO (+€)`: Entradas dinerarias netas del socio al bote común.
  - `GASTA / CARGO (-€)`: Salidas y costes imputados al socio (coste de quiniela ordinaria 0,75€ + cuota proporcional comunal de dobles + multas).
  - `PREMIOS (+€)`: Ingresos procedentes de aciertos individuales o comunales.
  - `SALDO RESULTANTE (€)`: Balance acumulado y consolidado tras la ejecución de la fila.
- **Optimización de UI del Bote (`bote.html`)**:
  - Selector de socio con icono de flecha blanca vectorial adaptada para el tema oscuro.
  - Reubicación del selector directamente bajo la barra de botones principales para mejorar la ergonomía.
  - Contenedor con scroll horizontal (`.table-responsive`) en la tabla resumen para garantizar visualización íntegra en pantallas estrechas sin romper el maquetado.

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
- **Instalación como Web App y Acceso Directo Móvil (A2HS - Add to Home Screen)**:
  - Configuración completa para que al guardar la web en el escritorio del móvil aparezca el logotipo oficial de la Peña (`LOGO_MAULAS.png`).
  - **Soporte iOS (Safari)**: Generación de `apple-touch-icon.png` (180x180) y variantes para iPad/iPhone sobre fondo blanco sólido `#ffffff` con márgenes de seguridad proporcionales (85%), evitando que iOS rellene las transparencias con fondo negro.
  - **Soporte Android (Chrome / Chromium)**: Creación de `manifest.json` con iconos estándar (192x192, 512x512) e iconos adaptativos "maskable" (con escala de seguridad al 70% para no recortar la corona ni las estrellas en máscaras circulares o squircle).
  - **Favicon y Metadatos**: Generación de `favicon.ico` (32x32) y `favicon-16x16.png`, además de inyección dual: estática en el `<head>` de todas las páginas HTML y dinámica universal mediante `Auth.injectAppIconsAndMeta()` en `auth.js`.
- **Separadores de Bloques en Boleto (Idea de Juanjo)**: Inserción de líneas divisorias agrupando los partidos según la distribución tradicional del boleto físico (bloques de 4, 4, 3 y 3 partidos, más el bloque destacado para el Pleno al 15), aportando orden visual y haciendo mucho más cómoda y familiar la comprobación de pronósticos.
- **Ampliación de Pantalla en Resultados Partidos**: Contenedor ensanchado al 96% (máximo 2500px) con distribución flexible para evitar que los botones de acción se corten o requieran barras de desplazamiento horizontal.
- **Claridad en Pronósticos**: Al consultar un pronóstico ya completado, se sustituyó el confuso botón "Cambiar pronóstico" por un explícito botón **"Cerrar"** que cierra la ficha directamente.
- **Limpieza de Enlaces**: Se retiró el texto/enlace redundante "Ir a la tabla" en el encabezado de pronósticos.
- **Escudos Femeninos y Normalización**: Incorporación de escudos oficiales de la Liga Femenina en `escudos/Femeninos/` (`Badalona (f)`, `Logroño (f)`, `Madrid CFF (f)`) y enriquecimiento del mapa de alias en `utils.js` para admitir variantes abreviadas habituales de la prensa (`Rayo V.`, `R. Madrid`, `R. Sociedad`, `R. Valladolid`, etc.).

### 7.4. Optimizaciones Móviles y de Interfaz (Responsive UI)

A raíz de las pruebas de uso intensivo en smartphones y tablets, se implementaron adaptaciones críticas en componentes clave:

- **Columna Fija de Temporada en Clasificación (`resultados.html`, `js/resultados.js`)**:
  - En la tabla de clasificación por jornadas, la columna de cabecera "TEMPORADA" se amplió a un ancho mínimo de seguridad de 100px y su rótulo se estructuró en dos líneas (`TEMP.` / `25-26`). Esto previene el solapamiento visual con los números de las primeras jornadas en pantallas de smartphones con ancho reducido.
- **Botonera Adaptativa en Modal de Jornadas (`jornadas.html`)**:
  - Los botones de acción del modal de edición de jornadas y resultados partidos se configuraron con envoltorio flexible (`flex-wrap: wrap`), asegurando que en pantallas estrechas no desborden horizontalmente y manteniendo un área táctil mínima (touch target) de 44px de altura para máxima ergonomía.
- **Separadores de Bloque Corporativos (`css/styles.css`, `js/pronosticos.js`)**:
  - Estandarización de líneas divisorias finas en color rojo corporativo (`#ff3600`) entre bloques de información en pronósticos, resultados, bote y administración.
- **Identificador de Temporada en Cabecera**:
  - Incorporación de la etiqueta de temporada activa junto al logotipo de la Peña en la barra de navegación superior.

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
- **Separadores Corporativos**: Se utiliza una línea fina en color rojo corporativo (`#ff3600`) para delimitar bloques y secciones, reforzando la identidad gráfica de Las Maulas.
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

## 11. Rendimiento y Optimización (Arquitectura JS y Carga Rápida)

Conforme la base de datos de la peña ha ido creciendo a lo largo de las jornadas, se han implementado optimizaciones críticas en la capa de procesamiento (front-end JavaScript), red y almacenamiento local para asegurar una carga instantánea y fluida, especialmente en dispositivos móviles:

- **Indexación mediante HashMaps (O(1))**: Se ha erradicado la búsqueda lineal múltiple (`Array.find()` y `Array.filter()`) al cruzar jornadas, miembros y pronósticos en todos los módulos principales (`dashboard.js`, `pronosticos.js`, `resultados.js`, `resumen-temporada.js` y `bote-engine.js`). El sistema construye diccionarios (`Map`) en memoria tras la descarga inicial de Firebase. Para asegurar retrocompatibilidad con registros antiguos, asigna a cada pronóstico claves múltiples cruzando posibles campos (`jId` vs `jornadaId`, `mId` vs `memberId`). Esto reduce millones de iteraciones de cálculo en el hilo principal de JavaScript a búsquedas directas en O(1), previniendo bloqueos del navegador y la "congelación" inicial de la interfaz en smartphones.
- **Deduplicación de Inicialización y Guardias Migratorias (`db-service.js`)**:
  - `DataService.init()` ahora almacena su promesa en curso (`this._initPromise`) y una bandera (`this._initialized`), evitando que múltiples componentes lanzados a la vez ejecuten inicializaciones paralelas.
  - La verificación de migración histórica se guarda en `localStorage ('maulas_db_migrated')`, eliminando 7 consultas de red innecesarias a Firestore en cada navegación.
- **Caché en Memoria con Auto-Invalidación (`loadSeasonData`)**:
  - `DataService.loadSeasonData()` almacena en memoria la promesa resuelta durante el ciclo de vida de la página. Llamadas simultáneas o recurrentes desde distintos scripts reutilizan el mismo resultado sin re-descargar colecciones enteras.
  - Al realizar cualquier modificación en base de datos (`save`, `update`, `delete`), la caché se invalida automáticamente (`clearSeasonDataCache()`).
- **Descargas Específicas de Configuración (`auth.js`, `bote.js`)**:
  - Sustitución de `getAll('config')` (que descargaba decenas de KB de todas las configuraciones) por llamadas directas a documentos únicos: `getDoc('config', 'theme')`, `getDoc('config', 'bote_config')` y `getDoc('config', 'emilio_status')`.
  - Carga en paralelo de datos y configuración mediante `Promise.all([this.loadData(), this.loadConfig()])`.
- **Memoización Algorítmica en el Motor Financiero (`bote-engine.js`)**:
  - Creación de `getWinnerOfJornada` y `getLoserOfJornada` con memorización por clave de jornada (`_winnerCache`, `_loserCache`). Esto reduce de más de 28.000 evaluaciones O(N²) redundantes a exactamente 1 cálculo por jornada, acelerando la simulación completa del Bote a menos de 60ms.
  - Búsqueda en O(1) de pronósticos dentro del bucle de movimientos mediante mapa hash pre-construido.
- **Desacoplamiento Visual del Slider en Resumen de Temporada (`resumen-temporada.js`)**:
  - En la gráfica de evolución acumulada, el desplazamiento del slider de zoom y ventana deslizante ya no recalcula todas las estadísticas ni vuelve a llamar a `calculateData()`.
  - Los datos calculados se mantienen en memoria (`this.data`) y el slider únicamente aplica un rebanado (`slice`) ultrarrápido sobre los puntos a renderizar, garantizando 60 FPS al interactuar con el control.
- **Memoización de Fechas en `utils.js`**:
  - `AppUtils.parseDate` dispone de un diccionario de memoización (`_dateCache`). Las fechas consultadas repetidamente se resuelven en 0 ms sin re-evaluar expresiones regulares complejas.
- **Preconexión de Recursos (Resource Hints) y Fuentes Paralelas**:
  - Inserción de `<link rel="preconnect">` en todas las páginas HTML hacia `fonts.googleapis.com`, `fonts.gstatic.com`, `www.gstatic.com` y `cdn.jsdelivr.net`.
  - Enlace directo a la tipografía de Google Fonts en el `<head>`, permitiendo descargar CSS y fuentes en paralelo y eliminando el bloqueo que causaba `@import` en `styles.css`.
- **Caché Completa PWA (Service Worker v1.1)**:
  - Actualización a la versión `maulas-pwa-v1.1` en `service-worker.js`.
  - Inclusión en el App Shell de recursos que faltaban en precache (`resumen-styles.css`, `frases.js` y `chart.umd.min.js`), asegurando funcionamiento offline 100% resiliente y carga instantánea.
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

## 13. Progressive Web App (PWA) e Instalación Móvil

Para ofrecer una experiencia nativa en teléfonos móviles (Android e iOS) e independizar la plataforma de pestañas de navegador convencionales, la web se ha convertido íntegramente en una PWA:

### 13.1. Manifiesto y Metadatos de Aplicación (`manifest.json`)
- **Modo de visualización**: `standalone`, ocultando barras de navegación del navegador para una experiencia 100% como app nativa.
- **Orientación preferida**: `portrait-primary`.
- **Tema y Fondo**: `theme_color: "#1976d2"`, `background_color: "#121212"`.
- **Identidad**: `name: "Peña Quinielista Las Maulas"`, `short_name: "Peña Maulas"`.

### 13.2. Iconografía Adaptativa y Apple Touch Icons
- **iOS Safari**: `apple-touch-icon.png` (180x180 px con esquinas redondeadas y fondo oscuro) y `apple-touch-icon-precomposed.png`. Al pulsar "Añadir a pantalla de inicio" en iPhone/iPad, se utiliza el logotipo oficial de Las Maulas sin bordes extraños.
- **Android**: Iconos de alta resolución `icons/icon-192x192.png` e `icons/icon-512x512.png`, acompañados de versiones "maskable" (`icons/icon-maskable-192x192.png` e `icons/icon-maskable-512x512.png`) con margen de seguridad del 10% para adaptarse a cualquier recorte circular, cuadrado o squircle del launcher del móvil.
- **Escritorio**: `favicon.ico`, `icons/favicon-32x32.png` y `icons/favicon-16x16.png`.

### 13.3. Service Worker (`service-worker.js`)
- **App Shell Pre-caching**: Al instalarse, el Service Worker descarga y almacena en caché todos los ficheros HTML, CSS, JavaScript propios, logotipos e iconos, además de las librerías CDN de Firebase (`firebase-app-compat.js` y `firebase-firestore-compat.js`).
- **Instalación Resiliente**: Emplea `Promise.allSettled` para que un fallo puntual de red en un recurso secundario no interrumpa la activación de la caché.
- **Estrategia de Navegación HTML**: `Network-First` con fallback a caché (`index.html`), garantizando que si hay conexión siempre se sirva la última versión, pero si el usuario no tiene cobertura, la app cargue de inmediato desde la caché local.
- **Estrategia de Archivos Estáticos**: `Stale-While-Revalidate` para CSS, JS, imágenes y fuentes, logrando aperturas instantáneas con actualización en segundo plano.
- **Exclusión de APIs en Tiempo Real**: No intercepta las conexiones de `firestore.googleapis.com` ni `api.telegram.org` para no interferir en la latencia de las lecturas y escrituras en vivo.
- **Limpieza de Versiones Antiguas**: El evento `activate` purga de forma automática cualquier versión anterior de la caché (`maulas-pwa-*`), manteniendo limpio el almacenamiento del dispositivo.

### 13.4. Persistencia Offline en Firestore (`js/firebase-init.js`)
- Se ha habilitado `db.enablePersistence({ synchronizeTabs: true })`.
- Cuando el usuario pierde conexión, las consultas a la base de datos se responden desde la base de datos local de IndexedDB del navegador.
- En cuanto la conexión a Internet se restablece, las operaciones pendientes se sincronizan de forma transparente con la nube.

### 13.5. Copias de Seguridad del Proyecto
- **Script de Respaldo de Firestore**: `scripts/backup_firestore.js`, que descarga todas las colecciones activas mediante la API REST de Firestore a archivos JSON individuales dentro de `BACKUP_DATOS_YYYY-MM-DD/`. (Último respaldo completo generado: `BACKUP_DATOS_2026-09-24/` con 2.411 documentos respaldados de todas las colecciones activas).
- **Copia Comprimida de Seguridad**: Archivo ZIP íntegro en `D:\PROYECTO_MAULAS_BACKUP_2026-09-24.zip` y archivo local actualizado en `D:\PROYECTO_MAULAS\proyecto maula web.zip`, conteniendo todo el código fuente optimizado, base de datos exportada, recursos multimedia e historial.
- **Control de Versiones Local**: Tags de Git `v1.0-pre-pwa` y `v1.1-pwa-optimized` (versión consolidada con Service Worker v1.1 y optimizaciones de cálculo y carga).

### 13.6. Automatización Externa con GitHub Actions y Sincronización
- **Actualización Desatendida de Datos Externos**: Las fuentes externas (`datos_auxiliares/rss_cache.xml` y `datos_auxiliares/external_data_metadata.json`) se sincronizan de manera autónoma mediante un workflow de GitHub Actions que realiza commits directos con el prefijo `Auto-update: Datos externos (RSS/PDF) [skip ci]`.
- **Protocolo de Sincronización en la Carpeta de Trabajo**: Al iniciar sesiones de trabajo o antes de desplegar cambios, se debe ejecutar `git pull` en la máquina local para incorporar sin conflictos las actualizaciones automáticas generadas por GitHub Actions.

---

## 14. Gestión de Resultados de Jornadas y Panel de Administración (v1.2)

### 14.1. Navegación Secuencial en Modal de Jornadas
- En el modal de visualización/edición de jornadas (`#jornada-modal` en `jornadas.html` y `js/jornadas.js`), se han incorporado botones de navegación rápida **◀ Anterior** y **Siguiente ▶** (`#btn-modal-prev-jornada`, `#btn-modal-next-jornada`).
- **Seguridad en Edición**: Durante la edición de resultados (`editMode === true`), los botones de navegación quedan automáticamente desactivados (`disabled = true`, opacidad reducida y cursor bloqueado) para evitar que el usuario cambie involuntariamente de jornada perdiendo los cambios no guardados.
- **Límites de Jornadas**: Los botones se deshabilitan adecuadamente al alcanzar la primera o la última jornada registrada.
- **Reinicio de Desplazamiento**: Al cambiar de jornada mediante estos botones, el cuerpo del modal restablece su desplazamiento (`scrollTop = 0`), posicionando al usuario al inicio de la jornada entrante.
- **Retorno Automático a Modo Vista al Guardar**: Al pulsar el botón **Guardar** (`btnSave`), tras persistir los datos en Firestore y gestionar el aviso opcional de Telegram, el modal regresa inmediatamente al estado de visualización (**"Vista"**), bloqueando los inputs contra modificaciones accidentales, reactivando los botones de navegación ◀ y ▶ y mostrando nuevamente el botón **✏️ Editar**.

### 14.2. Aviso y Confirmación de Envío a Telegram
- Al guardar los resultados de una jornada (`saveJornada`), si se detecta que los **15 partidos** (incluido el Pleno al 15) están completamente cumplimentados, el sistema muestra un cuadro de diálogo interactivo de confirmación (`confirm`):
  *"⚽ Se han completado todos los resultados de la jornada. ¿Deseas enviar el informe oficial de resultados al canal de Telegram ahora?"*
- El informe oficial a Telegram únicamente se despacha si el usuario pulsa **Aceptar**, evitando envíos automáticos no deseados mientras se realizan pruebas o correcciones.

### 14.3. Arquitectura del Modal y Corrección de Scroll (PC, Móviles y Tablets)
- **Aislamiento de Desplazamiento**: El contenedor modal (`#jornada-modal .modal`) se estructura como columna flex (`display: flex; flex-direction: column; max-height: 90vh; overflow: hidden;`) con esquinas redondeadas limpias.
- **Cabecera Fija y Sólida**: `#modal-header-row` posee fondo 100% opaco (`background: #1e1e1e !important;`) y separación por borde inferior, permaneciendo estática en la cúspide del modal.
- **Cuerpo con Scroll Independiente**: El contenido desplazable (temporada, fecha, estado, cuadrícula de partidos y premios) está confinado en `#modal-body-scrollable` con `overflow-y: auto` e inercia táctil (`-webkit-overflow-scrolling: touch;`). El contenido se recorta por debajo de la cabecera, haciendo físicamente imposible que los resultados o inputs se visualicen por detrás o asomen por encima de la barra de título en ordenadores, teléfonos o tabletas.

### 14.4. Contraste de Etiqueta Vista / Editando
- Para evitar la falta de visibilidad en temas claros y oscuros, la etiqueta de modo (`#modal-mode-badge`) cuenta con estilos de alto contraste diferenciados:
  - **Modo "Vista"**: Fondo claro/grisáceo (`#e2e8f0`) con texto en **gris oscuro** (`#333333`) y borde sutil.
  - **Modo "Editando"**: Fondo pastel rojizo (`#ffebee`) con texto en **rojo brillante** (`#d32f2f`) y borde contrastado.

### 14.5. Seguridad en Borrado de Datos y Zona de Administración
- **Eliminación del Botón Peligroso en Resultados**: El botón "Borrar TODO" ha sido eliminado de la barra superior de `jornadas.html`, mitigando el riesgo de borrados accidentales por parte de los usuarios o administradores en la vista pública.
- **Reubicación Protegida en Administración**: Se ha integrado una tarjeta específica de **"🗑️ Borrado de Jornadas"** en el panel de Administración (`admin.html`), restringida tras el inicio de sesión del Administrador.
- **Mecanismo de Doble Confirmación con Palabra Clave**: Para ejecutar el borrado masivo de jornadas, el administrador debe confirmar la advertencia inicial y teclear explícitamente la palabra **"BORRAR"**. Cualquier discrepancia cancela la operación. Además, la acción queda registrada en el historial de logs (`Auth.logAction`).

---

## 15. Notificación Automática «Habemus Quinielam» en Telegram (v1.3)

### 15.1. Diagnóstico y Causa Raíz
- **Fallo Histórico**: La notificación automática nunca se disparaba cuando los socios completaban sus pronósticos en la web de producción, a pesar de que el botón de prueba en Administración (`admin.html`) sí funcionaba.
- **Causa 1 (Script ausente)**: `pronosticos.html` carecía por completo de la inclusión del script `js/telegram-service.js` en su estructura HTML. En `js/pronosticos.js`, la condición `if (window.TelegramService)` siempre evaluaba a `false` en tiempo de ejecución.
- **Causa 2 (Interferencia de temporadas / Jornada 64)**: En Firestore coexisten jornadas de temporadas pasadas (ej. Temporada 2025-2026 finalizó en la Jornada 64). Tanto en `admin.html` como en los fallbacks de `TelegramService`, al buscar la "última jornada activa" mediante `sort((a,b) => b.number - a.number)[0]`, el sistema seleccionaba la **Jornada 64** de la temporada anterior en lugar de la jornada en curso de la temporada actual (`2026-2027`), debido a que 64 > 11/8. Como la Jornada 64 ya tenía `habemusSent = true`, el envío se abortaba de inmediato.
- **Causa 3 (Bloqueo en Modo Corrección)**: En `performFinalSave` de `js/pronosticos.js`, existía la condición `if (window.TelegramService && !isCorrection)`. Al rellenar o modificar pronósticos mediante el Modo Corrección (imprescindible cuando las jornadas ya han entrado en juego o han cerrado plazo), la función no se invocaba nunca.
- **Causa 4 (Colisión de identificadores)**: Las quinielas de la temporada actual almacenan `jId` como identificador de marca temporal (`j.id`), mientras que en temporadas anteriores se usaba el número ordinal (`11`, `8`, etc.). Al comparar por número ordinal en lugar de `currentJ.id`, se producían colisiones con pronósticos históricos de 2025-2026.

### 15.2. Corrección e Integraciones Implementadas
- **Carga de Script en `pronosticos.html`**: Se ha incluido `<script src="js/telegram-service.js"></script>` en el `<head>` de la página.
- **Aislamiento Estricto por Temporada (`activeSeason`)**:
  - Tanto `TelegramService.checkHabemusQuinielam` como `admin.html` filtran explícitamente las jornadas por la temporada activa (`(j.season || '2026-2027') === activeSeason`).
  - La resolución de la jornada prioriza el ID exacto y el número ordinal dentro de la temporada activa. Si no se especifica jornada, selecciona la jornada activa más reciente de la temporada actual (ej. J11 o J8), haciendo físicamente imposible que seleccione la Jornada 64 de la temporada anterior.
- **Selector y Estado en Vivo en el Panel de Administración (`admin.html`)**:
  - La tarjeta de **Habemus Quinielam** incluye ahora un desplegable interactivo (`#habemus-jornada-select`) que muestra todas las jornadas de la temporada en curso con su fecha y estado de envío.
  - Indicador dinámico (`#habemus-jornada-status`) que detalla en tiempo real cuántos socios han completado su pronóstico (ej. `19/19 (Completo)` o `0/19`) y si el aviso de Telegram figura como `✅ Enviado` o `⏳ No enviado`.
  - Los botones **📤 Probar Envío** y **🔄 Reset** operan directamente sobre la jornada seleccionada en el desplegable, impidiendo cualquier operación sobre jornadas de temporadas previas.
- **Habilitación en Modo Corrección**:
  - En `performFinalSave` de [pronosticos.js](file:///d:/PROYECTO_MAULAS/js/pronosticos.js) se eliminó la restricción `&& !isCorrection`, de modo que si el último socio cumplimenta su quiniela bajo corrección, se verifica y despacha el aviso inmediatamente.
- **Detección Instantánea con Pronósticos en Memoria**:
  - Se pasa `this.pronosticos` directamente a `checkHabemusQuinielam`, eliminando esperas y dependencias de la latencia de red de Firestore.
- **Filtro de Socios Activos y Coincidencia de IDs**:
  - Comprobación estricta de socios activos (`m.active !== false`) y validación de pronósticos por `pJId === String(currentJ.id) && pMId === String(m.id)`.
- **Integración con «El Dado de Quinielas» (`DiceService`)**:
  - Al iniciar `pronosticos.html`, si el Dado cumplimenta automáticamente los pronósticos de socios ausentes para la jornada activa, se dispara la comprobación automática de Habemus Quinielam.
- **Prevención de Duplicados**:
  - Tras el envío a Telegram, se persiste `habemusSent = true` en la jornada de Firestore, pudiendo ser reseteado en cualquier momento desde la tarjeta de administración.

---

## 16. Reglas de Partido de Interés General (PIG) y Equipos Femeninos (v1.4)

### 16.1. Definición y Reglas de Activación de PIG
- **Equipos que activan PIG**: Únicamente los tres grandes clubes masculinos de fútbol profesional español:
  1. **Real Madrid** (variantes aceptadas: `Real Madrid`, `R. Madrid`, `R.Madrid`, `RMadrid`).
  2. **Atlético de Madrid** (variantes aceptadas: `Atlético de Madrid`, `Atletico de Madrid`, `Atlético Madrid`, `At. Madrid`, `At.Madrid`, `AtMadrid`, `Atlético`).
  3. **Barcelona** (variantes aceptadas: `Barcelona`, `FC Barcelona`, `F.C. Barcelona`, `Barça`, `Barca`, `Futbol Club Barcelona`).
- **Condición de Partido PIG (`AppUtils.isPigMatch`)**: El partido (típicamente evaluado para el Pleno al 15) es PIG **si y solo si** ambos contrincantes pertenecen a dos de estos tres clubes masculinos distintos entre sí (ej. Real Madrid vs Barcelona, Atlético vs Real Madrid, Barcelona vs Atlético).
- **Exclusión de Filiales**: Los equipos filiales o de categorías inferiores (`Castilla`, `Celta B`, `R.Sociedad B`, etc.) no activan el PIG (`AppUtils.isReserveTeam`).

### 16.2. Exclusión y Normalización de Equipos Femeninos
- **Regla Estricta**: Los partidos de fútbol femenino **NUNCA activan el PIG**, con independencia de que los clubes enfrentados sean Real Madrid, Barcelona o Atlético de Madrid.
- **Detección Exhaustiva de Variantes Femeninas (`AppUtils.isFemaleTeam`)**:
  - Reconoce etiquetas entre paréntesis o corchetes: `(F)`, `(f)`, `( F )`, `(Fem)`, `(fem.)`, `[F]`, etc.
  - Reconoce palabras clave en castellano y catalán con o sin tilde: `femenino`, `femenina`, `femení`, `feminas`, `féminas`, `fem`.
  - Reconoce sufijos abreviados al final del nombre: ` F`, ` f`, ` - F`, ` / F`, ` F.` (ej. `R.Madrid F`, `R.Madrid f`, `At.Madrid F`, `Deportivo F`, `Madrid CCF F`).
- **Estandarización y Unificación de Nombres (`AppUtils.normalizeTeamName`)**:
  - Al importar jornadas desde fuentes externas (`rss-importer.js`) o al guardarlas manualmente en el modal de administración de jornadas (`jornadas.js`), los nombres de los equipos femeninos se limpian eliminando duplicidades y se unifican bajo el formato oficial estándar con sufijo ` (F)`:
    - `R.Madrid F` / `R.Madrid f` / `R.Madrid (f)` $\rightarrow$ `Real Madrid (F)`
    - `At.Madrid F` / `At. Madrid (F)` $\rightarrow$ `Atlético (F)`
    - `Barcelona (f)` / `Barcelona F` $\rightarrow$ `Barcelona (F)`
    - `Deportivo F` $\rightarrow$ `Deportivo (F)`
    - `Madrid CCF F` $\rightarrow$ `Madrid CCF (F)`
- **Impacto Sistémico**: Toda la aplicación (cálculo de botes, pantalla de pronósticos, resultados, resumen de temporada, dado de quinielas y notificaciones automáticas de Telegram) utiliza de forma homogénea las funciones centralizadas de `window.AppUtils`.

---

## 17. Indicadores Luminosos LED de Estado de Pronósticos y Dobles (v1.5)

### 17.1. Finalidad y Comportamiento Visual
En la vista de pronósticos ([pronosticos.html](file:///d:/PROYECTO_MAULAS/pronosticos.html)) se incorporan indicadores luminosos tipo LED con brillo y sombra radial (`box-shadow`), diseñados para ofrecer retroalimentación visual inmediata sobre el estado de cumplimentación de las quinielas sin recargar ni descolocar la maquetación.

### 17.2. Estados del LED y Reglas de Negocio
- 🟢 **Verde (`.led-green`)**:
  - Indica que el pronóstico normal del socio está **completo al 100%**:
    - Los 14 partidos principales cuentan con un signo válido (1, X o 2).
    - El Pleno al 15 está relleno obligatoriamente si el partido está catalogado como PIG (`AppUtils.isPigMatch`). Si no es PIG, no se exige.
    - Si el socio es el responsable/elegible para la **Quiniela de Dobles** en dicha jornada, también se exige que los dobles estén ya guardados.
- 🟡 **Amarillo (`.led-yellow`) con pulsación suave (`led-pulse-yellow`)**:
  - Indica que el socio **ha completado su pronóstico individual**, pero **es el socio responsable de la Quiniela de Dobles** de esa jornada (por haber ganado o sido elegible en la jornada anterior vía `checkEligibility(jNum, mId, true)`) y **aún no ha rellenado la Quiniela de Dobles**.
  - Este estado es exclusivo del socio encargado de los dobles, permitiéndole identificar de inmediato que le falta esa tarea grupal.
- 🔴 **Rojo (`.led-red`)**:
  - Indica que el socio aún no ha rellenado su pronóstico en esa jornada o le falta algún signo por marcar.

### 17.3. Integración en la Interfaz
1. **Tabla Resumen de Pronósticos (`#forecast-summary-table`)**:
   - **Cabeceras (`<th>`)**: Cada socio muestra el LED de su estado (verde, amarillo o rojo) correspondiente a la jornada activa o seleccionada (`updateSummaryHeaderLeds()`), con tooltip descriptivo.
   - **Celdas (`<td>`)**: Para evitar saturación visual, las quinielas completas **no** muestran el LED verde dentro de cada celda; sin embargo, los avisos en **rojo** (incompletos/pendientes) y en **amarillo** (falta rellenar dobles) sí se muestran en cada pronóstico además de junto al nombre.
   - **Leyenda**: Situada encima de la tabla con los 3 colores y sus significados.
2. **Modal de Pronósticos Colectivos (`#view-jornada-modal`)**:
   - Cabeceras de columnas de socios con el LED orientado correctamente junto a su nombre.
   - Mini-leyenda responsive en la barra superior del modal.
3. **Barra de Selección Activa (`#active-selection-info`)**:
   - La pastilla del socio seleccionado muestra su LED correspondiente a la jornada en curso.

---

## 18. Nueva Sección: Bote 2 (Tesorería & Auditoría Financiera)

### 18.1. Propósito y Convivencia
- Se crea la nueva sección **Bote_2** (`bote_2.html`, `js/bote_2.js`, `js/bote_2_data.js`) como una evolución moderna, ultra-rápida y detallada de la gestión del Bote y Tesorería.
- **Convivencia activa**: El Bote original (`bote.html`) se mantiene 100% operativo e intacto mientras se completan las pruebas de esta nueva versión.

### 18.2. Control de Acceso Exclusivo (Gatekeeper)
- **Acceso Autorizado**: Reservado exclusivamente para los socios evaluadores:
  - **Fernando Lozano** (ID: 6, `lozano@maulas.com`, alias `Lozano`)
  - **Marcelo Pérez** (ID: 14, `marcelo@maulas.com`, alias `Marcelo`)
- **Resto de Socios y Visitantes**: Si un usuario no autorizado o no identificado intenta acceder a `bote_2.html`, el sistema oculta el contenido principal y despliega un panel estilizado de **"En obras (Fase de Pruebas Exclusiva)"** con accesos directos al Bote actual y al Inicio.
- **Acceso Rápido para Evaluadores**: Incluye modal de identificación rápida (`modal-auth-evaluador`) y soporte para parámetro URL (`?evaluador=6` o `?evaluador=14`) para facilitar la auditoría en navegación privada.

### 18.3. Arquitectura y Rendimiento
- **Desacoplamiento Ligero**: Los datos históricos y snapshots locales se extrajeron a `js/bote_2_data.js`, reduciendo el HTML principal de más de 50.000 líneas a solo 888 líneas limpias, garantizando carga instantánea tanto en redes móviles como en escritorio.
- **Adaptabilidad al Viewport**: Contenedor optimizado (`max-width: 1380px`, sin desbordamientos innecesarios ni barras de scroll vertical redundantes en escritorio), con sticky-headers en tablas y columna fija lateral en pantallas pequeñas.
- **Orden de Socios**: En todas las vistas (Cuentas de Socios, Matriz Cuadrante, Auditor de Jornadas y Desplegable de Ingresos) se aplica estrictamente el orden numérico oficial por ID (1 al 19), idéntico al resto de la aplicación.
- **Tooltips y Explicaciones**: Todos los elementos estáticos y no desplegables (tarjetas Bento, métricas de recaudación, badges de multas y conceptos) incorporan tooltips explicativos (`title` y chips con `ℹ️`) para clarificar su cálculo contable.

### 18.4. Reembolso de Sellado: Bote vs Bizum
- En la quiniela de cada jornada, el socio perdedor o sellador adelanta el coste del boleto físico.
- Se implementó la posibilidad de elegir de forma individual para cada jornada si el importe del sellado:
  - **Va al Bote del socio (`isSelladoInCash: false`)**: Se acredita en su saldo virtual acumulado.
  - **Se paga por Bizum / Efectivo (`isSelladoInCash: true`)**: El dinero se reembolsa externamente y no incrementa su hucha del bote.
- Se gestiona interactivamente desde la tabla de detalle de la jornada y desde el modal de Tesorería (`modal-gestion-jornada`), persistiendo en la colección Firestore `reembolsos_efectivo` (`${memberId}_${jornadaId}`).

---

## Recomendación de Flujo para la IA

Cuando le pidas a una IA que retome el proyecto, la mejor instrucción es:

1. **"Lee el fichero `CONTEXTO_TECNICO_MAULAS.md` para entender las reglas."**
2. Dale permisos para explorar tu carpeta de proyecto.
3. Indícale en qué vista de la web o qué archivo quieres que se enfoque y qué error concreto ocurre.

*(Nota: Este archivo debe editarse y actualizarse cada vez que implementemos una regla de negocio nueva que sea compleja de entender para alguien externo).*


