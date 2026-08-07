export interface NewsItem {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  imageUrl: string;
  date: string;
  category: string;
}

export const NEWS_DATA: Record<string, NewsItem> = {
  'chart-basics': {
    id: 'chart-basics',
    title: 'Get to know the chart',
    subtitle: 'The foundation of every successful trade begins with understanding the canvas.',
    date: 'August 3, 2026',
    category: 'Education',
    imageUrl: 'https://i.postimg.cc/fLngfrqx/Screenshot-20260803-165444.png',
    content: `
      <h2>The Heart of Trading</h2>
      <p>The price chart is more than just lines and candles; it's a living map of human psychology and market forces. To trade effectively, you must learn to read the stories these charts tell.</p>
      
      <h3>Visualizing Price Action</h3>
      <p>Our platform provides real-time, high-fidelity price feeds that allow you to see every tick of market movement. Whether you prefer Japanese Candlesticks, Heikin Ashi, or simple Area charts, understanding the flow of price is your first step to mastery.</p>
      
      <h3>Key Elements</h3>
      <ul>
        <li><strong>Timeframes:</strong> Switch between 1-second to 1-day views to identify both micro-scalping opportunities and long-term trends.</li>
        <li><strong>Price Scales:</strong> Use linear or logarithmic scales to better visualize percentage movements.</li>
        <li><strong>Interaction:</strong> Seamlessly zoom and scroll to examine historical data alongside real-time updates.</li>
      </ul>
      
      <p>Spend time observing the charts without trading. Notice how price reacts to certain levels, how it consolidates, and how it breaks out. This visual intuition is what separates professional traders from amateurs.</p>
    `
  },
  'chart-scale': {
    id: 'chart-scale',
    title: 'Precision Scaling',
    subtitle: 'Control your perspective with intuitive zooming and scrolling mechanics.',
    date: 'August 3, 2026',
    category: 'Platform Update',
    imageUrl: 'https://i.postimg.cc/sx9Xgqqb/Screenshot-20260803-165447.png',
    content: `
      <h2>Mastering Your View</h2>
      <p>In the fast-paced world of trading, perspective is everything. Our new scaling mechanics are designed to give you total control over how you perceive market movements.</p>
      
      <h3>Dynamic Zooming</h3>
      <p>Using your mouse wheel or touch gestures, you can instantly zoom in to see individual tick movements or zoom out to view the entire day's trend. The vertical scale automatically adjusts to keep the price action centered and clear.</p>
      
      <h3>Seamless Scrolling</h3>
      <p>Don't just look at the now. Drag the chart back to see how previous sessions unfolded. Our high-performance engine caches historical data, ensuring that your transition from past to present is smooth and lag-free.</p>
      
      <p>Pro Tip: Use the 'Reset Scale' button to instantly return to the most recent price point with the optimal zoom level for your screen size.</p>
    `
  },
  'market-overview': {
    id: 'market-overview',
    title: 'Market Overview 2.0',
    subtitle: 'A holistic view of the global financial landscape at your fingertips.',
    date: 'August 3, 2026',
    category: 'Features',
    imageUrl: 'https://i.postimg.cc/N0vbSPmn/IMG-20260803-175740-340.jpg',
    content: `
      <h2>The Big Picture</h2>
      <p>Successful traders don't look at assets in isolation. Our Market Overview feature allows you to monitor multiple currency pairs, commodities, and indices simultaneously.</p>
      
      <h3>Multi-Chart Layouts</h3>
      <p>Configure your workspace with up to 4 simultaneous chart views. Watch the correlation between EUR/USD and Gold, or monitor multiple timeframes of the same asset to confirm your entries.</p>
      
      <h3>Real-time Sentiment</h3>
      <p>See what the community is doing. Our integrated sentiment indicators show the balance of Buy vs. Sell orders across the entire Bivaax network, providing a powerful secondary confirmation for your strategies.</p>
      
      <p>By keeping a broad eye on the market, you can identify global trends before they manifest in individual charts.</p>
    `
  },
  'history-nav': {
    id: 'history-nav',
    title: 'Historical Navigation',
    subtitle: 'Travel back in time to analyze, learn, and perfect your trading strategies.',
    date: 'August 3, 2026',
    category: 'Tools',
    imageUrl: 'https://i.postimg.cc/yNTh56V8/IMG-20260803-175740-402.jpg',
    content: `
      <h2>Learning from the Past</h2>
      <p>History doesn't repeat itself, but it often rhymes. Our enhanced historical navigation tools allow you to perform deep post-trade analysis.</p>
      
      <h3>Back-Testing Visualization</h3>
      <p>Scroll back to any point in the last 30 days and see exactly how the indicators were positioned. Practice identifying setups in historical data to build the muscle memory needed for live trading.</p>
      
      <h3>High-Fidelity Replay</h3>
      <p>Our data servers store every single price change. When you scroll back, you're not seeing a simplified version of the chart; you're seeing the exact same high-resolution data that live traders saw at that moment.</p>
    `
  },
  'new-mechanics': {
    id: 'new-mechanics',
    title: 'Next-Gen Trading Mechanics',
    subtitle: 'Built for speed, engineered for reliability, designed for you.',
    date: 'August 3, 2026',
    category: 'System',
    imageUrl: 'https://i.postimg.cc/SNWdk64P/file-00000000511481fa82533f375be9869f.png',
    content: `
      <h2>Under the Hood</h2>
      <p>We've completely rebuilt our core execution engine. The result is a trading experience that is faster, more stable, and more responsive than ever before.</p>
      
      <h3>Zero-Latency Execution</h3>
      <p>Our new order matching algorithm reduces internal latency to sub-millisecond levels. When you click trade, your order is processed instantly, ensuring you get the exact price you see on the screen.</p>
      
      <h3>Enhanced Stability</h3>
      <p>With our new distributed server architecture, the platform remains rock-solid even during periods of extreme market volatility. Trade with confidence, knowing that your tools will always be ready when the opportunity strikes.</p>
    `
  },
  'trend-analysis': {
    id: 'trend-analysis',
    title: 'Mastering Trend Analysis',
    subtitle: 'Harness the power of technical indicators to unlock consistent profitability.',
    date: 'August 3, 2026',
    category: 'Strategy',
    imageUrl: 'https://i.postimg.cc/TPXXhq5D/file-0000000041348208ad773129ec36dec3.png',
    content: `
      <h2>The Trend is Your Friend</h2>
      <p>Identifying the direction of the market is the most critical skill for any trader. Our Trend Analysis suite provides professional-grade tools to help you stay on the right side of the trade.</p>
      
      <h3>Advanced Indicators</h3>
      <p>Access a full library of technical indicators, including Moving Averages, Bollinger Bands, RSI, and MACD. Each indicator is fully customizable, allowing you to fine-tune the parameters to match your specific trading style.</p>
      
      <h3>Visual Confirmation</h3>
      <p>Use our drawing tools to mark support and resistance levels, draw trend lines, and identify Fibonacci retracements. When these geometric levels align with your technical indicators, you have a high-probability trade setup.</p>
      
      <p>Remember: Technical analysis is not about predicting the future, but about managing probabilities. Use these tools to build a robust trading plan and manage your risk effectively.</p>
    `
  },
  'social-trading': {
    id: 'social-trading',
    title: 'Social Trading & Community',
    subtitle: 'Learn, share, and grow together with a global network of elite traders.',
    date: 'August 3, 2026',
    category: 'Community',
    imageUrl: 'https://i.postimg.cc/XvZFVzz7/file-00000000aa30821198dc51f01fa3ed44.png',
    content: `
      <h2>Strength in Numbers</h2>
      <p>Trading doesn't have to be a solo journey. Our Social Trading ecosystem is designed to connect beginners with veterans, fostering a culture of collective success.</p>
      
      <h3>Real-Time Community Feed</h3>
      <p>Join the conversation in our live trading rooms. Share your setups, discuss market news, and get instant feedback from other traders around the world. Every perspective adds a piece to the puzzle.</p>
      
      <h3>Leaderboards & Profiles</h3>
      <p>Follow the top-performing traders on Bivaax. Our transparent leaderboard showcases the best strategies in action, allowing you to learn from their trade history and risk management techniques.</p>
      
      <h3>Earn While You Share</h3>
      <p>Are you a successful trader? Build your following and earn additional rewards through our affiliate and community recognition programs. Your expertise is valuable, and we believe in rewarding it.</p>
      
      <p>By engaging with the community, you gain access to a wealth of knowledge that can significantly accelerate your learning curve and improve your trading results.</p>
    `
  },
  'smart-signals': {
    id: 'smart-signals',
    title: 'Smart Signals & Automation',
    subtitle: 'Leverage the power of algorithmic precision to optimize your trading entries.',
    date: 'August 3, 2026',
    category: 'Technology',
    imageUrl: 'https://i.postimg.cc/xTJS3Gh0/file-000000005d9c82098104f326333bf72d.png',
    content: `
      <h2>Precision at Your Fingertips</h2>
      <p>In the world of high-frequency trading, every second counts. Our Smart Signals engine analyzes millions of data points across multiple timeframes to identify high-probability setups before they happen.</p>
      
      <h3>Algorithmic Intelligence</h3>
      <p>Our signals aren't just based on simple indicators. They use a proprietary blend of price action, volatility analysis, and volume flow. Whether it's a trend reversal or a breakout confirmation, Smart Signals gives you the edge you need.</p>
      
      <h3>Real-Time Notifications</h3>
      <p>Never miss an opportunity again. Signals are delivered instantly to your trading terminal with clear entry points, expiration times, and confidence levels. You can choose to execute them manually with one click or set up automated alerts.</p>
      
      <h3>Fully Customizable</h3>
      <p>Filter signals based on your preferred assets, risk tolerance, and timeframes. Whether you're a 1-minute scalper or a daily trend follower, you can tune the engine to match your specific strategy.</p>
      
      <p>By integrating Smart Signals into your workflow, you reduce emotional bias and rely on data-driven insights to guide your trading decisions.</p>
    `
  },
  'crypto-profits': {
    id: 'crypto-profits',
    title: 'Unlocking Crypto Profits',
    subtitle: 'Master the high-volatility world of digital assets for maximum returns.',
    date: 'August 3, 2026',
    category: 'Markets',
    imageUrl: 'https://i.postimg.cc/g2zQBvBx/file-000000002ff08209a59650bce6f23599.png',
    content: `
      <h2>The Crypto Advantage</h2>
      <p>Cryptocurrencies offer unique opportunities for traders due to their 24/7 availability and significant price movements. On Bivaax, assets like Crypto IDX provide high payouts and consistent liquidity.</p>
      
      <h3>Why Trade Crypto on Bivaax?</h3>
      <p>Our platform provides a seamless experience for crypto trading. With competitive payout rates reaching up to 90% and beyond, digital assets are often the preferred choice for traders looking to grow their accounts quickly.</p>
      
      <h3>Diversified Digital Assets</h3>
      <p>From Bitcoin and Ethereum to specialized indices like Crypto IDX, we offer a wide range of instruments. Each asset has its own volatility profile, allowing you to tailor your strategy to current market conditions.</p>
      
      <h3>Advanced Risk Management</h3>
      <p>While the rewards are high, crypto markets require disciplined risk management. Use our built-in tools to set your trade amounts and expiration times precisely, ensuring you stay in control of your capital at all times.</p>
      
      <p>Start exploring the crypto markets today and discover why thousands of traders choose digital assets for their daily profit targets.</p>
    `
  },
  'deposit-bonus-50': {
    id: 'deposit-bonus-50',
    title: '50% Deposit Bonus',
    subtitle: 'Boost Your Trading with Every Deposit!',
    date: 'August 6, 2026',
    category: 'Promotions',
    imageUrl: 'https://i.postimg.cc/FHrDvXtr/file-0000000087d081fabe530d525061bcac.png',
    content: `
      <h2>Get 50% Bonus on your Deposit</h2>
      <p>Take your trading to the next level with our limited-time 50% Deposit Bonus.</p>
      
      <h3>Why Take This Offer?</h3>
      <ul>
        <li><strong>Fast Bonus Credit:</strong> Get your funds instantly.</li>
        <li><strong>Secure & Trusted Platform:</strong> Trade with peace of mind.</li>
        <li><strong>Instant Deposit Processing:</strong> No waiting around.</li>
      </ul>
      
      <p>Use Promo Code: <strong>BIVAAXFAST50</strong></p>
      <p><em>Limited Time Offer!</em></p>
      <p><strong>Trade Smart. Earn Big.</strong></p>
      
      <div style="margin-top: 2rem;">
        <a href="/crypto-deposit?promoCode=BIVAAXFAST50" style="display: inline-block; padding: 1rem 2rem; background-color: #FFE24C; color: black; font-weight: 800; border-radius: 0.75rem; text-decoration: none;">DEPOSIT NOW</a>
      </div>
    `
  }
};
