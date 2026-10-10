@echo off
chcp 65001 > nul
title PEÑA MAULAS - ACTUALIZAR RESULTADOS QUINIELA
echo ========================================================
echo   ⚽ PEÑA MAULAS - IMPORTADOR AUTOMÁTICO DE RESULTADOS
echo ========================================================
echo.
node scripts\auto_import_quiniela.js
echo.
echo ========================================================
echo   Presiona cualquier tecla para salir...
pause > nul
