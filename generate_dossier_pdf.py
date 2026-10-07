# -*- coding: utf-8 -*-
"""
Generador del Dossier Ejecutivo para el Tesorero de la Peña Los Maulas.
Crea un documento HTML ultra estilizado y lo compila a PDF usando Google Chrome Headless.
"""

import os
import base64
import subprocess

BASE_DIR = r"d:\PROYECTO_MAULAS"
LOGO_PATH = os.path.join(BASE_DIR, "LOGO_MAULAS.png")
OUTPUT_HTML = os.path.join(BASE_DIR, "PROPUESTA_TESORERIA_BOTE_DESATENDIDO.html")
OUTPUT_PDF = os.path.join(BASE_DIR, "PROPUESTA_TESORERIA_BOTE_DESATENDIDO.pdf")

# Cargar logo en Base64 si existe
logo_base64 = ""
if os.path.exists(LOGO_PATH):
    with open(LOGO_PATH, "rb") as img_file:
        logo_base64 = base64.b64encode(img_file.read()).decode('utf-8')

html_content = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Propuesta de Modernización y Bote Desatendido - Peña Los Maulas</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  @page {{
    size: A4 portrait;
    margin: 14mm 14mm 16mm 14mm;
    @bottom-center {{
      content: "Peña Los Maulas • Dossier de Optimización de Tesorería";
      font-size: 8pt;
      font-family: 'Plus Jakarta Sans', sans-serif;
      color: #94a3b8;
    }}
    @bottom-right {{
      content: "Página " counter(page);
      font-size: 8pt;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-weight: 600;
      color: #047857;
    }}
  }}

  * {{
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }}

  body {{
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #0f172a;
    background-color: #ffffff;
    font-size: 9.8pt;
    line-height: 1.55;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}

  .page {{
    page-break-after: always;
    position: relative;
    min-height: 255mm;
    display: flex;
    flex-direction: column;
  }}

  .page:last-child {{
    page-break-after: avoid;
  }}

  /* PORTADA */
  .cover-page {{
    background: linear-gradient(145deg, #064e3b 0%, #047857 55%, #059669 100%);
    color: #ffffff;
    padding: 38mm 20mm 24mm 20mm;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    min-height: 265mm;
  }}

  .cover-badge {{
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    padding: 6px 16px;
    border-radius: 999px;
    font-size: 9pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #a7f3d0;
    margin-bottom: 22px;
    width: fit-content;
  }}

  .cover-logo-wrapper {{
    text-align: center;
    margin-bottom: 22px;
  }}

  .cover-logo {{
    max-width: 155px;
    height: auto;
    filter: drop-shadow(0 14px 22px rgba(0,0,0,0.45));
  }}

  .cover-title {{
    font-size: 27pt;
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.5px;
    margin-bottom: 12px;
    color: #ffffff;
    text-shadow: 0 2px 10px rgba(0,0,0,0.2);
  }}

  .cover-subtitle {{
    font-size: 12.5pt;
    font-weight: 400;
    color: #d1fae5;
    line-height: 1.45;
    margin-bottom: 26px;
    max-width: 92%;
  }}

  .cover-divider {{
    height: 3px;
    width: 70px;
    background: #fbbf24;
    border-radius: 2px;
    margin-bottom: 26px;
  }}

  .cover-features-grid {{
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
    margin-bottom: 30px;
  }}

  .cover-feature-card {{
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    padding: 12px 14px;
  }}

  .cover-feature-card h4 {{
    font-size: 9.2pt;
    font-weight: 700;
    color: #fef08a;
    margin-bottom: 4px;
  }}

  .cover-feature-card p {{
    font-size: 7.8pt;
    color: #e2e8f0;
    line-height: 1.35;
  }}

  .cover-meta {{
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 18px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    font-size: 8.5pt;
    color: #a7f3d0;
  }}

  .cover-meta strong {{
    color: #ffffff;
    font-size: 9.5pt;
    display: block;
  }}

  /* ENCABEZADOS Y SECCIONES */
  .section-header {{
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 2px solid #e2e8f0;
    padding-bottom: 10px;
    margin-bottom: 16px;
  }}

  .section-title-wrap {{
    display: flex;
    align-items: center;
    gap: 12px;
  }}

  .section-number {{
    background: #047857;
    color: #ffffff;
    font-weight: 800;
    font-size: 11pt;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }}

  .section-title {{
    font-size: 14.5pt;
    font-weight: 800;
    color: #064e3b;
    letter-spacing: -0.3px;
  }}

  .section-tag {{
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    background: #ecfdf5;
    color: #059669;
    padding: 4px 10px;
    border-radius: 6px;
    border: 1px solid #a7f3d0;
    letter-spacing: 0.5px;
  }}

  h3 {{
    font-size: 10.5pt;
    font-weight: 700;
    color: #0f172a;
    margin: 12px 0 7px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }}

  p {{
    margin-bottom: 9px;
    color: #1e293b;
  }}

  /* KPI CARDS */
  .kpi-row {{
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 11px;
    margin: 12px 0 16px 0;
  }}

  .kpi-card {{
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    padding: 11px;
    text-align: center;
    border-top: 3px solid #047857;
  }}

  .kpi-card.warning {{
    border-top-color: #f59e0b;
  }}

  .kpi-card.danger {{
    border-top-color: #ef4444;
  }}

  .kpi-card.success {{
    border-top-color: #10b981;
  }}

  .kpi-val {{
    font-size: 16pt;
    font-weight: 800;
    color: #090d16;
    margin-bottom: 2px;
  }}

  .kpi-label {{
    font-size: 7.2pt;
    text-transform: uppercase;
    font-weight: 700;
    color: #334155;
    letter-spacing: 0.4px;
  }}

  .kpi-desc {{
    font-size: 6.8pt;
    color: #475569;
    margin-top: 3px;
    font-weight: 500;
  }}

  /* TABLAS */
  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 14px 0;
    font-size: 8.3pt;
  }}

  th {{
    background: #e2e8f0;
    color: #0f172a;
    font-weight: 800;
    text-align: left;
    padding: 7px 9px;
    border-bottom: 2px solid #94a3b8;
    font-size: 7.8pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }}

  td {{
    padding: 7px 9px;
    border-bottom: 1px solid #cbd5e1;
    color: #0f172a;
    vertical-align: top;
  }}

  tr:nth-child(even) td {{
    background: #f8fafc;
  }}

  .badge-yes {{
    background: #dcfce7;
    color: #166534;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7.2pt;
  }}

  .badge-no {{
    background: #fee2e2;
    color: #991b1b;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7.2pt;
  }}

  .badge-warn {{
    background: #fef3c7;
    color: #92400e;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 7.2pt;
  }}

  /* CAJAS DE ALERTA / CALLOUTS */
  .callout {{
    padding: 10px 13px;
    border-radius: 8px;
    margin: 10px 0;
    font-size: 8.5pt;
    line-height: 1.45;
    border-left: 4px solid;
  }}

  .callout.info {{
    background: #eff6ff;
    border-left-color: #3b82f6;
    color: #1e40af;
  }}

  .callout.warning {{
    background: #fffbeb;
    border-left-color: #f59e0b;
    color: #92400e;
  }}

  .callout.danger {{
    background: #fef2f2;
    border-left-color: #ef4444;
    color: #991b1b;
  }}

  .callout.success {{
    background: #f0fdf4;
    border-left-color: #10b981;
    color: #065f46;
  }}

  .callout strong {{
    display: block;
    margin-bottom: 3px;
    font-size: 8.9pt;
  }}

  /* DIAGRAMA DE FLUJO EN CSS/SVG */
  .flow-container {{
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 10px 0;
  }}

  .flow-step {{
    display: flex;
    align-items: center;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    padding: 6px 12px;
    gap: 12px;
  }}

  .flow-step-num {{
    background: #047857;
    color: #ffffff;
    font-weight: 800;
    font-size: 10pt;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }}

  .flow-step-content {{
    flex: 1;
  }}

  .flow-step-content h4 {{
    font-size: 9pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 1px;
  }}

  .flow-step-content p {{
    font-size: 7.9pt;
    color: #1e293b;
    margin: 0;
    line-height: 1.32;
  }}

  .flow-actor {{
    font-size: 7.2pt;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    text-transform: uppercase;
    flex-shrink: 0;
  }}

  .actor-auto {{ background: #e0e7ff; color: #3730a3; }}
  .actor-perdedor {{ background: #fee2e2; color: #991b1b; }}
  .actor-tesorero {{ background: #dcfce7; color: #166534; }}
  .actor-ganador {{ background: #fef3c7; color: #92400e; }}

  /* GRID 2 COLUMNAS */
  .grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 9px 0;
  }}

  .card-box {{
    background: #ffffff;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 12px;
  }}

  .card-box h4 {{
    font-size: 9.1pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 5px;
  }}

  ul.check-list {{
    list-style: none;
    margin: 5px 0;
  }}

  ul.check-list li {{
    font-size: 8pt;
    color: #1e293b;
    padding-left: 17px;
    position: relative;
    margin-bottom: 4px;
    line-height: 1.32;
  }}

  ul.check-list li::before {{
    content: "✓";
    position: absolute;
    left: 0;
    color: #10b981;
    font-weight: 800;
  }}

  ul.cross-list {{
    list-style: none;
    margin: 5px 0;
  }}

  ul.cross-list li {{
    font-size: 8pt;
    color: #1e293b;
    padding-left: 17px;
    position: relative;
    margin-bottom: 4px;
    line-height: 1.32;
  }}

  ul.cross-list li::before {{
    content: "✕";
    position: absolute;
    left: 0;
    color: #ef4444;
    font-weight: 800;
  }}

  .footer-note {{
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px dashed #94a3b8;
    font-size: 7.3pt;
    color: #475569;
    font-weight: 500;
    display: flex;
    justify-content: space-between;
  }}
</style>
</head>
<body>

<!-- ==================== PÁGINA 1: PORTADA ==================== -->
<div class="page">
  <div class="cover-page">
    <div>
      <div class="cover-badge">
        <span>⚡ Plan Estratégico de Tesorería</span>
      </div>

      <div class="cover-logo-wrapper">
        {'<img src="data:image/png;base64,' + logo_base64 + '" class="cover-logo" alt="Logo Peña Maulas">' if logo_base64 else '<div style="font-size:30pt;font-weight:900;">⚽ PEÑA MAULAS</div>'}
      </div>

      <h1 class="cover-title">PROPUESTA DE MODERNIZACIÓN Y BOTE DESATENDIDO</h1>
      <p class="cover-subtitle">
        Modelo integral de optimización: cuota fija de 30 € por 20 jornadas (60 €/temporada) + sellados compensados, saldo reembolsable en todo momento, liquidación con reparto de ganancias y blindaje fiscal.
      </p>

      <div class="cover-divider"></div>

      <div class="cover-features-grid">
        <div class="cover-feature-card">
          <h4>01. Ahorro de Tiempo</h4>
          <p>Reducción del 95% del trabajo del tesorero. Menos de 2 min/jornada frente a los 15-20 min actuales.</p>
        </div>
        <div class="cover-feature-card">
          <h4>02. Cuota Fija y Bote Flexible</h4>
          <p>30 € por 20 J (60 €/año) + sellados compensados. Reclamación de saldo (total o parcial) en todo momento.</p>
        </div>
        <div class="cover-feature-card">
          <h4>03. Reparto y Blindaje Fiscal</h4>
          <p>Reparto de ganancias al cierre o ante premio grande. Protocolo legal para evitar el Impuesto de Donaciones.</p>
        </div>
      </div>
    </div>

    <div class="cover-meta">
      <div>
        <strong>Destinatario:</strong>
        El Tesorero • Peña Los Maulas
      </div>
      <div>
        <strong>Temporada / Fecha:</strong>
        Octubre 2026 • Versión Ejecutiva 1.0
      </div>
      <div>
        <strong>Estado:</strong>
        Propuesta para Debate y Aprobación
      </div>
    </div>
  </div>
</div>

<!-- ==================== PÁGINA 2: DIAGNÓSTICO ACTUAL ==================== -->
<div class="page">
  <div class="section-header">
    <div class="section-title-wrap">
      <div class="section-number">1</div>
      <div class="section-title">Diagnóstico: El "Cuello de Botella" Actual</div>
    </div>
    <div class="section-tag">Análisis Operativo</div>
  </div>

  <p>
    En la actualidad, la Peña Los Maulas cuenta con <strong>19 socios activos</strong>. Cada jornada se juegan <strong>26,25 €</strong> (19 columnas simples a 0,75 € + 1 columna de dobles a 12,00 € financiada comunitariamente). Aunque el sistema de juego y la camaradería funcionan de manera excelente, la gestión económico-administrativa recae casi exclusivamente sobre las espaldas de una sola persona: <strong>el Tesorero</strong>.
  </p>

  <div class="kpi-row">
    <div class="kpi-card danger">
      <div class="kpi-val">Goteo</div>
      <div class="kpi-label">Aportaciones Dispersas</div>
      <div class="kpi-desc">Cobros a ritmos dispares e impredecibles</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-val">~15 h</div>
      <div class="kpi-label">Tiempo Invertido</div>
      <div class="kpi-desc">15-20 min por jornada en gestión</div>
    </div>
    <div class="kpi-card danger">
      <div class="kpi-val">26,25 €</div>
      <div class="kpi-label">Reembolso Semanal</div>
      <div class="kpi-desc">Bizum de vuelta al perdedor</div>
    </div>
    <div class="kpi-card success">
      <div class="kpi-val">0 €</div>
      <div class="kpi-label">Remuneración</div>
      <div class="kpi-desc">Labor altruista del tesorero</div>
    </div>
  </div>

  <h3>🔍 Puntos Críticos del Modelo Vigente</h3>
  
  <div class="grid-2">
    <div class="card-box" style="border-left: 4px solid #ef4444;">
      <h4 style="color:#b91c1c;">🚫 Fricción Operativa Constante</h4>
      <ul class="cross-list">
        <li><strong>Aportaciones a ritmos dispares:</strong> Cada socio ingresa cuando se le agota el saldo, obligando al tesorero a gestionar un goteo constante de transferencias desordenadas.</li>
        <li><strong>Doble transacción por sellado:</strong> El perdedor paga 26,25 € y espera que el tesorero le devuelva el dinero por Bizum o lo anote a mano en la base de datos.</li>
        <li><strong>Vigilancia de saldos y "morosos":</strong> Hay que revisar periódicamente quién entra en negativo o bajo mínimos y recordarle individualmente que tiene que aportar.</li>
      </ul>
    </div>
    <div class="card-box" style="border-left: 4px solid #f59e0b;">
      <h4 style="color:#b45309;">⚠️ Riesgos Financieros y Bancarios</h4>
      <ul class="cross-list">
        <li><strong>Descuadres y falta de fecha fija:</strong> Al no haber un cobro unificado, conciliar el dinero del bote con el saldo de la web requiere un esfuerzo de cuadre continuo.</li>
        <li><strong>Mezcla de dinero personal:</strong> Sin cuenta dedicada, el dinero de la peña convive en la cuenta corriente personal del tesorero.</li>
        <li><strong>Incertidumbre antes del cierre:</strong> La Peña debe vigilar contra reloj si el perdedor selló antes del inicio de la jornada.</li>
      </ul>
    </div>
  </div>

  <div class="callout warning">
    <strong>El Objetivo de esta Propuesta:</strong>
    Convertir al Tesorero de un <em>"cajero automático y cobrador del frac"</em> que dedica entre 15 y 20 minutos por jornada, en un <strong>auditor pasivo</strong> que dedica menos de 2 minutos semanales a supervisar que la máquina funcione sola, con saldo disponible para los socios en todo momento y opción de reparto de ganancias.
  </div>

  <div class="footer-note">
    <span>Peña Los Maulas • Diagnóstico de Situación</span>
    <span>Documento Confidencial Interno</span>
  </div>
</div>

<!-- ==================== PÁGINA 3: VIABILIDAD TÉCNICA ==================== -->
<div class="page">
  <div class="section-header">
    <div class="section-title-wrap">
      <div class="section-number">2</div>
      <div class="section-title">Análisis Técnico: ¿Se Puede Automatizar al 100% el Sellado?</div>
    </div>
    <div class="section-tag">Auditoría Tecnológica</div>
  </div>

  <p>
    Se evaluó la posibilidad de que la aplicación web de Los Maulas presentase y sellase las quinielas directamente de forma automática (desatendida por software) en <strong>TuLotero</strong> o en el <strong>Canal Oficial de Loterías y Apuestas del Estado (SELAE)</strong>.
  </p>

  <h3>📊 Comparativa de Canales de Validación Online</h3>

  <table>
    <thead>
      <tr>
        <th>Canal Evaluado</th>
        <th>¿API Oficial?</th>
        <th>¿Carga Ficheros .TXT?</th>
        <th>Coste / Comisión</th>
        <th>Veredicto de Automatización</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>TuLotero</strong> (App / Web)</td>
        <td><span class="badge-no">No existe</span></td>
        <td><span class="badge-no">No permite</span></td>
        <td>0 € (Precio oficial)</td>
        <td><span class="badge-no">DESACONSEJADO</span> Prohíbe bots en sus términos. Riesgo de bloqueo de cuenta y saldo.</td>
      </tr>
      <tr>
        <td><strong>SELAE Oficial</strong> (loteriasyapuestas.es)</td>
        <td><span class="badge-no">No existe</span></td>
        <td><span class="badge-no">No para usuarios</span></td>
        <td>0 € (Precio oficial)</td>
        <td><span class="badge-no">INVIABLE</span> Requiere DNI/2FA, bloqueo por bots y sin pasarela programática.</td>
      </tr>
      <tr>
        <td><strong>Administración Autorizada</strong> (ej. Eduardo Losilla / Quinielista)</td>
        <td><span class="badge-warn">Solo web</span></td>
        <td><span class="badge-yes">Sí (Soporte Magnético)</span></td>
        <td>0 € (Gratuito)</td>
        <td><span class="badge-yes">VIABLE SEMI-AUTOMÁTICO</span> La app genera el archivo .txt y el socio lo arrastra en 10 seg.</td>
      </tr>
      <tr>
        <td><strong>Administración Física Asociada</strong> (Punto de venta oficial)</td>
        <td><span class="badge-yes">Vía Email / Terminal</span></td>
        <td><span class="badge-yes">Sí (Terminal ASLA)</span></td>
        <td>0 € (Gratuito)</td>
        <td><span class="badge-warn">EN ESTUDIO (NO PROBADO)</span> Envío de archivo desde Penalosmaulas@gmail.com a lotero para validación desatendida.</td>
      </tr>
    </tbody>
  </table>

  <h3>💡 Conclusiones Técnicas: Dos Vías Complementarias</h3>

  <div class="grid-2">
    <div class="card-box">
      <h4>Opción Principal: Autónomo en el Socio (Probada y Lista)</h4>
      <p style="font-size:8pt;color:#1e293b;">
        Para evitar bots frágiles en TuLotero, <strong>la app le entrega la jugada 100% preparada al socio perdedor</strong>: plantilla visual o fichero .txt para plataformas que admiten archivos (ej. Eduardo Losilla / Quinielista). El socio sella en 1 minuto y la app computa el reembolso automáticamente en el bote.
      </p>
    </div>
    <div class="card-box">
      <h4>Opción en Estudio: Envío Directo ASLA por Email</h4>
      <p style="font-size:8pt;color:#1e293b;">
        Existe una segunda vía en análisis: enviar automáticamente el fichero .txt de apuestas por correo desde la cuenta oficial de la Peña (<strong>Penalosmaulas@gmail.com</strong>) a una administración con terminal ASLA que valide contra saldo en depósito. <em>*Nota: Esta vía requiere acuerdo con un lotero, está en estudio y aún no se ha probado.*</em>
      </p>
    </div>
  </div>

  <div class="callout info">
    <strong>Estrategia Adoptada:</strong>
    Se implanta de inmediato la <strong>Opción Principal</strong> (sellado autónomo por el socio con compensación en el bote), mientras se analiza en paralelo la viabilidad de la <strong>Opción ASLA por email</strong> desde Penalosmaulas@gmail.com como evolución desatendida.
  </div>

  <div class="footer-note">
    <span>Peña Los Maulas • Viabilidad Tecnológica</span>
    <span>Auditoría de Sistemas SELAE y TuLotero</span>
  </div>
</div>

<!-- ==================== PÁGINA 4: EL FLUJO DESATENDIDO ==================== -->
<div class="page">
  <div class="section-header">
    <div class="section-title-wrap">
      <div class="section-number">3</div>
      <div class="section-title">El Nuevo Modelo: Flujo de Bote Desatendido</div>
    </div>
    <div class="section-tag">Operativa Semanal y Extraordinaria</div>
  </div>

  <p>
    El pilar maestro del sistema es la <strong>Compensación Contable en el Bote Virtual</strong>. El socio perdedor adelanta el sellado con su propio dinero y la aplicación se lo devuelve de forma inmediata como saldo positivo en la web, sin necesidad de transferencias bancarias intermedias.
  </p>

  <div class="flow-container">
    <div class="flow-step">
      <div class="flow-step-num">1</div>
      <div class="flow-step-content">
        <h4>Carga de Resultados y Asignación de Roles</h4>
        <p>Al concluir los partidos, se introducen los resultados en la app (método manual temporal hasta contar con una importación automatizada estable). Con estos datos, la web calcula los aciertos al instante y proclama al Ganador (juega gratis y hace dobles) y al Perdedor (encargado de sellar).</p>
      </div>
      <div class="flow-actor actor-auto">Datos + App</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num">2</div>
      <div class="flow-step-content">
        <h4>Confección del Boleto y Alertas</h4>
        <p>La app indica ganador y perdedor. Los socios rellenan sus columnas + columna de dobles.</p>
      </div>
      <div class="flow-actor actor-ganador">Socios + App</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num">3</div>
      <div class="flow-step-content">
        <h4>Sellado por el Socio Perdedor</h4>
        <p>El perdedor entra en la web, consulta el boleto o copia la combinación, entra en TuLotero (o administración) y abona los 26,25 € de su bolsillo con su tarjeta.</p>
      </div>
      <div class="flow-actor actor-perdedor">Socio Perdedor</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num">4</div>
      <div class="flow-step-content">
        <h4>Confirmación en 1 Clic: "He Sellado"</h4>
        <p>El perdedor pulsa en la app el botón <strong>[ He Sellado la Jornada ]</strong> y adjunta la foto/captura del resguardo oficial emitido.</p>
      </div>
      <div class="flow-actor actor-perdedor">Socio Perdedor</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num">5</div>
      <div class="flow-step-content">
        <h4>Abono Contable Inmediato (+26,25 €)</h4>
        <p>En el acto, la base de datos suma +26,25 € al bote personal del perdedor. <strong>Cero Bizums del tesorero.</strong> Su gasto queda compensado para sus futuras cuotas.</p>
      </div>
      <div class="flow-actor actor-auto">App Automática</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num">6</div>
      <div class="flow-step-content">
        <h4>Auditoría Pasiva del Tesorero (Si procede)</h4>
        <p>El tesorero recibe un aviso de resguardo validado. Solo si lo desea, echa un vistazo al resguardo. Si el perdedor no ha sellado a 2h del límite, salta semáforo rojo.</p>
      </div>
      <div class="flow-actor actor-tesorero">Tesorero (1 min)</div>
    </div>
  </div>

  <h3>🔄 Flujos Extraordinarios: Liquidez Inmediata y Reparto de Ganancias</h3>
  
  <div class="grid-2">
    <div class="card-box" style="border-left: 3px solid #10b981;">
      <h4 style="color:#047857;">💸 Reclamación de Saldo en Todo Momento</h4>
      <p style="font-size:7.8pt;color:#1e293b;margin:0;line-height:1.35;">
        Cualquier socio puede <strong>reclamar dinero de su bote (total o parcial) en cualquier momento</strong>. Si ha acumulado saldo positivo por sellar o premios, el tesorero transfiere desde Revolut en segundos y la web ajusta el saldo. Cero dinero retenido.
      </p>
    </div>
    <div class="card-box" style="border-left: 3px solid #3b82f6;">
      <h4 style="color:#1d4ed8;">🏆 Reparto de Ganancias (Cierre o Premio Grande)</h4>
      <p style="font-size:7.8pt;color:#1e293b;margin:0;line-height:1.35;">
        <strong>Al final de la Temporada</strong> se liquidan los botes y se pueden <strong>repartir las ganancias acumuladas</strong> (remanente y premios). Asimismo, ante el cobro de un <strong>premio "grande"</strong>, se activa el reparto de ganancias extraordinario directo a cada socio.
      </p>
    </div>
  </div>

  <div class="footer-note">
    <span>Peña Los Maulas • Flujo Operativo Desatendido</span>
    <span>Ciclo Semanal Autónomo y Liquidez Total</span>
  </div>
</div>

<!-- ==================== PÁGINA 5: RESPALDO FINANCIERO ==================== -->
<div class="page">
  <div class="section-header">
    <div class="section-title-wrap">
      <div class="section-number">4</div>
      <div class="section-title">El Respaldo Financiero: ¿Dónde está el Dinero Real?</div>
    </div>
    <div class="section-tag">Economía Real vs Virtual</div>
  </div>

  <p>
    Para que el sistema de compensación virtual funcione sin que ningún socio actúe como "prestamista", <strong>es indispensable contar con un Fondo de Respaldo Físico Real</strong>. El modelo financiero se basa en que <strong>cada socio aporta 30 € por cada bloque de 20 jornadas (60 € en total por Temporada) + los posibles sellados que le toque asumir cuando pierda (26,25 € por sellado)</strong>. Presupuestar 40 apuestas (2 vueltas de 20) sobre las ~35 jornadas reales de liga aporta un <strong>margen de seguridad de 5 jornadas</strong> (142,50 € de remanente) que absorbe imprevistos y se arrastra a la bolsa de ganancias.
  </p>

  <h3>💰 Estructura de Aportaciones (Temporada de 40 Apuestas)</h3>

  <div class="kpi-row">
    <div class="kpi-card success">
      <div class="kpi-val" style="white-space:nowrap;">30,00&nbsp;€</div>
      <div class="kpi-label">Cuota Vuelta (20 J)</div>
      <div class="kpi-desc">60,00 € por Temporada (2 pagos)</div>
    </div>
    <div class="kpi-card success">
      <div class="kpi-val" style="white-space:nowrap;">+ Sellados</div>
      <div class="kpi-label">Posibles Sellados</div>
      <div class="kpi-desc">26,25 € perdedor (al bote)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-val" style="white-space:nowrap;">100% Libre</div>
      <div class="kpi-label">Reclamación Total/Parcial</div>
      <div class="kpi-desc">Retirada del bote en todo momento</div>
    </div>
    <div class="kpi-card warning">
      <div class="kpi-val" style="white-space:nowrap;">A Fin de Año</div>
      <div class="kpi-label">Reparto de Ganancias</div>
      <div class="kpi-desc">Liquidación o premio grande</div>
    </div>
  </div>

  <h3>📈 Simulación Matemática de Saldos (Ejemplo 4 Jornadas)</h3>
  <p style="font-size:8pt;color:#1e293b;">
    Observa cómo los números en la app se mueven con precisión matemática mientras el fondo en el banco permanece seguro respaldando cada céntimo:
  </p>

  <table>
    <thead>
      <tr>
        <th>Socio</th>
        <th style="white-space:nowrap;">Día 0 (Ingreso)</th>
        <th style="white-space:nowrap;">J1 (Gasto Normal)</th>
        <th style="white-space:nowrap;">J2 (Le toca Sellar)</th>
        <th style="white-space:nowrap;">J3 (Gasto Normal)</th>
        <th style="white-space:nowrap;">Saldo App J3</th>
        <th>Situación Real</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="white-space:nowrap;"><strong>Socio A</strong> (Sella J2)</td>
        <td style="white-space:nowrap;">+30,00&nbsp;€</td>
        <td style="white-space:nowrap;">-1,50&nbsp;€ (28,50&nbsp;€)</td>
        <td style="white-space:nowrap;"><strong>-1,50&nbsp;€ +&nbsp;26,25&nbsp;€</strong></td>
        <td style="white-space:nowrap;">-1,50&nbsp;€</td>
        <td style="white-space:nowrap;"><strong style="color:#047857;">+51,75&nbsp;€</strong></td>
        <td>Ha pagado 26,25&nbsp;€ de su tarjeta; tiene saldo a favor o puede retirarlo cuando quiera.</td>
      </tr>
      <tr>
        <td style="white-space:nowrap;"><strong>Socio B</strong> (Gana J1)</td>
        <td style="white-space:nowrap;">+30,00&nbsp;€</td>
        <td style="white-space:nowrap;">-1,50&nbsp;€ (28,50&nbsp;€)</td>
        <td style="white-space:nowrap;"><strong>0,00&nbsp;€ (Gratis)</strong></td>
        <td style="white-space:nowrap;">-1,50&nbsp;€</td>
        <td style="white-space:nowrap;"><strong style="color:#047857;">+27,00&nbsp;€</strong></td>
        <td>Exención de pago aplicada automáticamente por ser ganador.</td>
      </tr>
      <tr>
        <td style="white-space:nowrap;"><strong>Socio C</strong></td>
        <td style="white-space:nowrap;">+30,00&nbsp;€</td>
        <td style="white-space:nowrap;">-1,50&nbsp;€ (28,50&nbsp;€)</td>
        <td style="white-space:nowrap;">-1,50&nbsp;€ (27,00&nbsp;€)</td>
        <td style="white-space:nowrap;">-1,50&nbsp;€</td>
        <td style="white-space:nowrap;"><strong style="color:#047857;">+25,50&nbsp;€</strong></td>
        <td>Consumo regular de su cuota adelantada de la primera vuelta.</td>
      </tr>
      <tr>
        <td style="white-space:nowrap;"><strong>TOTAL BANCO</strong></td>
        <td style="white-space:nowrap;"><strong>570,00&nbsp;€</strong></td>
        <td style="white-space:nowrap;"><strong>570,00&nbsp;€</strong></td>
        <td style="white-space:nowrap;"><strong>570,00&nbsp;€</strong></td>
        <td style="white-space:nowrap;"><strong>570,00&nbsp;€</strong></td>
        <td style="white-space:nowrap;"><strong>570,00&nbsp;€</strong></td>
        <td><strong>El dinero físico no se toca. Respalda el 100% de la peña.</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="grid-2" style="margin: 6px 0;">
    <div class="callout success" style="margin: 0; padding: 8px 11px;">
      <strong>💸 Reclamación de Saldo en Todo Momento:</strong>
      El dinero del socio nunca está atrapado. Cualquier socio puede <strong>reclamar dinero de su bote (total o parcial) en cualquier momento</strong>. El tesorero emite la transferencia desde Revolut en segundos y la web ajusta su saldo al instante.
    </div>
    <div class="callout info" style="margin: 0; padding: 8px 11px;">
      <strong>🏆 Liquidación Final y Reparto de Ganancias:</strong>
      Al final de temporada (o al cierre de vuelta), se regularizan las cuentas y <strong>se pueden repartir las ganancias generadas</strong> (remanente de jornadas no jugadas y premios). Asimismo, ante cualquier premio grande, se reparte de inmediato.
    </div>
  </div>

  <div class="footer-note">
    <span>Peña Los Maulas • Respaldo Financiero Real</span>
    <span>Modelo de Fondo de Maniobra y Liquidez Garantizada</span>
  </div>
</div>

<!-- ==================== PÁGINA 6: SOLUCIÓN BANCARIA REVOLUT ==================== -->
<div class="page">
  <div class="section-header">
    <div class="section-title-wrap">
      <div class="section-number">5</div>
      <div class="section-title">La Solución Bancaria: Análisis Integral de Revolut</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <svg width="105" height="24" viewBox="0 0 105 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="6" fill="#191C1F"/>
        <path d="M14.5 7.2H9.8V16.8H11.9V13.3H13.8L15.8 16.8H18.3L15.9 12.8C16.9 12.3 17.6 11.3 17.6 10C17.6 8.3 16.3 7.2 14.5 7.2ZM14.2 11.3H11.9V9.1H14.2C15 9.1 15.6 9.6 15.6 10.2C15.6 10.8 15 11.3 14.2 11.3Z" fill="white"/>
        <text x="32" y="17" font-family="'Plus Jakarta Sans', -apple-system, sans-serif" font-weight="800" font-size="15" fill="#191C1F" letter-spacing="-0.3">Revolut</text>
      </svg>
      <div class="section-tag">Infraestructura</div>
    </div>
  </div>

  <p>
    Para evitar mezclar el dinero de la peña con el sueldo o los gastos personales del tesorero, se requiere una cuenta independiente. Analizamos por qué <strong>Revolut</strong> es la herramienta idónea y cómo sortear las limitaciones legales.
  </p>

  <h3>⚖️ ¿Puede una Cuenta Tener 19 Titulares? (Mito vs Realidad)</h3>
  
  <div class="callout danger">
    <strong>Imposibilidad Legal de 19 Cotitulares Bancarios:</strong>
    En España y la UE, ninguna entidad bancaria permite 19 particulares en una misma cuenta corriente. El límite de Revolut en Cuentas Conjuntas es de <strong>máximo 2 personas</strong>. Además, tener 19 titulares expondría el dinero de la peña a que, si un socio sufre un embargo personal (multas, Hacienda), la cuenta común quede bloqueada.
  </div>

  <div class="grid-2">
    <div class="card-box">
      <h4>¿Qué pasa con los Group Pockets de Revolut?</h4>
      <p style="font-size:8pt;color:#1e293b;">
        Revolut cuenta con la función de <strong>Group Pockets</strong> (<a href="https://help.revolut.com/es-ES/help/app-features/vaults/how-do-i-manage-a-group-pocket/" target="_blank" style="color:#047857;font-weight:700;text-decoration:underline;">guía oficial de gestión de Group Pockets</a>), donde varios usuarios pueden aportar fondos y consultar el saldo acumulado. Sin embargo, <strong>exige que los 19 socios estén registrados en Revolut con su DNI</strong>. Si varios socios no quieren abrirse cuenta, la operativa se rompe. Además, los Group Pockets no permiten asociar tarjetas de débito directamente para pagar el sellado.
      </p>
    </div>
    <div class="card-box">
      <h4 style="color:#047857;">La Fórmula Perfecta: Cuenta Dedicada del Tesorero</h4>
      <p style="font-size:8pt;color:#1e293b;">
        El <strong>Tesorero</strong> abre una cuenta gratuita en Revolut <strong>exclusiva para la Peña</strong> (sin mezclar un solo céntimo con su dinero personal). La fiscalización y transparencia no requieren figuras ficticias: las ejercen los 19 socios en tiempo real a través de la web y los extractos oficiales en PDF.
      </p>
    </div>
  </div>

  <h3>🌟 Ventajas de Revolut para la Peña Los Maulas</h3>

  <div class="grid-2">
    <div class="card-box">
      <ul class="check-list">
        <li><strong>IBAN Español Oficial (ES...):</strong> Supervisado por el Banco de España, idéntico a cualquier banco tradicional.</li>
        <li><strong>Coste 0 € Absoluto:</strong> Sin comisiones de apertura, mantenimiento, ni exigencia de nómina en el Plan Estándar.</li>
        <li><strong>Transferencias Inmediatas Gratis:</strong> Para cobrar las cuotas semestrales de 30 € o devolver el bote en segundos cuando un socio reclama saldo.</li>
      </ul>
    </div>
    <div class="card-box">
      <ul class="check-list">
        <li><strong>Enlaces de Pago por Tarjeta:</strong> El tesorero envía un link por WhatsApp y el socio paga con Apple/Google Pay.</li>
        <li><strong>Extractos en PDF Limpios:</strong> En 1 clic se descarga el balance oficial con los nombres de todos los socios.</li>
        <li><strong>Bizum Integrado:</strong> Posibilidad de recibir aportaciones directamente por Bizum.</li>
      </ul>
    </div>
  </div>

  <div class="callout success">
    <strong>Transparencia Absoluta = Revolut + Web de Los Maulas:</strong>
    El banco actúa de caja fuerte inerte; la web de Los Maulas es el libro de cuentas público abierto 24/7 para los 19 socios. El extracto bancario de Revolut coincide al céntimo con el saldo total del bote que muestra la web.
  </div>

  <div class="footer-note">
    <span>Peña Los Maulas • Solución Bancaria</span>
    <span>Revolut como Caja Fuerte Digital</span>
  </div>
</div>

<!-- ==================== PÁGINA 7: BLINDAJE FISCAL Y PREMIOS ==================== -->
<div class="page">
  <div class="section-header">
    <div class="section-title-wrap">
      <div class="section-number">6</div>
      <div class="section-title">Blindaje Fiscal ante Hacienda y Gestión de Premios</div>
    </div>
    <div class="section-tag">Aspectos Tributarios (AEAT)</div>
  </div>

  <p>
    Uno de los mayores temores al gestionar peñas es qué ocurre si toca un premio relevante. Si se gestiona mal, <strong>Hacienda puede reclamar entre un 34% y un 60% en concepto de Impuesto de Donaciones</strong>. Así es como se blinda legalmente la peña:
  </p>

  <div class="callout danger">
    <strong>⚠️ ALERTA FISCAL CRÍTICA: La Trampa de Cobrar en una Sola Cuenta</strong>
    Si toca un premio de 100.000 € y se cobra íntegro en la cuenta de Revolut (o de un socio) para luego hacer 18 transferencias a los amigos, la Agencia Tributaria (AEAT) presume que el boleto era de una sola persona y que el reparto posterior es una <strong>DONACIÓN ENTRE PARTICULARES SIN PARENTESCO (Grupo IV)</strong>. ¡El desastre fiscal sería monumental!
  </div>

  <h3>🛡️ Protocolo Oficial para Cobrar Premios según su Importe</h3>

  <div class="grid-2">
    <div class="card-box" style="border-top: 3px solid #10b981;">
      <h4>A. Premios Menores (&lt; 2.000 €)</h4>
      <p style="font-size:8pt;color:#1e293b;">
        Son los premios semanales ordinarios de escrutinio (de 10 a 300 €):
      </p>
      <ul class="check-list">
        <li>El dinero entra en la cuenta de TuLotero del socio perdedor que realizó el sellado.</li>
        <li><strong>Los premios van al Bote de la Peña:</strong> Pertenecen al fondo común de la Peña (beneficio colectivo), van acumulándose y al final de temporada forman parte de la bolsa para <strong>repartir ganancias</strong> entre los 19 socios o financiar cuotas futuras.</li>
        <li><strong>Compensación contable sin transferencias:</strong> Como el perdedor tiene ese dinero en su TuLotero, la app suma el premio al bote de la Peña y se lo descuenta al perdedor de su saldo personal (como cobro adelantado de sus cuotas), cuadrando las cuentas al céntimo.</li>
      </ul>
    </div>

    <div class="card-box" style="border-top: 3px solid #3b82f6;">
      <h4>B. Premios Mayores / Grandes (≥ 2.000 €)</h4>
      <p style="font-size:8pt;color:#1e293b;">
        Premios sujetos a retención oficial y cobro bancario con reparto directo:
      </p>
      <ul class="check-list">
        <li><strong>NO se cobran por app ni por Revolut.</strong> SELAE exige acudir a CaixaBank o BBVA.</li>
        <li>Se presentan los <strong>19 DNIs de los socios</strong> y sus números de cuenta personales.</li>
        <li>El banco practica la retención del 20% y transfiere a cada socio su parte limpia de las ganancias desde SELAE.</li>
        <li><strong>Cero Impuesto de Donaciones:</strong> Dinero 100% legal, justificado y repartido entre los 19 socios.</li>
      </ul>
    </div>
  </div>

  <h3>📑 La App de Los Maulas como Escudo Jurídico</h3>
  <p style="font-size:8pt;color:#1e293b;">
    La Dirección General de Tributos (DGT) exige acreditar que el grupo y las participaciones existían <strong>antes de la celebración del sorteo</strong>. Vuestra web aporta pruebas periciales incontestables:
  </p>

  <div class="grid-2">
    <div class="card-box">
      <ul class="check-list">
        <li><strong>Marcas de Tiempo (Timestamps):</strong> Pronósticos registrados en base de datos con fecha y hora exacta previa a los partidos.</li>
        <li><strong>Resguardo Público:</strong> Imagen del boleto validado colgada en la web antes del pitido inicial.</li>
      </ul>
    </div>
    <div class="card-box">
      <ul class="check-list">
        <li><strong>Registro Histórico del Bote:</strong> Contabilidad ininterrumpida que prueba que se trata de una peña regular.</li>
        <li><strong>Estatutos Digitales:</strong> Normas de juego aceptadas por todos los socios en el sistema.</li>
      </ul>
    </div>
  </div>

  <div class="footer-note">
    <span>Peña Los Maulas • Seguridad Tributaria</span>
    <span>Doctrina Oficial DGT y SELAE</span>
  </div>
</div>

<!-- ==================== PÁGINA 8: PLAN DE ACCIÓN Y CONCLUSIÓN ==================== -->
<div class="page">
  <div class="section-header">
    <div class="section-title-wrap">
      <div class="section-number">7</div>
      <div class="section-title">Hoja de Ruta de Implantación y Conclusiones</div>
    </div>
    <div class="section-tag">Plan de Acción</div>
  </div>

  <p>
    La transición a este modelo no requiere desarrollos complejos ni semanas de trabajo. Puede ponerse en marcha de inmediato siguiendo cuatro hitos estructurados:
  </p>

  <div class="flow-container">
    <div class="flow-step">
      <div class="flow-step-num" style="background:#3b82f6;">F1</div>
      <div class="flow-step-content">
        <h4>Presentación y Acuerdo entre Socios</h4>
        <p>Presentación de este dossier al Tesorero y acuerdo con los 19 socios: adopción del cobro por vueltas (30 € / 20 J = 60 € temporada + sellados compensados), saldo rescatable en todo momento y opción de reparto de ganancias.</p>
      </div>
      <div class="flow-actor actor-tesorero">Semana 1</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num" style="background:#3b82f6;">F2</div>
      <div class="flow-step-content">
        <h4>Apertura de la Cuenta Dedicada en Revolut</h4>
        <p>El Tesorero abre la cuenta gratuita en Revolut exclusiva para la Peña (5 minutos desde el móvil), gestionada con el correo oficial <strong>Penalosmaulas@gmail.com</strong>. Comparte el IBAN español en el grupo para recaudar la Vuelta 1 (570 €).</p>
      </div>
      <div class="flow-actor actor-tesorero">Semana 1</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num" style="background:#3b82f6;">F3</div>
      <div class="flow-step-content">
        <h4>Activación del Módulo en la Web de Los Maulas</h4>
        <p>Habilitar el botón "He Sellado" para el perdedor, la carga de resguardo y la asignación automática del crédito de +26,25 € al bote personal.</p>
      </div>
      <div class="flow-actor actor-auto">Semana 2</div>
    </div>

    <div class="flow-step">
      <div class="flow-step-num" style="background:#3b82f6;">F4</div>
      <div class="flow-step-content">
        <h4>Operación en Modo Piloto Desatendido</h4>
        <p>Arranque de la primera jornada bajo el nuevo sistema. El tesorero disfruta de su primer fin de semana libre de micro-gestión.</p>
      </div>
      <div class="flow-actor actor-ganador">En Marcha</div>
    </div>
  </div>

  <h3>📊 Balance Final de Beneficios para el Tesorero</h3>

  <table>
    <thead>
      <tr>
        <th style="width:20%;">Área de Gestión</th>
        <th style="width:40%;background:#fee2e2;color:#991b1b;border-bottom:2px solid #f87171;">⚠️ Con el Sistema Tradicional (Actual)</th>
        <th style="width:40%;background:#dbeafe;color:#1e40af;border-bottom:2px solid #60a5fa;">🚀 Con el Sistema Desatendido (Propuesto)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Cobro de Cuotas</strong></td>
        <td style="background:#fff5f5;color:#7f1d1d;border-color:#fecaca;">Aportaciones puntuales irregulares; vigilar saldos y recordar pagos a socios "morosos"</td>
        <td style="background:#f0f7ff;color:#1e3a8a;border-color:#bfdbfe;">30 € por 20 jornadas (60 € por Temporada) + posibles sellados de 26,25 € al perder</td>
      </tr>
      <tr>
        <td><strong>Disponibilidad del Bote</strong></td>
        <td style="background:#fff5f5;color:#7f1d1d;border-color:#fecaca;">Descuadre y dudas sobre el saldo adelantado; dinero conviviendo en cuenta ajena</td>
        <td style="background:#f0f7ff;color:#1e3a8a;border-color:#bfdbfe;">Reclamación del dinero del bote (total o parcial) en todo momento; transferencia inmediata</td>
      </tr>
      <tr>
        <td><strong>Reembolso del Sellado</strong></td>
        <td style="background:#fff5f5;color:#7f1d1d;border-color:#fecaca;">Bizum semanal de 26,25 € al perdedor tras cada jornada</td>
        <td style="background:#f0f7ff;color:#1e3a8a;border-color:#bfdbfe;">Compensación virtual automática (+26,25 € al bote personal en 1 clic)</td>
      </tr>
      <tr>
        <td><strong>Reparto de Ganancias</strong></td>
        <td style="background:#fff5f5;color:#7f1d1d;border-color:#fecaca;">Cálculo manual, retenciones y transferencias sueltas desordenadas</td>
        <td style="background:#f0f7ff;color:#1e3a8a;border-color:#bfdbfe;">Liquidación y reparto de ganancias a fin de temporada o cobro directo de premio grande</td>
      </tr>
      <tr>
        <td><strong>Tiempo Dedicado</strong></td>
        <td style="background:#fee2e2;color:#991b1b;font-weight:700;border-color:#fecaca;">15 - 20 minutos por jornada (~15 h / temporada)</td>
        <td style="background:#dbeafe;color:#1e40af;font-weight:700;border-color:#bfdbfe;">Menos de 2 minutos de supervisión pasiva (Paz mental)</td>
      </tr>
    </tbody>
  </table>

  <div class="callout success">
    <strong>En resumen para el Tesorero:</strong>
    Este plan no busca quitarle control al tesorero, sino <strong>quitarle el trabajo esclavo de cajero</strong>. La Peña gana en modernidad, transparencia y rigor financiero, y el tesorero puede dedicar más tiempo a ensobrar billetes o lo que le apetezca.
  </div>

  <div class="footer-note">
    <span>Peña Los Maulas • Conclusión y Hoja de Ruta</span>
    <span>¡Listo para presentar al Tesorero!</span>
  </div>
</div>

</body>
</html>
"""

with open(OUTPUT_HTML, "w", encoding="utf-8") as f:
    f.write(html_content)

print(f"HTML generado exitosamente en: {OUTPUT_HTML}")

# Determinar archivo de salida PDF (si el original está abierto en Acrobat, usar v2)
target_pdf = OUTPUT_PDF
try:
    if os.path.exists(OUTPUT_PDF):
        with open(OUTPUT_PDF, "a"):
            pass
except (IOError, PermissionError):
    target_pdf = os.path.join(BASE_DIR, "PROPUESTA_TESORERIA_BOTE_DESATENDIDO_v2.pdf")
    print(f"Aviso: El archivo principal está abierto en Acrobat. Generando en: {target_pdf}")

# Compilar a PDF con Chrome Headless
chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if os.path.exists(chrome_path):
    print("Compilando PDF con Google Chrome Headless...")
    cmd = [
        chrome_path,
        "--headless=new",
        "--disable-gpu",
        f"--print-to-pdf={target_pdf}",
        "--no-pdf-header-footer",
        OUTPUT_HTML
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if os.path.exists(target_pdf):
        size_kb = os.path.getsize(target_pdf) / 1024
        print(f"PDF generado con EXITO: {target_pdf} ({size_kb:.1f} KB)")
    else:
        print("Error al generar PDF:", result.stderr)
else:
    print("No se encontró Chrome en la ruta estándar.")
