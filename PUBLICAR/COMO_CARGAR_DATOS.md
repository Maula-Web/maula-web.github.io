# CÓMO CARGAR LOS DATOS (Jornadas, Resultados...)

Como la web es nueva, está "limpia". Para cargar toda la información histórica que había en los archivos del proyecto (Jornadas pasadas, resultados, pronósticos...), he creado un sistema automático.

### PASO 1: Subir la nueva herramienta (Github Desktop)
1. Abre **GitHub Desktop**.
2. Verás nuevos cambios (He creado `cloud-seeder.js` y modificado `db-service.js`).
3. Resumen: "Herramienta de Carga de Datos".
4. Pulsa **Commit to main**.
5. Pulsa **Push origin**.
6. Espera 2 minutos.

### PASO 2: Activar la carga
1. Entra en tu web: `https://fernandolozanor.github.io/PROYECTO_MAULAS/`
2. Inicia sesión (si no estabas dentro).
3. **Automáticamente**, al entrar, la web detectará que no hay Jornadas y empezará a "leer" los archivos antiguos para subirlos a la nube.
4. Puede que tarde unos segundos o te salga un mensaje diciendo **"¡Datos iniciales cargados!"**.
5. Si vas a la sección `JORNADAS` o `RESULTADOS`, ya debería aparecer todo.

**Nota:** Esto solo ocurre una vez. Una vez cargados, ya se quedan para siempre.
