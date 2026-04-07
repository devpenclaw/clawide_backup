import os
import time
import logging
import threading
from binance.client import Client
from binance.enums import *
from dotenv import load_dotenv
import pandas as pd
import talib

load_dotenv()

API_KEY = os.getenv('BINANCE_API_KEY')
API_SECRET = os.getenv('BINANCE_API_SECRET')
SYMBOL = 'BTCUSDT'
TIMEFRAME = '5m'
LEVERAGE = 10
QUANTITY = 0.001
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERSOLD = 30

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("trading_bot.log"),
        logging.StreamHandler()
    ]
)

class FuturesBot:
    SYMBOL = SYMBOL  # Class attribute for easy access
    
    def __init__(self):
        self.client = Client(API_KEY, API_SECRET, testnet=True)
        self.running = True
        self.in_position = False

    def set_leverage(self):
        try:
            self.client.futures_change_leverage(symbol=SYMBOL, leverage=LEVERAGE)
            logging.info(f"Leverage set to {LEVERAGE}x for {SYMBOL}")
        except Exception as e:
            logging.error(f"Failed to set leverage: {e}")

    def fetch_historical_data(self, limit=100):
        try:
            klines = self.client.futures_klines(
                symbol=SYMBOL,
                interval=TIMEFRAME,
                limit=limit
            )
            df = pd.DataFrame(klines, columns=[
                'open_time', 'open', 'high', 'low', 'close', 'volume',
                'close_time', 'quote_asset_volume', 'number_of_trades',
                'taker_buy_base_asset_volume', 'taker_buy_quote_asset_volume', 'ignore'
            ])
            df['close'] = df['close'].astype(float)
            return df
        except Exception as e:
            logging.error(f"Failed to fetch historical data: {e}")
            return pd.DataFrame()

    def calculate_indicators(self, df):
        df['rsi'] = talib.RSI(df['close'].values, timeperiod=RSI_PERIOD)
        return df

    def open_long(self, quantity):
        try:
            order = self.client.futures_create_order(
                symbol=SYMBOL,
                side=SIDE_BUY,
                type=ORDER_TYPE_MARKET,
                quantity=quantity
            )
            self.in_position = True
            logging.info(f"LONG OPENED: {order['orderId']}")
            return order
        except Exception as e:
            logging.error(f"Failed to open long: {e}")

    def close_long(self, quantity):
        try:
            order = self.client.futures_create_order(
                symbol=SYMBOL,
                side=SIDE_SELL,
                type=ORDER_TYPE_MARKET,
                quantity=quantity
            )
            self.in_position = False
            logging.info(f"LONG CLOSED: {order['orderId']}")
            return order
        except Exception as e:
            logging.error(f"Failed to close long: {e}")

    def check_and_trade(self):
        # Fetch historical data and update indicators
        df = self.fetch_historical_data()
        if not df.empty:
            df = self.calculate_indicators(df)
            last_rsi = df['rsi'].iloc[-1]
            logging.info(f"Current RSI: {last_rsi}")

            # RSI Strategy: Buy if oversold, Sell if overbought
            if last_rsi < RSI_OVERSOLD and not self.in_position:
                self.open_long(QUANTITY)
            elif last_rsi > RSI_OVERBOUGHT and self.in_position:
                self.close_long(QUANTITY)

    def run(self):
        self.set_leverage()
        logging.info(f"Bot started for {SYMBOL} with RSI strategy (polling mode)...")
        
        # Run the trading loop with frequent checks for stopping
        while self.running:
            try:
                self.check_and_trade()
                # Sleep in small increments to allow for quick stopping
                for _ in range(30):  # 30 iterations of 10 seconds = 5 minutes
                    if not self.running:
                        break
                    time.sleep(10)
            except Exception as e:
                logging.error(f"Error in trading loop: {e}")
                time.sleep(60)  # Wait a minute before retrying on error

    def start_trading(self):
        self.runing = True
        self.run()

    def stop_trading(self):
        self.running = False
        logging.info("Bot stopped.")

if __name__ == "__main__":
    bot = FuturesBot()
    try:
        bot.run()
    except KeyboardInterrupt:
        bot.stop_trading()
        logging.info("Bot stopped by user.")