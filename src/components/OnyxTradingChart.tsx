import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

// Onyx Option Signature Colors
const ONYX_THEME = {
  background: '#0a0b0d', // Deep dark
  upColor: '#00c076',     // Onyx Green
  downColor: '#ff3b30',   // Onyx Red
  gridColor: 'rgba(42, 46, 57, 0.2)',
  textColor: '#d1d4dc',
  borderColor: '#2a2e39',
};

export const OnyxTradingChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    // Load persisted zoom level
    const persistedBarSpacing = localStorage.getItem('onyx_chart_bar_spacing');
    const initialBarSpacing = persistedBarSpacing ? parseFloat(persistedBarSpacing) : 22;

    // 1. Initialize Chart with Professional Scaling and Interaction
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 450,
      layout: {
        background: { type: ColorType.Solid, color: ONYX_THEME.background },
        textColor: ONYX_THEME.textColor,
      },
      grid: {
        vertLines: { color: ONYX_THEME.gridColor },
        horzLines: { color: ONYX_THEME.gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: ONYX_THEME.borderColor,
        autoScale: true, // Pillar: Keep candles within area
        alignLabels: true,
        borderVisible: true,
      },
      timeScale: {
        borderColor: ONYX_THEME.borderColor,
        timeVisible: true,
        secondsVisible: true,
        barSpacing: initialBarSpacing,
        fixLeftEdge: true,
        rightOffset: 10,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: false,
      },
      kineticScroll: {
        touch: false,
        mouse: false,
      },
    });

    // Persist zoom level on change
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
        const currentSpacing = chart.timeScale().options().barSpacing;
        if (currentSpacing) {
            localStorage.setItem('onyx_chart_bar_spacing', currentSpacing.toString());
        }
    });

    // 2. Pillar 4: Visual Polish (Emerald & Rose)
    const candleSeries = (chart as any).addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      priceFormat: {
        type: 'price',
        precision: 5,
        minMove: 0.00001,
      },
    });

    seriesRef.current = candleSeries;

    // 3. Pillar 1 & 2: Continuity and Global Sync Logic
    const timeframeSeconds = 5;
    let lastCandle: any = null;
    let currentPrice = 1.25400; // Starting point

    const updateLoop = () => {
      if (!seriesRef.current) return;

      const now = Date.now();
      const candleTime = Math.floor(now / (timeframeSeconds * 1000)) * timeframeSeconds;
      
      // Simulate price movement
      const volatility = 0.00025;
      currentPrice += (Math.random() - 0.5) * volatility;

      let updatedCandle;

      if (!lastCandle || Number(candleTime) > Number(lastCandle.time)) {
        // Pillar 1: No-Gap Logic
        const openPrice = lastCandle ? lastCandle.close : currentPrice;
        
        updatedCandle = {
          time: candleTime as any,
          open: openPrice,
          high: Math.max(openPrice, currentPrice),
          low: Math.min(openPrice, currentPrice),
          close: currentPrice,
        };
      } else {
        // Pillar 3: High-Frequency Merging (New object to avoid mutation issues)
        updatedCandle = {
          ...lastCandle,
          close: currentPrice,
          high: Math.max(lastCandle.high, currentPrice),
          low: Math.min(lastCandle.low, currentPrice),
        };
      }

      lastCandle = updatedCandle;
      seriesRef.current.update(updatedCandle);
    };

    const interval = setInterval(updateLoop, 100); // 10 FPS for ultra-smooth movement

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  function THEME_RED_OR_GREEN() { return ONYX_THEME.downColor; }

  return (
    <div className="w-full bg-[#0a0b0d] rounded-xl overflow-hidden border border-[#2a2e39] mb-4">
      <div className="px-4 py-3 border-b border-[#2a2e39] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#00c076] rounded-full animate-pulse" />
          <span className="text-white font-bold text-sm tracking-wider">ONYX ENGINE LIVE</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-xs">TF: 5S</span>
          <span className="text-gray-500 text-xs">UTC+6</span>
        </div>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
};
