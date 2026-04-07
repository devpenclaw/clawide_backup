import pandas as pd
import matplotlib.pyplot as plt
from binance.client import Client
from dotenv import load_dotenv
import os
import talib

# Load environment variables
load_dotenv()

API_KEY = os.getenv('BINANCE_API_KEY')
API_SECRET = os.getenv('BINANCE_API_SECRET')
SYMBOL = 'BTCUSDT'
TIMEFRAME = '5m'
RSI_PERIOD = 14
RSI_OVERBOUGHT = 70
RSI_OVERSOLD = 30
QUANTITY = 0.001

client = Client(API_KEY, API_SECRET, testnet=True)

def fetch_data(limit=500):
    klines = client.futures_klines(
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
    df['open_time'] = pd.to_datetime(df['open_time'], unit='ms')
    return df

def backtest_strategy(df):
    df['rsi'] = talib.RSI(df['close'].values, timeperiod=RSI_PERIOD)
    
    df['signal'] = 0
    df.loc[df['rsi'] < RSI_OVERSOLD, 'signal'] = 1  # Buy
    df.loc[df['rsi'] > RSI_OVERBOUGHT, 'signal'] = -1  # Sell
    
    df['position'] = df['signal'].cumsum()
    df['returns'] = df['close'].pct_change()
    df['strategy_returns'] = df['position'].shift(1) * df['returns']
    
    cumulative_returns = (1 + df['strategy_returns']).cumprod()
    print(f"Final Cumulative Return: {cumulative_returns.iloc[-1]:.2f}")
    
    plt.figure(figsize=(12,6))
    plt.plot(df['open_time'], cumulative_returns, label='Strategy Returns')
    plt.plot(df['open_time'], (1 + df['returns']).cumprod(), label='Buy & Hold')
    plt.legend()
    plt.title('Backtest Results: RSI Strategy vs Buy & Hold')
    plt.show()

if __name__ == "__main__":
    print("Fetching historical data...")
    data = fetch_data()
    print("Running backtest...")
    backtest_strategy(data)
