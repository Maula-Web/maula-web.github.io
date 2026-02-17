
import json
import re

# Complete results from cloud-seeder.js
JORNADAS_RESULTS = {
    1: ["2","1","1","2","X","2","1","1","1","X","2","1","X","X","1-1"],
    2: ["X","X","2","1","X","1","2","1","2","2","2","X","2","2","1-2"],
    3: ["X","1","2","1","X","2","1","1","X","X","1","1","2","2","1-1"],
    5: ["X","1","2","1","2","1","1","1","1","X","1","1","X","X","1"],
    7: ["2","1","1","1","2","X","X","1","1","1","X","1","1","2","2-0"],
    9: ["X","1","1","2","1","1","1","1","X","2","2","1","X","2","M-2"],
    11: ["2","1","1","1","1","1","2","2","X","2","1","2","1","1","1-1"],
    14: ["2","1","X","1","X","X","2","2","2","1","2","2","1","X","0-0"],
    16: ["X","1","2","2","X","2","1","2","X","2","1","1","1","X","2-1"],
    17: ["1","1","1","2","1","1","1","X","2","1","X","X","1","2","M-2"],
    19: ["1","1","1","2","1","X","1","2","X","X","1","X","1","X","0-0"],
    22: ["2","1","2","1","X","X","2","X","2","X","1","1","2","1","2-1"],
    24: ["X","1","2","1","2","2","2","X","1","2","X","1","2","1","1-1"],
    26: ["1","1","2","1","X","","","","2","2","2","X","","","1-0"]
}

MEMBERS = [
    "Alvaro", "Carlos", "David Buzón", "Edu", "Emilio",
    "Fernando Lozano", "Fernando Ramírez", "Heradio", "JA Valdivieso", "Javier Mora",
    "Juan Antonio", "Juanjo", "Luismi", "Marcelo", "Martín",
    "Rafa", "Ramón", "Raúl Romera", "Samuel"
]

def calculate_aciertos(official, forecast):
    if not official or not forecast: return 0
    hits = 0
    for i in range(min(14, len(official), len(forecast))):
        if official[i] and forecast[i] and str(official[i]) == str(forecast[i]):
            hits += 1
    return hits

with open('d:/PROYECTO_MAULAS/js/data_loader.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
    json_lines = []
    capture = False
    for line in lines:
        if 'window.HISTORICAL_DATA = [' in line:
            capture = True
            json_lines.append('[')
            continue
        if capture:
            if line.strip() == '];':
                json_lines.append(']')
                capture = False
                break
            json_lines.append(line)
    
    json_str = "".join(json_lines)
    data = json.loads(json_str)

winners = {}
for h in data:
    j_num = h['jornada_num']
    official = JORNADAS_RESULTS.get(j_num)
    if not official: continue

    ranking = []
    for m_id, preds in h['predictions'].items():
        hits = calculate_aciertos(official, preds)
        ranking.append({
            'mId': int(m_id),
            'name': MEMBERS[int(m_id)-1],
            'hits': hits
        })
    
    ranking.sort(key=lambda x: (-x['hits'], x['mId']))
    winners[j_num] = ranking

# Generate the data report
target_jornadas = [1, 2, 8, 10, 13, 15, 16, 18, 21, 23, 25, 27, 31]
for j_target in sorted([1, 2, 3, 9, 11, 14, 16, 17, 19, 22, 24, 26, 28, 32]):
    j_prev = j_target - 1
    if j_target == 1:
        print(f"J1: Luismi (ID 13) - Maula J0")
        continue
    
    if j_prev in winners:
        w = winners[j_prev]
        print(f"J{j_target}: Winner J{j_prev}: {w[0]['name']} (ID {w[0]['mId']}) - {w[0]['hits']} hits")
        if j_target in [3, 9]:
            print(f"J{j_target}: 2nd J{j_prev}: {w[1]['name']} (ID {w[1]['mId']}) - {w[1]['hits']} hits")
    else:
        print(f"J{j_target}: Prev Jornada J{j_prev} results missing in seeder.")
