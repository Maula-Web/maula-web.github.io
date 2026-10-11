# -*- coding: utf-8 -*-
"""
Generador de gráficos perfeccionados para el informe de la Peña Maulas
"""
import matplotlib.pyplot as plt
import numpy as np

plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['DejaVu Sans', 'Arial', 'Helvetica']

def create_graphics():
    # -------------------------------------------------------------
    # GRÁFICO 1: Comparativa Deportiva (Partidos Cubiertos vs Fijos)
    # -------------------------------------------------------------
    fig, ax = plt.subplots(figsize=(6.8, 2.6), dpi=200)
    fig.patch.set_facecolor('#ffffff')
    ax.set_facecolor('#f8fafc')

    categories = ['Actual (7 Dobles)', 'Propuesta (9 Triples)']
    cubiertos = [7, 9]
    fijos = [7, 5]

    x = np.arange(len(categories))
    width = 0.44

    # Barras apiladas
    ax.bar(x, cubiertos, width, label='Partidos Cubiertos (100% en triples)', color='#059669', edgecolor='#047857', linewidth=1.2, zorder=3)
    ax.bar(x, fijos, width, bottom=cubiertos, label='Partidos Fijos Obligatorios (Riesgo)', color='#ea580c', edgecolor='#c2410c', linewidth=1.2, zorder=3)

    # Texto dentro de las barras (ajustado para que nunca se solape con la leyenda)
    ax.text(x[0], 3.5, "7 Cubiertos\n(a Doble)", ha='center', va='center', color='white', fontweight='bold', fontsize=9.5)
    ax.text(x[0], 10.5, "7 FIJOS\n(difíciles)", ha='center', va='center', color='white', fontweight='bold', fontsize=9.5)

    ax.text(x[1], 4.5, "9 CUBIERTOS\n(100% TRIPLES)", ha='center', va='center', color='white', fontweight='bold', fontsize=9.5)
    ax.text(x[1], 11.5, "¡SOLO 5 FIJOS!", ha='center', va='center', color='white', fontweight='bold', fontsize=9.5)

    ax.set_ylabel('Nº de Partidos (Total 14)', fontsize=9, fontweight='bold', color='#1e293b')
    ax.set_ylim(0, 16.5)
    ax.set_xticks(x)
    ax.set_xticklabels(categories, fontsize=10.5, fontweight='bold', color='#0f172a')
    ax.grid(axis='y', linestyle='--', alpha=0.5, zorder=0)

    # Anotación destacada
    ax.annotate('¡Nos quitamos 2 fijos!\nMenos riesgo de fallo', 
                xy=(1, 14.1), xytext=(1.28, 12.2),
                arrowprops=dict(facecolor='#059669', shrink=0.08, width=1.5, headwidth=6),
                fontsize=8.5, fontweight='bold', color='#065f46',
                bbox=dict(boxstyle="round,pad=0.35", fc="#dcfce7", ec="#86efac", lw=1))

    # Leyenda en la esquina superior izquierda
    ax.legend(loc='upper left', bbox_to_anchor=(0.02, 0.98), frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=8)
    plt.title('COBERTURA DEPORTIVA: MENOS FIJOS Y MÁXIMA SEGURIDAD', fontsize=11, fontweight='bold', color='#0f172a', pad=10)
    plt.tight_layout()
    plt.savefig('grafico_deportiva.png', dpi=200, bbox_inches='tight')
    plt.close()

    # -------------------------------------------------------------
    # GRÁFICO 2: Crecimiento y Ahorro del Bote Común de la Peña
    # -------------------------------------------------------------
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(7.2, 2.7), dpi=200)
    fig.patch.set_facecolor('#ffffff')

    # Subgráfico A: Superávit semanal neto
    ax1.set_facecolor('#f8fafc')
    vals_semanal = [2.25, 5.00]
    bars1 = ax1.bar(['Actual\n(1,50 €)', 'Nueva Cuota\n(2,00 €)'], vals_semanal, color=['#cbd5e1', '#059669'], edgecolor=['#94a3b8', '#047857'], width=0.48, zorder=3)
    ax1.set_ylim(0, 6.4)
    ax1.set_ylabel('Euros limpios / Jornada (€)', fontsize=8.5, fontweight='bold', color='#1e293b')
    ax1.grid(axis='y', linestyle='--', alpha=0.5, zorder=0)
    ax1.set_title('Superávit Semanal para la Caja', fontsize=9.5, fontweight='bold', color='#0f172a')
    
    for bar in bars1:
        yval = bar.get_height()
        ax1.text(bar.get_x() + bar.get_width()/2.0, yval + 0.22, f"+{yval:.2f} €", ha='center', va='bottom', fontweight='bold', fontsize=9.5, color='#0f172a')
    
    ax1.text(1, 2.5, '+122%\nMÁS AHORRO', ha='center', va='center', fontweight='bold', color='white', fontsize=8.5,
             bbox=dict(boxstyle="round,pad=0.25", fc="#059669", ec="#047857"))

    # Subgráfico B: Ahorro acumulado de temporada (38 jornadas)
    ax2.set_facecolor('#f8fafc')
    jornadas = np.array([0, 10, 20, 30, 38])
    acum_actual = jornadas * 2.25
    acum_nueva = jornadas * 5.00

    ax2.plot(jornadas, acum_actual, marker='o', color='#64748b', linewidth=2, label='Actual (+2,25 €/jor)', zorder=3)
    ax2.plot(jornadas, acum_nueva, marker='s', color='#ea580c', linewidth=2.5, label='Nueva Cuota (+5,00 €/jor)', zorder=4)
    ax2.fill_between(jornadas, acum_actual, acum_nueva, color='#fed7aa', alpha=0.5, label='Fondo Extra Ganado (+104,50 €)')

    ax2.set_xlabel('Jornadas de Temporada', fontsize=8.5, fontweight='bold', color='#1e293b')
    ax2.set_ylabel('Fondo Acumulado (€)', fontsize=8.5, fontweight='bold', color='#1e293b')
    ax2.set_title('Evolución del Bote Base en 38 Jornadas', fontsize=9.5, fontweight='bold', color='#0f172a')
    ax2.set_ylim(0, 225)
    ax2.grid(True, linestyle='--', alpha=0.5, zorder=0)

    ax2.text(38, 190 + 6, '+190,00 €', ha='right', va='bottom', fontweight='bold', color='#ea580c', fontsize=9)
    ax2.text(38, 85.5 - 14, '+85,50 €', ha='right', va='top', fontweight='bold', color='#64748b', fontsize=8.5)

    ax2.legend(loc='upper left', frameon=True, facecolor='#ffffff', edgecolor='#cbd5e1', fontsize=7.5)

    plt.tight_layout()
    plt.savefig('grafico_financiero.png', dpi=200, bbox_inches='tight')
    plt.close()
    print("Gráficos perfeccionados con éxito.")

if __name__ == '__main__':
    create_graphics()
