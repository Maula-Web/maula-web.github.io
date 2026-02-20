# Contexto Técnico y Reglas de Negocio - Peña Las Maulas

## 1. Introducción

Este documento sirve como "memoria de seguridad" centralizada para cualquier asistente de IA o desarrollador que retome el proyecto tras una pérdida de contexto. Contiene las **reglas de negocio complejas, excepciones y arquitectura principal** que serían muy lentas y difíciles de inferir únicamente leyendo el código fuente.

## 2. Arquitectura y Tecnologías

- **Frontend**: HTML5, CSS (Vanilla), JS (Vanilla). Sin frameworks pesados.
- **Backend/Base de Datos**: Firebase (`firebase-init.js`, `db-service.js`).
- **Módulos JS (Carpeta `/js/`)**:
  - `bote.js`: Núcleo financiero de la peña (ingresos, repartos, costes variables, dobles, evolución del bote, penalizaciones). El archivo más grande y complejo.
  - `pronosticos.js`: Gestión de las apuestas individuales y la columna combinada (MAULA).
  - `scoring.js`: Lógica de puntuación.
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

## 4. Obtención de Datos: Partidos, Resultados y Escrutinio

Históricamente el sistema ha consumido datos de diferentes administraciones de loterías y periódicos, enfrentando cortes y cambios de estructura (web scraping inestable).

- **RSS de Loterías y Apuestas del Estado**: Usado preferentemente para obtener la lista oficial de partidos (quién juega contra quién).
- **El País (RSS, Web Parse o PDF)**: Es la fuente principal o secundaria para extraer aciertos, resultados (M-1, 2-M) y recompensas monetarias.
- **Adaptaciones Parches**: El fichero `rss-importer.js` cuenta con múltiples parches en la función `parseElPaisHTML` para procesar tablas irregulares sin guiones separadores entre equipos o en columnas asimétricas. Si algo falla importando, el culpable suele ser un cambio en el DOM del periódico.
- **Conversión de Resultados**: Resultados de goleadas a veces salen como "M-0" o "2-M", el sistema debe normalizarlos a signos absolutos de quiniela (`1`, `X`, `2`) para poder baremar a los socios.

## 5. Tabla de Resultados y "Columna MAULA"

En la Vista Cuadrante / Panel de Partidos o de Resultados se enfrentan los boletos introducidos por cada jugador con los resultados oficiales.

### La Columna MAULA (Consenso de la Peña)

Se genera de forma sintética lo que sería el "voto popular" del grupo:

1. Para el Partido 1, se suma cuántos socios han votado '1', cuántos 'X', cuántos '2'.
2. El signo vencedor por **mayoría absoluta** pasa a ser el signo de la "Columna MAULA" para ese partido.
3. Esto se repite para los 15 plenarios. Este pronóstico estadístico se enfrenta a la realidad, demostrando con frecuencia si la sabiduría popular de la peña es mejor que el voto individual de sus integrantes.
4. **Desempates/Ganadores Semanales**: Cuando en la tabla de resultados varios miembros empatan a aciertos, se utilizan reglas algorítmicas (vía función `resolveTie`) para decidir quién recibe la corona o el farolillo rojo. A los ganadores/perdedores se les asignan identificadores de color específicos regidos en la "Identidad Visual". Aparte, se trackean jornadas especiales donde juegan equipos PIG (Madrid, Barça, Atleti) marcándolas mediante la función `checkIsPIG`.

## 6. Comunicaciones y Notificaciones: Telegram

- Existe un servicio (`telegram-service.js`) que ejerce como "Bot", conectado a la API de Telegram.
- **Por Fin es Jueves**: Una rutina con días, hora, fechas límite de intervalo ("Date Range") definibles, que lanza recordatorios a los socios para que rellenen su pronóstico si no lo han sellado todavía.
- El administrador puede definir mediante el panel de control o por variables el mensaje customizado de ese aviso semanal.

---

## Recomendación de Flujo para la IA

Cuando le pidas a una IA que retome el proyecto, la mejor instrucción es:

1. **"Lee el fichero `CONTEXTO_TECNICO_MAULAS.md` para entender las reglas."**
2. Dale permisos para explorar tu carpeta de proyecto.
3. Indícale en qué vista de la web o qué archivo quieres que se enfoque y qué error concreto ocurre.

*(Nota: Este archivo debe editarse y actualizarse cada vez que implementemos una regla de negocio nueva que sea compleja de entender para alguien externo).*
