# -*- coding: utf-8 -*-
"""
Generador de Informe Ejecutivo en PDF para la Peña Maulas (Versión 2 Páginas)
Propuesta de Nueva Quiniela Comunitaria: 9 Triples (18,75 €) y Cuotas Comparadas (1,75 € vs 2,00 €)
Incluye análisis transparente de la operativa y dificultad de sellado en administración vs online.
"""
import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, total_pages):
        self.saveState()
        # Barra superior decorativa
        self.setFillColor(colors.HexColor('#090d16'))
        self.rect(0, A4[1] - 6, A4[0], 6, fill=1, stroke=0)
        self.setFillColor(colors.HexColor('#ea580c'))
        self.rect(0, A4[1] - 6, A4[0] * 0.45, 6, fill=1, stroke=0)

        # Pie de página elegante
        self.setStrokeColor(colors.HexColor('#cbd5e1'))
        self.setLineWidth(0.6)
        self.line(36, 26, A4[0] - 36, 26)
        
        self.setFont("Helvetica-Bold", 8)
        self.setFillColor(colors.HexColor('#475569'))
        self.drawString(36, 14, "PEÑA MAULAS · PROPUESTA DEPORTIVA Y TESORERÍA (TEMPORADA 2026-2027)")
        
        self.setFont("Helvetica", 8)
        page_str = f"Página {self._pageNumber} de {total_pages}"
        self.drawRightString(A4[0] - 36, 14, page_str)
        self.restoreState()

