
import json
import re

# Final official results extracted from seeder/logic
J_RESULTS = {
    1: ["2","1","1","2","X","2","1","1","1","X","2","1","X","X","1-1"],
    2: ["X","X","2","1","X","1","2","1","2","2","2","X","2","2","1-2"],
    3: ["X","1","2","1","X","2","1","1","X","X","1","1","2","2","1-1"],
    4: ["1","X","1","2","1","1","1","1","X","X","1","2","1","2","1-1"],
    5: ["X","1","2","1","2","1","1","1","1","X","1","1","X","X","1-1"],
    6: ["1","X","1","1","X","1","1","1","2","2","1","1","2","1","1-1"],
    7: ["2","1","1","1","2","X","X","1","1","1","X","1","1","2","2-0"],
    8: ["1","1","X","2","2","1","2","2","2","1","1","2","2","2","2-2"],
    9: ["X","1","1","2","1","1","1","1","X","2","2","1","X","2","M-2"],
    10: ["1","X","1","X","2","2","1","2","1","1","2","2","1","1","1-1"],
    11: ["2","1","1","1","1","1","2","2","X","2","1","2","1","1","1-1"],
    12: ["2","X","2","X","2","1","2","1","1","X","1","1","X","1","1-2"],
    13: ["2","X","1","2","1","X","1","2","1","1","2","1","1","1","2-1"],
    14: ["2","1","X","1","X","X","2","2","2","1","2","2","1","X","0-0"],
    15: ["1","1","1","2","X","X","2","2","2","1","X","2","1","X","2-1"],
    16: ["X","1","2","2","X","2","1","2","X","2","1","1","1","X","2-1"],
    17: ["1","1","1","2","1","1","1","X","2","1","X","X","1","2","M-2"],
    18: ["1","1","2","1","X","1","1","2","X","X","X","X","1","1","1-1"],
    19: ["1","1","1","2","1","X","1","2","X","X","1","X","1","X","0-0"],
    20: ["2","1","1","1","X","1","1","2","2","2","1","1","2","1","1-0"],
    21: ["2","1","1","2","X","1","X","2","X","2","2","1","1","1","1-1"],
    22: ["2","1","2","1","X","X","2","X","2","X","1","1","2","1","2-1"],
    23: ["1","1","2","1","2","2","1","1","1","2","1","1","1","1","1-1"],
    24: ["X","1","2","1","2","2","2","X","1","2","X","1","2","1","1-1"],
    25: ["1","1","X","1","1","2","1","1","2","1","1","1","X","1","2-1"],
    27: ["1","X","1","X","2","1","1","1","1","X","2","1","1","1","1-1"],
    31: ["1","X","1","1","1","2","2","1","2","2","1","X","2","2","0-1"]
}

def normalize_sign(r):
    if not r: return ''
    r = str(r).strip().upper()
    if r in ['1','X','2']: return r
    if '-' in r:
        try:
            parts = r.split('-')
            val = lambda s: 3 if s in ['M','M+'] else (int(s) if s.isdigit() else 0)
            h, a = val(parts[0]), val(parts[1])
            if h > a: return '1'
            if h < a: return '2'
            return 'X'
        except: return ''
    return r

def calculate_winners():
    with open('d:/PROYECTO_MAULAS/js/data_loader.js', 'r', encoding='utf-8') as f:
        content = f.read()
        match = re.search(r'window\.HISTORICAL_DATA\s*=\s*(\[.*\]);', content, re.DOTALL)
        if not match: return {}
        data = json.loads(match.group(1))

    winners = {}
    for h in data:
        j_num = h['jornada_num']
        official = J_RESULTS.get(j_num)
        if not official: continue
        norm_official = [normalize_sign(r) for r in official[:14]]
        ranking = []
        for m_id, preds in h['predictions'].items():
            hits = 0
            for i in range(14):
                if i < len(norm_official) and i < len(preds) and preds[i]:
                    if norm_official[i] in str(preds[i]).upper():
                        hits += 1
            ranking.append({'mId': int(m_id), 'hits': hits})
        ranking.sort(key=lambda x: (-x['hits'], x['mId']))
        winners[j_num] = ranking
    return winners

winners = calculate_winners()
target_js = [1, 2, 3, 9, 11, 14, 16, 17, 19, 22, 24, 26, 28, 32]
print("{")
for tj in target_js:
    prev = tj - 1
    if tj == 1:
        print(f'  "{tj}": {{ "mId": 13 }},')
        continue
    if prev in winners:
        w = winners[prev]
        m2 = w[1]['mId'] if len(w)>1 else "null"
        print(f'  "{tj}": {{ "mId": {w[0]["mId"]}, "m2Id": {m2} }},')
    else:
        print(f'  "{tj}": {{ "mId": 13, "note": "missing J{prev}" }},')
print("}")
