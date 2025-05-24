from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# In-memory storage for scores (replace with database in production)
high_scores = []

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/high-scores')
def high_scores_page():
    return render_template('/high-scores.html')

@app.route('/save_score', methods=['POST'])
def save_score():
    try:
        data = request.get_json()
        
        # Validate data
        if not all(key in data for key in ['score', 'time', 'difficulty']):
            return jsonify({'error': 'Missing data'}), 400
            
        # Add to high scores with timestamp
        high_scores.append({
            'score': data['score'],
            'time': data['time'],
            'difficulty': data['difficulty'],
            'timestamp': datetime.now().isoformat(),
            'player_name': data.get('player_name', 'Anonymous')  # Optional player name
        })
        
        # Sort by highest score, then by fastest time
        high_scores.sort(key=lambda x: (-x['score'], x['time']))
        
        # Keep only top scores (could increase this number)
        while len(high_scores) > 50:
            high_scores.pop()
            
        return jsonify({'success': True})
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_scores', methods=['GET'])
def get_scores():
    try:
        difficulty = request.args.get('difficulty', 'all').lower()
        
        # Filter by difficulty if requested
        filtered_scores = high_scores
        if difficulty != 'all':
            filtered_scores = [score for score in high_scores 
                             if score['difficulty'].lower() == difficulty]
        
        # Sort by score (descending) then time (ascending)
        filtered_scores.sort(key=lambda x: (-x['score'], x['time']))
        
        return jsonify(filtered_scores)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)