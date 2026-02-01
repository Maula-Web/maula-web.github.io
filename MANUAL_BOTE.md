# Sistema de Gestión del Bote - Peña Maulas

## Descripción General

El sistema de gestión del Bote es una herramienta completa para el control de las cuentas de la Peña. Permite realizar un seguimiento detallado de todos los movimientos económicos de cada socio, jornada a jornada, con cálculos automáticos y reportes detallados.

## Conceptos Clave

### 1. **Bote Individual**
Cada socio tiene su propio bote personal que se actualiza semanalmente según:
- **Ingresos**: Aportaciones semanales, premios obtenidos, ingresos manuales (Bizum, transferencias)
- **Gastos**: Coste de columnas, penalizaciones, sellados

### 2. **Bote Total de la Peña**
Es la suma de todos los botes individuales más el bote inicial de temporadas anteriores.

### 3. **Aportación Semanal**
Cada socio aporta **1,50 €** semanalmente a la Peña. Este dinero se utiliza para:
- Pagar la columna normal (0,75 €)
- Contribuir al pago de la columna de dobles (12,00 € compartidos entre todos)

## Funcionamiento por Jornada

### Costes Automáticos

Para cada jornada, el sistema calcula automáticamente:

1. **Coste de Columna Normal**: 0,75 €
   - **Exención**: Si el socio ganó la jornada anterior, juega GRATIS
   - El coste se reparte entre el resto de socios

2. **Coste de Columna de Dobles**: 12,00 € (compartido)
   - Solo la juega el ganador de la jornada anterior
   - Se paga con las aportaciones semanales de todos los socios (1,50 € × 19 socios = 28,50 €)

3. **Penalización por Número de Unos**:
   - 10 unos = +1,10 €
   - 11 unos = +1,20 €
   - 12 unos = +1,30 €
   - 13 unos = +1,50 €
   - 14 unos = +2,00 €

4. **Sellado de Quinielas**:
   - El perdedor de la jornada anterior sella las quinielas
   - Paga de su bolsillo: (19 socios × 0,75 €) + 12,00 € = **26,25 €**
   - La Peña le reembolsa esta cantidad:
     - **Opción A**: Se ingresa en su bote personal (suma al total de la Peña)
     - **Opción B**: Se ingresa en su cuenta bancaria (resta del total de la Peña)

### Ingresos

1. **Premios**:
   - Se obtienen según los resultados de la quiniela oficial
   - Se registran automáticamente desde el RSS de resultados
   - El socio que obtiene premio juega GRATIS la siguiente jornada

2. **Ingresos Manuales**:
   - Bizum
   - Transferencia bancaria
   - Efectivo
   - Se registran manualmente con fecha, cantidad y concepto

## Vistas Disponibles

### 1. Vista General
Muestra un resumen por socio:
- Total de ingresos acumulados
- Total de gastos acumulados
- Bote actual
- Botón para ver detalle completo

### 2. Vista por Jornada
Muestra el detalle de cada jornada:
- Resumen de la jornada (ingresos, gastos, neto)
- Tabla con todos los socios y sus movimientos
- Indicadores especiales:
  - 🎁 = Juega gratis (ganó la jornada anterior)
  - 2️⃣ = Juega columna de dobles

### 3. Vista por Socio
Lista de todos los socios con acceso rápido a su detalle completo.

## Configuración

El sistema permite configurar:

1. **Coste de Columna Normal**: Precio por columna (actualmente 0,75 €)
2. **Coste de Columna de Dobles**: Precio de la columna de dobles (actualmente 12,00 €)
3. **Aportación Semanal**: Cantidad que aporta cada socio semanalmente (actualmente 1,50 €)
4. **Bote Inicial**: Dinero arrastrado de temporadas anteriores

Estos valores pueden cambiar de una temporada a otra.

## Registro de Ingresos

Para registrar un ingreso manual:

1. Hacer clic en "➕ Registrar Ingreso"
2. Seleccionar el socio
3. Introducir la cantidad
4. Seleccionar el método de pago (Bizum, Transferencia, Efectivo)
5. Indicar la fecha
6. Opcionalmente, añadir un concepto
7. Guardar

El ingreso se asociará automáticamente a la jornada más cercana en fecha.

## Exportación de Datos

El botón "📊 Exportar Datos" genera un archivo CSV con:
- Todos los movimientos de todos los socios
- Detalle jornada por jornada
- Todos los conceptos (aportaciones, gastos, premios, etc.)

Este archivo puede abrirse en Excel para análisis adicionales.

## Control de Vueltas

El sistema está preparado para gestionar:
- **Primera Vuelta**: Cuando todos los equipos han jugado entre sí una vez
- **Segunda Vuelta**: Resto de la temporada
- **Totales**: Resumen completo de la temporada

Los socios pueden solicitar reparto de ganancias:
- Al final de cada vuelta
- Al darse de baja de la Peña

## Histórico de Temporadas

Cada temporada se guarda de forma independiente en la base de datos, permitiendo:
- Consultar el bote de temporadas pasadas
- Comparar evolución entre temporadas
- Mantener un registro histórico completo

## Indicadores de Color

En las tablas:
- **Verde** (positive): Ingresos, saldo positivo
- **Rojo** (negative): Gastos, saldo negativo
- **Amarillo** (neutral): Valores neutros o informativos

## Notas Importantes

1. **Precisión**: Todos los cálculos se realizan con 2 decimales de precisión
2. **Actualización**: El bote se actualiza automáticamente con cada jornada completada
3. **Transparencia**: Todos los movimientos son visibles y trazables
4. **Seguridad**: Solo usuarios autenticados pueden acceder al sistema
5. **Integridad**: El sistema valida que los datos sean coherentes antes de guardarlos

## Ejemplo de Flujo Completo

### Jornada 1 (Primera jornada de la temporada)
- Todos los socios aportan 1,50 €
- Todos pagan su columna (0,75 €)
- No hay columna de dobles (no hay ganador previo)
- Se aplican penalizaciones por unos si corresponde
- **Ganador**: Álvaro (10 aciertos)
- **Perdedor**: Emilio (3 aciertos)

### Jornada 2
- Todos los socios aportan 1,50 €
- **Álvaro juega GRATIS** (ganó J1) → No paga 0,75 €
- **Álvaro juega columna de dobles** (se paga con las aportaciones)
- El resto de socios paga 0,75 € + parte proporcional de la exención de Álvaro
- **Emilio sella las quinielas** (perdió J1):
  - Paga 26,25 € de su bolsillo
  - La Peña le reembolsa 26,25 € (a su bote o cuenta)
- Se aplican penalizaciones por unos
- Nuevo ganador y perdedor para J3

## Soporte

Para cualquier duda o problema con el sistema de Bote, contactar con el administrador o el tesorero de la Peña.

---

**Última actualización**: Febrero 2026
**Versión**: 1.0
