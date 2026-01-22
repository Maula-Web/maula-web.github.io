import os
import glob
import json
import re

DATA_DIR = 'd:/PROYECTO_MAULAS/DATOS_2025-2026'
OUTPUT_FILE = 'd:/PROYECTO_MAULAS/js/data_loader.js'

# Socio Name (CSV) -> ID (App)
# Note: CSV names might differ slightly.
SOCIOS = {
    "Alvaro": 1, "Carlos": 2, "David Buzón": 3, "Edu": 4, "Emilio": 5,
    "Fernando Lozano": 6, "Fernando Ramírez": 7, "Heradio": 8, "JA Valdivieso": 9,
    "Javier Mora": 10, "Juan Antonio": 11, "Juanjo": 12, "Luismi": 13,
    "Marcelo": 14, "Martín": 15, "Rafa": 16, "Ramón": 17, "Ramon": 17,
    "Raúl Romera": 18, "Samuel": 19
}

def parse_csv(filepath):
    filename = os.path.basename(filepath)
    # Extract Jornada Num: Jornada_01-...
    match = re.search(r'Jornada_(\d+)', filename)
    if not match:
        return None
    jornada_num = int(match.group(1))

    try:
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            lines = f.readlines()
    except UnicodeDecodeError:
        with open(filepath, 'r', encoding='latin-1') as f:
            lines = f.readlines()

    if len(lines) < 15:
        return None

    # Header
    header = lines[0].strip().split(';')
    # Find indices for socios
    socio_indices = {}
    for idx, col in enumerate(header):
        clean_col = col.strip()
        if clean_col in SOCIOS:
            socio_indices[SOCIOS[clean_col]] = idx # Map ID -> Column Index

    # Matches (Rows 1 to 15, corresponding to Match 1-14 + Pleno?)
    # Line 2 corresponds to Match 1.
    # Line 16 corresponds to Match 15 (Pleno)?
    # Let's check the previous view_file.
    # Line 1 (Index 0): Header
    # Line 2 (Index 1): Match 1
    # ...
    # Line 15 (Index 14): Match 14
    # Line 16 (Index 15): Empty?
    # Line 17 (Index 16): Match 15 (Pleno)

    predictions = {} # MemberID -> [pred1, pred2... pred15]

    for m_id in socio_indices:
        predictions[m_id] = [None] * 15

    # Parse Matches 1-14
    for i in range(1, 15): # Lines 1 to 14
        if i >= len(lines): break
        parts = lines[i].strip().split(';')
        
        for m_id, col_idx in socio_indices.items():
            if col_idx < len(parts):
                val = parts[col_idx].strip().upper()
                if val in ['1', 'X', '2', 'M', '0', '1-1', '2-1', '...']:
                    # Normalize quiniela signs?
                    # CSV has '1', 'X', '2'.
                    predictions[m_id][i-1] = val

    # Parse Match 15 (Line 17? Index 16)
    # Based on previous file view, Line 17 is "Elche-Betis...".
    if len(lines) >= 17:
        parts = lines[16].strip().split(';')
        # Check if row looks like a match
        if "15" in parts[0] or "Pleno" in parts[0] or len(parts) > 5:
             for m_id, col_idx in socio_indices.items():
                if col_idx < len(parts):
                    val = parts[col_idx].strip()
                    if val:
                        predictions[m_id][14] = val
    
    return {
        "jornada_num": jornada_num,
        "predictions": predictions
    }

all_data = []
csv_files = glob.glob(os.path.join(DATA_DIR, 'Jornada_*.csv'))

for f in csv_files:
    res = parse_csv(f)
    if res:
        all_data.append(res)

# Generate JS Content
js_content = "const HISTORICAL_DATA = " + json.dumps(all_data, indent=2) + ";"
js_content += """

// Function to import this data into localStorage
function importHistoricalData() {
    const existingP = JSON.parse(localStorage.getItem('maulas_pronosticos')) || [];
    const members = JSON.parse(localStorage.getItem('maulas_members')) || [];
    const jornadas = JSON.parse(localStorage.getItem('maulas_jornadas')) || [];

    HISTORICAL_DATA.forEach(d => {
        // Find Jornada ID by Number
        const j = jornadas.find(x => x.number === d.jornada_num);
        if (!j) return;

        for (const [mIdStr, preds] of Object.entries(d.predictions)) {
            const mId = parseInt(mIdStr);
            // Construct ID
            const pId = `${j.id}_${mId}`;
            
            // Check if already exists (preserving manual edits? maybe overwrite for now)
            const idx = existingP.findIndex(x => x.id === pId);
            
            const record = {
                id: pId,
                jId: j.id,
                mId: mId,
                selection: preds,
                timestamp: new Date().toISOString(),
                late: false, // Imported
                imported: true
            };

            if (idx > -1) {
                // Merge? Or Overwrite? Overwrite is safer for sync.
                existingP[idx] = record;
            } else {
                existingP.push(record);
            }
        }
    });

    localStorage.setItem('maulas_pronosticos', JSON.stringify(existingP));
    console.log("Historical Data Imported Successfully");
    alert("Datos históricos importados y pronósticos actualizados.");
}
"""

with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
    f.write(js_content)

print("Data Loader script created.")
