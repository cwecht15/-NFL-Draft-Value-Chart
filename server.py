"""
Local dev server with a /api/refresh endpoint that pulls fresh scores.
Usage: python server.py [port]
"""
import http.server
import json
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
ROOT = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path == '/api/refresh':
            self.handle_refresh()
        else:
            self.send_error(404)

    def handle_refresh(self):
        try:
            from update_board import fetch_board, update_data_js
            players = fetch_board()
            update_data_js(players)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({
                'ok': True,
                'count': len(players),
                'minScore': min(p['score'] for p in players),
                'maxScore': max(p['score'] for p in players),
            }).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': False, 'error': str(e)}).encode())

if __name__ == '__main__':
    with http.server.HTTPServer(('', PORT), Handler) as httpd:
        print(f'Serving on http://localhost:{PORT}')
        httpd.serve_forever()