def build_pdf(filename="PROPUESTA_QUINIELA_9_TRIPLES_MAULAS_v2.pdf"):
    # Márgenes calibrados de 36pt (1.27 cm)
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=28,
        bottomMargin=32
    )

    styles = getSampleStyleSheet()
    
    # Colores corporativos Maulas
    c_dark = colors.HexColor('#090d16')
    c_primary = colors.HexColor('#ea580c')
    c_border = colors.HexColor('#cbd5e1')

    # Estilos tipográficos
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=16.5,
        leading=20.5,
        textColor=c_dark
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.8,
        leading=13,
        textColor=c_primary
    )
    
    intro_style = ParagraphStyle(
        'DocIntro',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.0,
        leading=13.5,
        textColor=colors.HexColor('#1e293b')
    )

    h2_style = ParagraphStyle(
        'Heading2Custom',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor('#0f172a')
    )

    body_style = ParagraphStyle(
        'BodyCustom',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.2,
        leading=11.8,
        textColor=colors.HexColor('#334155')
    )

    table_header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.8,
        leading=10,
        textColor=colors.white,
        alignment=1
    )

    table_cell_style = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.8,
        leading=10.5,
        textColor=colors.HexColor('#1e293b')
    )

    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.8,
        leading=10.5,
        textColor=colors.HexColor('#0f172a')
    )

    table_cell_center = ParagraphStyle(
        'TableCellCenter',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7.8,
        leading=10.5,
        textColor=colors.HexColor('#1e293b'),
        alignment=1
    )

    table_cell_center_bold = ParagraphStyle(
        'TableCellCenterBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.8,
        leading=10.5,
        textColor=colors.HexColor('#0f172a'),
        alignment=1
    )

    elements = []

    # ==========================================
    # PÁGINA 1: CABECERA, MENSAJE, DEPORTIVA Y COMPARATIVA
    # ==========================================

    # 1. Cabecera con Logotipo Oficial
    logo_path = os.path.abspath("imagenes/MAULA.png")
    if os.path.exists(logo_path):
        logo_img = Image(logo_path, width=52, height=52)
    else:
        logo_img = Paragraph("<b>[LOGO]</b>", body_style)

    header_text = [
        Paragraph("PROPUESTA DE SALTO DE NIVEL: QUINIELA DE 9 TRIPLES", title_style),
        Spacer(1, 3),
        Paragraph("Estudio de impacto económico por socio y evolución de la tesorería", subtitle_style)
    ]

    header_table = Table([[logo_img, header_text]], colWidths=[62, 461])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    elements.append(header_table)
    elements.append(Spacer(1, 8))

    # 2. Mensaje Introductorio a los Socios
    intro_content = (
        "<b>Queridos Maulas:</b><br/>"
        "Os presento una propuesta para dar un salto de nivel en la quiniela de dobles, que consistiría en jugar "
        "<b>9 triples</b> en lugar de los 7 o 4 dobles actuales. Esta combinación reduce los partidos a acertar a solo <b>5 fijos</b>, "
        "garantiza premios frecuentes de 10 aciertos con opciones muy altas al 11 y 12, y ajustando la cuota semanal a <b>2,00 € (+0,50 €)</b> "
        "no solo costeamos el boleto sino que duplicamos el crecimiento del bote común de la peña (<b>¡¡Más cervezas en la cena!!</b>)."
    )
    intro_p = Paragraph(intro_content, intro_style)
    intro_box = Table([[intro_p]], colWidths=[523])
    intro_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fff7ed')),
        ('BOX', (0,0), (-1,-1), 1.2, colors.HexColor('#fdba74')),
        ('TOPPADDING', (0,0), (-1,-1), 8),
        ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('LEFTPADDING', (0,0), (-1,-1), 12),
        ('RIGHTPADDING', (0,0), (-1,-1), 12),
    ]))
    elements.append(intro_box)
    elements.append(Spacer(1, 10))

    # 3. Sección 1: Fundamentos y Garantías
    elements.append(Paragraph("1. Fundamentos y Garantías de la Reducción (9 Triples al 12 en 25 Apuestas)", h2_style))
    elements.append(Spacer(1, 5))

    cards_data = [
        [
            Paragraph("<b>Blindaje Masivo (9 Triples)</b><br/>Cubrimos 9 encuentros con el 100% de los resultados posibles (1, X y 2). Es imposible fallar el pronóstico en ninguno de esos 9 partidos.", body_style),
            Paragraph("<b>Sólo 5 Fijos a Acertar</b><br/>La exigencia de acierto cae drásticamente. De los 14 partidos del boleto, sólo nos la jugamos en 5 fijos seleccionados por la peña.", body_style),
            Paragraph("<b>Garantías de la Combinación</b><br/>Con los 5 fijos acertados:<br/>• <b>100% Premio Asegurado</b> (10 garantizado)<br/>• <b>~40% Probabilidad de 11 aciertos</b><br/>• <b>~11% Probabilidad de 12 aciertos</b>", body_style)
        ]
    ]
    cards_table = Table(cards_data, colWidths=[170, 170, 171])
    cards_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.8, c_border),
        ('INNERGRID', (0,0), (-1,-1), 0.8, c_border),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 9),
        ('RIGHTPADDING', (0,0), (-1,-1), 9),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ]))
    elements.append(cards_table)
    elements.append(Spacer(1, 10))

    # 4. Gráfico Deportivo Moderno
    grafico_dep_path = os.path.abspath("grafico_deportiva_moderno.png")
    if os.path.exists(grafico_dep_path):
        img_dep = Image(grafico_dep_path, width=523, height=130)
        elements.append(img_dep)
        elements.append(Spacer(1, 10))

    # 5. Sección 2: Comparativa Detallada
    elements.append(Paragraph("2. Comparativa detallada: 7 Dobles Actuales vs. 9 Triples Propuestos", h2_style))
    elements.append(Spacer(1, 5))

    comp_table_data = [
        [
            Paragraph("CONCEPTO ANALIZADO", table_header_style),
            Paragraph("ACTUAL (7 DOBLES AL 13)", table_header_style),
            Paragraph("PROPUESTA (9 TRIPLES AL 12)", table_header_style),
            Paragraph("VENTAJA PARA LA PEÑA", table_header_style)
        ],
        [
            Paragraph("<b>Coste Semanal Boleto</b>", table_cell_bold),
            Paragraph("12,00 € (16 apuestas)", table_cell_center),
            Paragraph("<b>18,75 €</b> (25 apuestas)", table_cell_center_bold),
            Paragraph("-6,75 € de inversión", table_cell_style)
        ],
        [
            Paragraph("<b>Partidos 100% Cubiertos</b>", table_cell_bold),
            Paragraph("0 triples (0 partidos)", table_cell_center),
            Paragraph("<b>9 triples (9 partidos)</b>", table_cell_center_bold),
            Paragraph("<font color='#059669'><b>+9 partidos blindados a 1-X-2</b></font>", table_cell_style)
        ],
        [
            Paragraph("<b>Partidos Fijos Exigidos</b>", table_cell_bold),
            Paragraph("7 partidos fijos obligatorios", table_cell_center),
            Paragraph("<b>5 partidos fijos únicamente</b>", table_cell_center_bold),
            Paragraph("<font color='#059669'><b>-2 fijos menos a pronosticar</b></font>", table_cell_style)
        ],
        [
            Paragraph("<b>Margen de Error Pronóstico</b>", table_cell_bold),
            Paragraph("Si falla el signo no cubierto en un doble, la columna se anula.", table_cell_style),
            Paragraph("El triple absorbe cualquier sorpresa sin penalizar.", table_cell_style),
            Paragraph("<font color='#059669'><b>Inmune a sorpresas en 9 partidos</b></font>", table_cell_style)
        ],
        [
            Paragraph("<b>Cobro de Premios Menores</b>", table_cell_bold),
            Paragraph("Muy dependiente de no fallar fijos ni dobles.", table_cell_style),
            Paragraph("Retornos recurrentes de 10 y 11 aciertos.", table_cell_style),
            Paragraph("<font color='#059669'><b>Mayor regularidad de ingresos</b></font>", table_cell_style)
        ]
    ]

    comp_table = Table(comp_table_data, colWidths=[130, 120, 130, 143])
    comp_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_dark),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#ffffff')),
        ('BACKGROUND', (0,2), (-1,2), colors.HexColor('#f8fafc')),
        ('BACKGROUND', (0,3), (-1,3), colors.HexColor('#ffffff')),
        ('BACKGROUND', (0,4), (-1,4), colors.HexColor('#f8fafc')),
        ('BACKGROUND', (0,5), (-1,5), colors.HexColor('#ffffff')),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
    ]))
    elements.append(comp_table)

    # SALTO A PÁGINA 2
    elements.append(PageBreak())

    # ==========================================
    # PÁGINA 2: IMPACTO FINANCIERO, DIFICULTAD DE SELLADO Y CONCLUSIÓN
    # ==========================================

    elements.append(Paragraph("3. Estudio de Impacto Financiero y Escenarios de Cuota (19 Socios)", h2_style))
    elements.append(Spacer(1, 4))

    # Explicación del cálculo técnico de cuota mínima
    calc_box_text = (
        "<b>ANÁLISIS DE COSTE MÍNIMO PARA ASUMIR EL BOLETO:</b><br/>"
        "El gasto semanal total es de <b>33,00 €</b> (14,25 € de las 19 jugadas individuales + 18,75 € del boleto de 9 triples). "
        "La cuota mínima matemática para no tener déficit es de <b>1,737 €/socio</b> (subida mínima de +0,24 €). "
        "Subir a <b>1,75 € (+0,25 €) SÍ cubre el coste</b>, pero el superávit semanal cae a solo <b>0,25 €</b> (anulando el bote común). "
        "Por ello, la opción recomendada es subir a <b>2,00 € (+0,50 €)</b> para duplicar el bote de eventos (+5,00 €/semana)."
    )
    calc_p = Paragraph(calc_box_text, body_style)
    calc_table = Table([[calc_p]], colWidths=[523])
    calc_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
        ('BOX', (0,0), (-1,-1), 0.8, colors.HexColor('#94a3b8')),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 9),
        ('RIGHTPADDING', (0,0), (-1,-1), 9),
    ]))
    elements.append(calc_table)
    elements.append(Spacer(1, 6))

    # Tabla comparativa de los 3 escenarios
    fin_table_data = [
        [
            Paragraph("PARÁMETRO ECONÓMICO", table_header_style),
            Paragraph("SITUACIÓN ACTUAL<br/>(CUOTA 1,50 €)", table_header_style),
            Paragraph("OPCIÓN MÍNIMA<br/>(CUOTA 1,75 €)", table_header_style),
            Paragraph("PROPUESTA ÓPTIMA<br/>(CUOTA 2,00 €)", table_header_style)
        ],
        [
            Paragraph("<b>Cuota semanal por socio</b>", table_cell_bold),
            Paragraph("1,50 € / semana", table_cell_center),
            Paragraph("1,75 € (+0,25 €)", table_cell_center),
            Paragraph("<b>2,00 € (+0,50 €)</b>", table_cell_center_bold)
        ],
        [
            Paragraph("<b>Recaudación semanal peña</b>", table_cell_bold),
            Paragraph("28,50 € / semana", table_cell_center),
            Paragraph("33,25 € / semana", table_cell_center),
            Paragraph("<b>38,00 € / semana</b>", table_cell_center_bold)
        ],
        [
            Paragraph("<b>Coste 19 jugadas individuales</b>", table_cell_bold),
            Paragraph("14,25 € (19 x 0,75 €)", table_cell_center),
            Paragraph("14,25 € (19 x 0,75 €)", table_cell_center),
            Paragraph("14,25 € (19 x 0,75 €)", table_cell_center)
        ],
        [
            Paragraph("<b>Coste quiniela común peña</b>", table_cell_bold),
            Paragraph("12,00 € (7 dobles)", table_cell_center),
            Paragraph("18,75 € (9 triples)", table_cell_center),
            Paragraph("<b>18,75 € (9 triples)</b>", table_cell_center_bold)
        ],
        [
            Paragraph("<b>Superávit semanal al Bote</b>", table_cell_bold),
            Paragraph("2,25 € / semana", table_cell_center),
            Paragraph("<font color='#b45309'><b>0,25 € / semana</b></font>", table_cell_center),
            Paragraph("<font color='#059669'><b>5,00 € / semana (+122%)</b></font>", table_cell_center_bold)
        ],
        [
            Paragraph("<b>Bote acumulado (38 jornadas)</b>", table_cell_bold),
            Paragraph("85,50 € temporada", table_cell_center),
            Paragraph("<font color='#b45309'><b>9,50 € (Bote casi nulo)</b></font>", table_cell_center),
            Paragraph("<font color='#059669'><b>190,00 € (+104,50 € extra)</b></font>", table_cell_center_bold)
        ]
    ]

    fin_table = Table(fin_table_data, colWidths=[145, 110, 128, 140])
    fin_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), c_dark),
        ('ALIGN', (0,0), (-1,0), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 7),
        ('RIGHTPADDING', (0,0), (-1,-1), 7),
        ('BACKGROUND', (0,1), (-1,1), colors.HexColor('#ffffff')),
        ('BACKGROUND', (0,2), (-1,2), colors.HexColor('#f8fafc')),
        ('BACKGROUND', (0,3), (-1,3), colors.HexColor('#ffffff')),
        ('BACKGROUND', (0,4), (-1,4), colors.HexColor('#f8fafc')),
        ('BACKGROUND', (0,5), (-1,5), colors.HexColor('#ffffff')),
        ('BACKGROUND', (0,6), (-1,6), colors.HexColor('#f0fdf4')),
        ('GRID', (0,0), (-1,-1), 0.5, c_border),
    ]))
    elements.append(fin_table)
    elements.append(Spacer(1, 8))

    # Gráfico Financiero Moderno
    grafico_fin_path = os.path.abspath("grafico_financiero_moderno.png")
    if os.path.exists(grafico_fin_path):
        img_fin = Image(grafico_fin_path, width=523, height=125)
        elements.append(img_fin)
        elements.append(Spacer(1, 8))

    # 4. Sección Transparente: Dificultad Operativa y Sellado
    elements.append(Paragraph("4. Dificultad Operativa y Método de Sellado (Transparencia Total)", h2_style))
    elements.append(Spacer(1, 4))

    diff_content = (
        "<b>¡ATENCIÓN A LA OPERATIVA SEMANAL! NO ES UN BOLETO OFICIAL ESTÁNDAR:</b><br/>"
        "• <b>El Problema:</b> Los <i>7 dobles actuales</i> se sellan en 1 solo segundo con el boleto oficial de reducidas de Loterías (SELAE). "
        "En cambio, los <i>9 triples en 25 apuestas</i> <b>NO son una reducción oficial preestablecida de SELAE</b>. "
        "No existe una casilla oficial en ventanilla para marcar '9 triples en 25 apuestas'.<br/>"
        "• <b>Dificultad en Ventanilla Física:</b> Rellenar a mano 25 columnas simples en 4 boletos distintos cada semana sería inviable y propicio a errores humanos.<br/>"
        "• <b>Solución Viable:</b> Se debe validar mediante <b>archivo informático/código QR</b> a través de la web/app de Loterías (o administración digital tipo Eduardo Losilla/Lotoideas), "
        "o bien llevar el archivo generado por software (Megaquin) para que el terminal de la administración lo cargue de golpe. "
        "<b>Requiere que la persona encargada gestione el archivo digital semanalmente.</b>"
    )
    diff_p = Paragraph(diff_content, body_style)
    diff_box = Table([[diff_p]], colWidths=[523])
    diff_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#fef2f2')), # fondo alerta suave rojo/ámbar
        ('BOX', (0,0), (-1,-1), 1.2, colors.HexColor('#ef4444')),    # borde rojo alerta
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 10),
        ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ]))
    elements.append(diff_box)
    elements.append(Spacer(1, 8))

    # 5. Dictamen y Conclusión
    conclusion_text = (
        "<b>DICTAMEN FINAL Y CONCLUSIÓN:</b><br/>"
        "Deportivamente y económicamente, jugar 9 triples con cuota a <b>2,00 €</b> es la opción perfecta: solo 5 fijos y duplicamos el bote (+190 €). "
        "Con <b>1,75 €</b> se cubre el boleto pero se anula el ahorro anual (9,50 €). "
        "Sin embargo, la Peña debe ser consciente del <b>peaje operativo</b>: requiere sellar digitalmente mediante archivo o software cada jornada. "
        "Si asumimos esa gestión digital, el salto de calidad para la Peña Maulas es indiscutible."
    )
    conclusion_p = Paragraph(conclusion_text, intro_style)
    conclusion_box = Table([[conclusion_p]], colWidths=[523])
    conclusion_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#eff6ff')),
        ('BOX', (0,0), (-1,-1), 1.2, colors.HexColor('#3b82f6')),
        ('TOPPADDING', (0,0), (-1,-1), 7),
        ('BOTTOMPADDING', (0,0), (-1,-1), 7),
        ('LEFTPADDING', (0,0), (-1,-1), 11),
        ('RIGHTPADDING', (0,0), (-1,-1), 11),
    ]))
    elements.append(conclusion_box)

    doc.build(elements, canvasmaker=NumberedCanvas)
    print("PDF con dificultad de sellado generado exitosamente.")

if __name__ == '__main__':
    build_pdf()
