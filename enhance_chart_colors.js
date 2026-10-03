const fs = require('fs');

// 1. Resaltar zonas de color en clasificacion_2.html (Bump Chart)
let clasif = fs.readFileSync('clasificacion_2.html', 'utf8');

const oldBands = `                    // Franjas de fondo temáticas: Champions (1-3), Zona Media (4-10), Zona Maula (11-19)
                    const y1 = yScale(1);
                    const y3 = yScale(3.5);
                    const y10 = yScale(10.5);
                    const yLast = yScale(maxRank);

                    svgContent += \`
                        <!-- Franja Podio / Champions -->
                        <rect x="\${padding.left}" y="\${padding.top - 12}" width="\${plotWidth}" height="\${y3 - (padding.top - 12)}" fill="\${isLight ? 'rgba(245, 158, 11, 0.05)' : 'rgba(245, 158, 11, 0.08)'}" rx="6" />
                        <!-- Franja Zona Maula -->
                        <rect x="\${padding.left}" y="\${y10}" width="\${plotWidth}" height="\${height - padding.bottom - y10 + 12}" fill="\${isLight ? 'rgba(239, 68, 68, 0.04)' : 'rgba(239, 68, 68, 0.06)'}" rx="6" />
                    \`;`;

const newBands = `                    // Franjas de fondo temáticas con mayor contraste: Champions (1-3), Zona Media (4-10), Zona Maula (11-19)
                    const y1 = yScale(1);
                    const y3 = yScale(3.5);
                    const y10 = yScale(10.5);
                    const yLast = yScale(maxRank);

                    svgContent += \`
                        <!-- Franja Podio / Champions (#1-#3) -->
                        <rect x="\${padding.left}" y="\${padding.top - 14}" width="\${plotWidth}" height="\${y3 - (padding.top - 14)}" fill="\${isLight ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.18)'}" stroke="\${isLight ? 'rgba(245, 158, 11, 0.35)' : 'rgba(245, 158, 11, 0.3)'}" stroke-width="1" rx="8" />
                        <!-- Franja Zona Media (#4-#10) -->
                        <rect x="\${padding.left}" y="\${y3}" width="\${plotWidth}" height="\${y10 - y3}" fill="\${isLight ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.10)'}" stroke="\${isLight ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.2)'}" stroke-width="1" rx="8" />
                        <!-- Franja Zona Maula (#11-#19) -->
                        <rect x="\${padding.left}" y="\${y10}" width="\${plotWidth}" height="\${height - padding.bottom - y10 + 14}" fill="\${isLight ? 'rgba(244, 63, 94, 0.14)' : 'rgba(244, 63, 94, 0.16)'}" stroke="\${isLight ? 'rgba(244, 63, 94, 0.35)' : 'rgba(244, 63, 94, 0.28)'}" stroke-width="1" rx="8" />
                    \`;`;

const normOldBands = oldBands.replace(/\r\n/g, '\n');
const normClasif = clasif.replace(/\r\n/g, '\n');

if (!normClasif.includes(normOldBands)) {
    console.error('ERROR: oldBands not found in clasificacion_2.html');
    process.exit(1);
}

clasif = normClasif.replace(normOldBands, newBands.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n');
fs.writeFileSync('clasificacion_2.html', clasif, 'utf8');
console.log('Successfully updated band contrast in clasificacion_2.html');

// 2. Resaltar zonas de color en resumen_2.html (Radar Chart en Duelo 1 vs 1)
let resumen = fs.readFileSync('resumen_2.html', 'utf8');

const oldRadarDatasets = `                        datasets: [
                            {
                                label: sA.name,
                                data: dataA,
                                backgroundColor: 'rgba(245, 158, 11, 0.25)',
                                borderColor: '#f59e0b',
                                borderWidth: 2.5,
                                pointBackgroundColor: '#f59e0b',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 1.5,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            },
                            {
                                label: sB.name,
                                data: dataB,
                                backgroundColor: 'rgba(14, 165, 233, 0.25)',
                                borderColor: '#0ea5e9',
                                borderWidth: 2.5,
                                pointBackgroundColor: '#0ea5e9',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 1.5,
                                pointRadius: 4,
                                pointHoverRadius: 6
                            }
                        ]`;

const newRadarDatasets = `                        datasets: [
                            {
                                label: sA.name,
                                data: dataA,
                                backgroundColor: 'rgba(245, 158, 11, 0.45)',
                                borderColor: '#f59e0b',
                                borderWidth: 3.5,
                                pointBackgroundColor: '#f59e0b',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 2,
                                pointRadius: 5,
                                pointHoverRadius: 7.5
                            },
                            {
                                label: sB.name,
                                data: dataB,
                                backgroundColor: 'rgba(14, 165, 233, 0.45)',
                                borderColor: '#0ea5e9',
                                borderWidth: 3.5,
                                pointBackgroundColor: '#0ea5e9',
                                pointBorderColor: '#ffffff',
                                pointBorderWidth: 2,
                                pointRadius: 5,
                                pointHoverRadius: 7.5
                            }
                        ]`;

const normOldRadar = oldRadarDatasets.replace(/\r\n/g, '\n');
const normResumen = resumen.replace(/\r\n/g, '\n');

if (!normResumen.includes(normOldRadar)) {
    console.error('ERROR: oldRadarDatasets not found in resumen_2.html');
    process.exit(1);
}

resumen = normResumen.replace(normOldRadar, newRadarDatasets.replace(/\r\n/g, '\n')).replace(/\n/g, '\r\n');
fs.writeFileSync('resumen_2.html', resumen, 'utf8');
console.log('Successfully updated radar fill contrast in resumen_2.html');
