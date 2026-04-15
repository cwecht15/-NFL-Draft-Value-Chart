"""
Fetch the Big Board from Google Sheets and update js/data.js.
Usage: python update_board.py
"""
import gspread
import json
import re
import os
from google.oauth2.service_account import Credentials

SHEET_ID = '1RM4r3bdiLX4mvthJfeYqiEIc_2fnmm5IlZefIyf6GP4'
KEY_FILE = os.path.expanduser('~/Documents/Football/Keys/fp-data-357113-a6174bb87054.json')
DATA_JS = os.path.join(os.path.dirname(__file__), 'js', 'data.js')

def fetch_board():
    creds = Credentials.from_service_account_file(
        KEY_FILE,
        scopes=['https://www.googleapis.com/auth/spreadsheets.readonly']
    )
    gc = gspread.authorize(creds)
    sh = gc.open_by_key(SHEET_ID)
    ws = sh.sheet1
    rows = ws.get_all_values()

    headers = rows[0]
    # Use first occurrence of each header (col D = Score at index 3, not col W)
    col = {}
    for i, h in enumerate(headers):
        if h.strip() and h not in col:
            col[h] = i

    players = []
    for row in rows[1:]:
        if not row[col['Player']].strip():
            continue
        try:
            score = float(row[col['Score']])
            overall = int(row[col['Overall']])
        except (ValueError, IndexError):
            continue
        pos_rank = row[col.get('Position Rank', 4)].strip() if col.get('Position Rank') is not None else ''
        players.append({
            'player': row[col['Player']].strip(),
            'school': row[col['School']].strip(),
            'position': row[col['Position']].strip(),
            'score': score,
            'overall': overall,
            'posRank': pos_rank,
        })

    players.sort(key=lambda p: p['overall'])
    return players

def update_data_js(players):
    with open(DATA_JS, 'r', encoding='utf-8') as f:
        content = f.read()

    # Build the new BIG_BOARD array
    lines = ['const BIG_BOARD = [']
    for p in players:
        # Escape single quotes in names
        name = p['player'].replace("'", "\\'")
        school = p['school'].replace("'", "\\'")
        lines.append(
            f"  {{player:'{name}',school:'{school}',"
            f"position:'{p['position']}',score:{p['score']},overall:{p['overall']},"
            f"posRank:'{p['posRank']}'}},"
        )
    lines.append('];')
    new_board = '\n'.join(lines)

    # Replace the existing BIG_BOARD block
    pattern = r'const BIG_BOARD = \[.*?\];'
    updated = re.sub(pattern, new_board, content, flags=re.DOTALL)

    # Update SCORE_PARAMS with actual min/max scores
    scores = [p['score'] for p in players]
    min_score = min(scores)
    max_score = max(scores)
    score_params_pattern = r'const SCORE_PARAMS = \{[^}]+\};'
    new_params = f'const SCORE_PARAMS = {{minScore:{min_score},maxScore:{max_score},minValue:600,maxValue:3100,k:0.1536}};'
    updated = re.sub(score_params_pattern, new_params, updated)

    with open(DATA_JS, 'w', encoding='utf-8') as f:
        f.write(updated)

    print(f'Updated BIG_BOARD with {len(players)} players (scores: {min_score}-{max_score}).')

if __name__ == '__main__':
    players = fetch_board()
    update_data_js(players)
