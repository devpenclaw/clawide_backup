import os
import sys
import threading
import logging
import time
from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv

# Add the current directory to sys.path to ensure imports work
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from binance_futures_bot import FuturesBot

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

bot_instance = None
bot_thread = None
log_messages = []

# Custom log handler to send logs to websocket
class SocketIoLogHandler(logging.Handler):
    def emit(self, record):
        log_entry = self.format(record)
        log_messages.append(log_entry)
        if len(log_messages) > 100:
            log_messages.pop(0)
        socketio.emit('log', {'data': log_entry})

handler = SocketIoLogHandler()
handler.setLevel(logging.INFO)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logging.getLogger().addHandler(handler)
logging.getLogger().setLevel(logging.INFO)

def run_bot():
    global bot_instance
    try:
        bot_instance = FuturesBot()
        bot_instance.start_trading()
    except Exception as e:
        logging.error(f"Bot thread error: {e}")
        bot_instance = None

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/status')
def status():
    if bot_instance:
        return jsonify({
            'status': 'running',
            'in_position': bot_instance.in_position,
            'symbol': bot_instance.SYMBOL
        })
    return jsonify({'status': 'stopped'})

@socketio.event
def start_bot():
    global bot_thread
    if not bot_instance:
        bot_thread = threading.Thread(target=run_bot)
        bot_thread.daemon = True
        bot_thread.start()
        emit('log', {'data': 'Bot starting...'})

@socketio.event
def stop_bot():
    global bot_instance
    if bot_instance:
        bot_instance.stop_trading()
        bot_instance = None
        emit('log', {'data': 'Bot stopped.'})

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, allow_unsafe_werkzeug=True)