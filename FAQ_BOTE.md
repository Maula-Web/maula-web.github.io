# FAQ - Sistema de Gestión del Bote

## Preguntas Frecuentes

### 1. ¿Cómo se calcula el bote de cada socio?

El bote de cada socio se calcula jornada a jornada de la siguiente manera:

**Ingresos:**
- Aportación semanal: +1,50 €
- Premios obtenidos: +cantidad del premio
- Ingresos manuales: +cantidad ingresada (Bizum, transferencia, efectivo)
- Reembolso por sellado (si fue perdedor): +26,25 € (si se ingresa al bote)

**Gastos:**
- Coste columna normal: -0,75 € (o 0 € si ganó la jornada anterior)
- Penalización por unos: -según tabla (1,10 € a 2,00 €)
- Sellado de quinielas: -26,25 € (si fue perdedor de jornada anterior y se reembolsa a cuenta bancaria)

**Bote Acumulado = Bote Anterior + Ingresos - Gastos**

### 2. ¿Por qué algunos socios tienen un icono 🎁?

El icono 🎁 indica que el socio **juega gratis** esa jornada porque ganó la jornada anterior. No paga los 0,75 € de su columna.

### 3. ¿Qué significa el icono 2️⃣?

El icono 2️⃣ indica que el socio **juega la columna de dobles** porque ganó la jornada anterior. Esta columna adicional cuesta 12,00 € y se paga con las aportaciones semanales de todos los socios.

### 4. ¿Cómo funciona el sellado de quinielas?

El **perdedor** de cada jornada debe sellar las quinielas de la siguiente jornada:
1. Paga de su bolsillo: (19 socios × 0,75 €) + 12,00 € = **26,25 €**
2. La Peña le reembolsa esta cantidad de dos formas posibles:
   - **Opción A**: Se ingresa en su bote personal → suma al total de la Peña
   - **Opción B**: Se ingresa en su cuenta bancaria → resta del total de la Peña

### 5. ¿Qué pasa si un socio no rellena su pronóstico?

Si un socio no rellena su pronóstico:
- Se le cobra igualmente la columna (0,75 €)
- No obtiene aciertos (0 aciertos)
- Puede ser el perdedor de la jornada
- Recibe las penalizaciones correspondientes según el reglamento

### 6. ¿Cómo se registran los premios?

Los premios se detectan automáticamente desde el sistema RSS de resultados. Cuando un socio obtiene premio:
- Se suma al bote del socio
- La siguiente jornada juega **gratis** (exención de pago)

### 7. ¿Cómo registro un ingreso manual (Bizum, transferencia)?

1. Click en "➕ Registrar Ingreso"
2. Seleccionar el socio
3. Introducir la cantidad
4. Seleccionar el método (Bizum, Transferencia, Efectivo)
5. Indicar la fecha
6. Opcionalmente, añadir un concepto
7. Click en "Registrar Ingreso"

El sistema asociará automáticamente el ingreso a la jornada más cercana en fecha.

### 8. ¿Puedo cambiar los precios de las columnas?

Sí, desde "⚙️ Configuración" puedes modificar:
- Coste de columna normal (actualmente 0,75 €)
- Coste de columna de dobles (actualmente 12,00 €)
- Aportación semanal (actualmente 1,50 €)
- Bote inicial de la temporada

**Importante**: Los cambios afectan a todas las jornadas. Se recomienda hacer esto solo al inicio de temporada.

### 9. ¿Cómo funciona la penalización por número de unos?

Si un socio pone demasiados "1" en su pronóstico, paga una penalización:
- 10 unos = +1,10 €
- 11 unos = +1,20 €
- 12 unos = +1,30 €
- 13 unos = +1,50 €
- 14 unos = +2,00 €

Esta penalización se suma a los gastos de esa jornada.

### 10. ¿Qué es el "Bote Total de la Peña"?

