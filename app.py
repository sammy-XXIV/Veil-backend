from flask import Flask, request, jsonify
from flask_cors import CORS
import subprocess
import json
import os

app = Flask(__name__)
CORS(app)

@app.route('/encrypt', methods=['POST'])
def encrypt():
    data = request.json
    amount = data.get('amount')
    contract_address = data.get('contractAddress')
    user_address = data.get('userAddress')
    
    if not all([amount, contract_address, user_address]):
        return jsonify({'error': 'Missing fields'}), 400
    
    result = subprocess.run(
        ['node', 'encrypt.js', amount, contract_address, user_address],
        capture_output=True, text=True
    )
    
    if result.returncode != 0:
        return jsonify({'error': result.stderr, 'success': False}), 500
    
    return jsonify(json.loads(result.stdout))

if __name__ == '__main__':
    app.run()
