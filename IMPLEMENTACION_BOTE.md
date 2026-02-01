# Implementación del Sistema de Gestión del Bote

## ✅ Implementación Completada

Se ha implementado un sistema completo de gestión de cuentas (Bote) para la Peña Maulas con las siguientes características:

## 📁 Archivos Creados

### 1. **bote.html**
Página principal de la sección Bote con:
- Diseño responsive con tema naranja (#ff9100)
- Tarjetas de resumen (Bote Total, Ingresos, Gastos, Jornadas)
- Controles de vista (General, Detalle por Jornada, Detalle por Socio)
- Modales para registro de ingresos y configuración
- Tabla principal con datos dinámicos

### 2. **js/bote.js**
Lógica completa del sistema:
- Cálculo automático de costes por jornada
- Gestión de aportaciones semanales (1,50 €)
- Control de columnas normales (0,75 €) y dobles (12,00 €)
- Penalizaciones por número de unos
- Sistema de exenciones (ganador juega gratis)
- Gestión de sellados y reembolsos
- Registro de ingresos manuales (Bizum, transferencias, efectivo)
- Tres vistas diferentes de los datos
- Exportación a CSV

### 3. **MANUAL_BOTE.md**
Documentación completa del sistema con:
- Explicación de conceptos clave
- Funcionamiento detallado por jornada
- Guía de uso de todas las funcionalidades
- Ejemplos de flujo completo

## 🎨 Integración en el Menú

Se ha añadido el botón **BOTE** al menú principal:
- **Posición**: Después de "Resultados" y antes de "Resumen Temporada"
- **Color**: Naranja (#ff9100) para destacar
- **Estilo**: Consistente con el resto de botones del menú

### Archivos Modificados:
- **js/auth.js**: Añadido botón Bote en el menú estático y dinámico
- **js/db-service.js**: Añadidas colecciones `bote` e `ingresos`

## 💰 Funcionalidades Principales

### 1. Cálculo Automático de Movimientos
Para cada socio y cada jornada:
- ✅ Aportación semanal: 1,50 €
- ✅ Coste columna normal: 0,75 € (o 0 € si ganó la jornada anterior)
- ✅ Coste columna dobles: compartido entre todos (12,00 € total)
- ✅ Penalización por unos: según tabla (10-14 unos)
- ✅ Sellado: reembolso al perdedor de jornada anterior
- ✅ Premios: integración con sistema RSS
- ✅ Ingresos manuales: Bizum, transferencias, efectivo

### 2. Tres Vistas de Datos

#### Vista General
- Resumen por socio
- Total ingresos, gastos y bote actual
- Botón para ver detalle completo

#### Vista por Jornada
- Detalle de cada jornada
- Tabla con todos los socios
- Indicadores visuales (🎁 gratis, 2️⃣ dobles)
- Resumen de ingresos/gastos por jornada

#### Vista por Socio
- Lista de todos los socios
- Acceso rápido a detalle individual
- Modal con historial completo jornada a jornada

### 3. Gestión de Ingresos
- Formulario para registrar ingresos manuales
- Campos: Socio, Cantidad, Método, Fecha, Concepto
- Asociación automática a jornada más cercana
- Persistencia en base de datos

### 4. Configuración Flexible
- Coste de columna normal (configurable)
- Coste de columna dobles (configurable)
- Aportación semanal (configurable)
- Bote inicial de temporada (configurable)

### 5. Exportación de Datos
- Generación de CSV con todos los movimientos
- Incluye todos los conceptos y detalles
- Nombre de archivo con fecha y temporada
- Compatible con Excel

## 🎯 Reglas Implementadas

### Exenciones
- ✅ El ganador de una jornada juega GRATIS la siguiente
- ✅ El coste se reparte entre el resto de socios

### Columna de Dobles
- ✅ Solo la juega el ganador de la jornada anterior
- ✅ Coste: 12,00 € (pagado con aportaciones semanales)

### Sellado de Quinielas
- ✅ El perdedor sella y paga de su bolsillo
- ✅ Coste: (19 socios × 0,75 €) + 12,00 € = 26,25 €
- ✅ La Peña le reembolsa (a su bote o cuenta bancaria)

### Penalizaciones por Unos
- ✅ 10 unos = +1,10 €
- ✅ 11 unos = +1,20 €
- ✅ 12 unos = +1,30 €
- ✅ 13 unos = +1,50 €
- ✅ 14 unos = +2,00 €

## 📊 Estructura de Datos

### Colección: `bote`
Almacena movimientos calculados (opcional, se puede calcular en tiempo real)

### Colección: `ingresos`
```javascript
{
  id: timestamp,
  memberId: number,
  cantidad: number,
  metodo: 'bizum' | 'transferencia' | 'efectivo',
  fecha: 'YYYY-MM-DD',
  concepto: string,
  timestamp: ISO string
}
```

### Colección: `config`
```javascript
{
  id: 'bote_config',
  costeColumna: 0.75,
  costeDobles: 12.00,
  aportacionSemanal: 1.50,
  boteInicial: 0.00,
  temporadaActual: '2025-2026'
}
```

## 🔄 Integración con Sistema Existente

El sistema de Bote se integra perfectamente con:
- ✅ **Sistema de Socios**: Usa la tabla de members
- ✅ **Sistema de Jornadas**: Lee jornadas y resultados
- ✅ **Sistema de Pronósticos**: Calcula aciertos y penalizaciones
- ✅ **Sistema de Puntuación**: Determina ganadores y perdedores
- ✅ **Sistema RSS**: Detecta premios automáticamente

## 🎨 Diseño Visual

- **Color principal**: Naranja (#ff9100)
- **Tema**: Dark mode con acentos vibrantes
- **Efectos**: Glassmorphism, sombras, transiciones suaves
- **Responsive**: Adaptado a móvil, tablet y desktop
- **Iconos**: Emojis para mejor UX (💰, 🎁, 2️⃣, etc.)

## 📱 Responsive Design

- **Desktop**: Grid de 4 columnas para resumen
- **Tablet**: Grid de 2 columnas
- **Mobile**: Columna única, controles apilados

## 🔐 Seguridad

- ✅ Requiere autenticación (usa sistema auth.js)
- ✅ Solo usuarios logueados pueden acceder
- ✅ Validación de datos en formularios
- ✅ Persistencia segura en Firestore

## 📈 Próximas Mejoras Sugeridas

1. **Integración RSS de Premios**: Detectar automáticamente premios desde RSS
2. **Control de Vueltas**: Marcar fin de primera/segunda vuelta
3. **Solicitud de Reparto**: Formulario para solicitar reparto de ganancias
4. **Notificaciones**: Avisos cuando el bote cambia significativamente
5. **Gráficos**: Visualización de evolución del bote en el tiempo
6. **Comparativas**: Comparar botes entre temporadas

## 🚀 Cómo Usar

1. **Acceder**: Click en botón "BOTE" del menú (naranja)
2. **Ver Resumen**: Vista general muestra estado actual de todos los socios
3. **Cambiar Vista**: Usar selector para ver por jornada o por socio
4. **Registrar Ingreso**: Click en "➕ Registrar Ingreso"
5. **Configurar**: Click en "⚙️ Configuración" para ajustar precios
6. **Exportar**: Click en "📊 Exportar Datos" para descargar CSV

## ⚠️ Notas Importantes

- El sistema calcula automáticamente todos los movimientos
- Los datos se actualizan en tiempo real al completarse jornadas
- La configuración de precios afecta a todas las jornadas futuras
- Los ingresos manuales se asocian a la jornada más cercana en fecha
- El bote total incluye el bote inicial de temporadas anteriores

## 🎓 Formación del Tesorero

Se recomienda que el tesorero:
1. Lea el MANUAL_BOTE.md completo
2. Pruebe todas las funcionalidades en un entorno de prueba
3. Verifique los cálculos con la hoja Excel actual
4. Configure correctamente los precios iniciales
5. Registre el bote inicial de temporadas anteriores

---

**Desarrollado para**: Peña Maulas
**Fecha**: Febrero 2026
**Versión**: 1.0