Es la suma de:
- Todos los botes individuales de los socios
- Más el bote inicial (arrastrado de temporadas anteriores)

Representa el dinero total disponible en la Peña.

### 11. ¿Cómo exporto los datos a Excel?

Click en "📊 Exportar Datos". Se descargará un archivo CSV con:
- Todos los movimientos de todos los socios
- Detalle jornada por jornada
- Todos los conceptos (aportaciones, gastos, premios, etc.)

Puedes abrir este archivo con Excel, Google Sheets o cualquier programa de hojas de cálculo.

### 12. ¿Qué diferencia hay entre las tres vistas?

**Vista General:**
- Muestra un resumen por socio
- Total de ingresos, gastos y bote actual
- Ideal para ver el estado general

**Vista por Jornada:**
- Detalle de cada jornada
- Muestra todos los socios y sus movimientos en cada jornada
- Ideal para revisar una jornada específica

**Vista por Socio:**
- Lista de todos los socios
- Acceso rápido al detalle completo de cada uno
- Ideal para consultas individuales

### 13. ¿Cómo solicito un reparto de ganancias?

Actualmente, el reparto de ganancias se gestiona manualmente. El socio debe:
1. Contactar con el tesorero
2. Indicar la cantidad que desea retirar
3. El tesorero registrará la salida como un gasto negativo

**Nota**: Esta funcionalidad se mejorará en futuras versiones.

### 14. ¿Puedo ver el bote de temporadas anteriores?

Sí, el sistema guarda el histórico de todas las temporadas. Usa el selector "Temporada" para cambiar entre temporadas.

### 15. ¿Qué pasa si hay un empate en ganador/perdedor?

El sistema usa las mismas reglas de desempate que el sistema de puntuación:
1. Se comparan los puntos de la jornada
2. Si hay empate, se mira recursivamente las jornadas anteriores
3. Se determina un único ganador y un único perdedor

## Resolución de Problemas

### El bote no se actualiza

**Posibles causas:**
1. Las jornadas no están completadas (faltan resultados)
2. Los pronósticos no están guardados
3. Error de conexión con la base de datos

**Solución:**
1. Verificar que todas las jornadas tengan resultados completos
2. Recargar la página (F5)
3. Revisar la consola del navegador (F12) para errores

### Los números no coinciden con la hoja Excel

**Posibles causas:**
1. Configuración de precios incorrecta
2. Bote inicial no configurado
3. Ingresos manuales no registrados
4. Diferencias en el cálculo de penalizaciones

**Solución:**
1. Verificar la configuración (⚙️ Configuración)
2. Comparar jornada por jornada para identificar la discrepancia
3. Revisar que todos los ingresos manuales estén registrados
4. Contactar con el administrador si persiste el problema

### No puedo registrar un ingreso

**Posibles causas:**
1. Campos obligatorios vacíos
2. Formato de fecha incorrecto
3. Error de permisos

**Solución:**
1. Verificar que todos los campos obligatorios estén completos
2. Usar el selector de fecha (no escribir manualmente)
3. Verificar que estás logueado correctamente

### El botón "Exportar Datos" no funciona

**Posibles causas:**
1. Bloqueador de descargas del navegador
2. No hay datos para exportar

**Solución:**
1. Permitir descargas en el navegador
2. Verificar que haya al menos una jornada procesada
3. Probar con otro navegador

### Los colores no se ven correctamente

**Posibles causas:**
1. Tema personalizado que sobrescribe los colores
2. Caché del navegador

**Solución:**
1. Limpiar caché del navegador (Ctrl + F5)
2. Revisar la configuración del tema en "Identidad Visual"

## Contacto y Soporte

Para cualquier duda, problema o sugerencia:
- **Tesorero de la Peña**: Responsable principal del sistema de Bote
- **Administrador del Sistema**: Para problemas técnicos
- **Grupo de Telegram**: Para consultas generales

---

**Última actualización**: Febrero 2026
**Versión**: 1.0
