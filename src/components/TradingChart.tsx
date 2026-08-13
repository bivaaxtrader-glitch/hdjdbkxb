import React, { useEffect, useRef } from 'react';
import { createChart, ISeriesApi, CandlestickData, Time, CrosshairMode } from 'lightweight-charts';

export const TradingChart: React.FC = () => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'>>(null);
  const requestRef = useRef<number>(0);
  const lastCandleRef = useRef<CandlestickData<Time> | null>(null);

  const timeframeSeconds = 5;
  const colors = {
    up: '#10b981',
    down: '#f43f5e',
    bg: '#0a0b0d',
    grid: 'rgba(255, 255, 255, 0.03)',
    border: '#1e222d',
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize Chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 450,
      layout: {
        background: { color: colors.bg },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: colors.border,
        autoScale: true,
        alignLabels: true,
        borderVisible: true,
        handleScale: false, // Explicitly disable manual price scale interaction
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: true,
        barSpacing: 12,
        fixLeftEdge: true,
        fixRightEdge: true, // Prevent scrolling into the future/void
        rightOffset: 2,
        minBarSpacing: 5,
        maxBarSpacing: 50,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false, 
      },
      handleScale: {
        axisPressedMouseMove: false,
        axisPressedPinch: false,
        mouseWheel: false, // Strictly lock zoom level to prevent rendering intensity issues
        pinch: false,      
      },
    });

    // Strict Clamping: Prevent the chart from ever being dragged into a blank state
    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      const timeScale = chart.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (!visibleRange) return;
      
      // If user drags too far, we reset to the most recent data
      if (visibleRange.to < Date.now() / 1000 - 3600 * 24) {
        timeScale.scrollToRealTime();
      }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceFormat: {
        type: 'price',
        precision: 5,
        minMove: 0.00001,
      },
      autoscaleInfoProvider: () => ({
        priceRange: {
          minValue: lastCandleRef.current ? lastCandleRef.current.low * 0.999 : 0,
          maxValue: lastCandleRef.current ? lastCandleRef.current.high * 1.001 : 0,
        },
      }),
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    // Onyx Logic: Real-time update loop using requestAnimationFrame
    let currentPrice = 1.25400;

    const updateLoop = () => {
      if (!seriesRef.current) return;

      const now = Date.now();
      const candleTime = (Math.floor(now / (timeframeSeconds * 1000)) * timeframeSeconds) as Time;

      // Simulate price movement
      const volatility = 0.00010;
      currentPrice += (Math.random() - 0.5) * volatility;

      let updatedCandle: CandlestickData<Time>;

      if (!lastCandleRef.current || (candleTime > (lastCandleRef.current.time as number))) {
        // Pillar 1: No-Gap Logic (New Open = Last Close)
        const openPrice = lastCandleRef.current ? lastCandleRef.current.close : currentPrice;
        
        updatedCandle = {
          time: candleTime,
          open: openPrice,
          high: Math.max(openPrice, currentPrice),
          low: Math.min(openPrice, currentPrice),
          close: currentPrice,
        };
      } else {
        // High-frequency merging
        updatedCandle = {
          ...lastCandleRef.current,
          close: currentPrice,
          high: Math.max(lastCandleRef.current.high, currentPrice),
          low: Math.min(lastCandleRef.current.low, currentPrice),
        };
      }

      lastCandleRef.current = updatedCandle;
      seriesRef.current.update(updatedCandle);

      requestRef.current = requestAnimationFrame(updateLoop);
    };

    requestRef.current = requestAnimationFrame(updateLoop);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (chartRef.current) chartRef.current.remove();
    };
  }, []);

  return (
    <div className="w-full bg-[#0a0b0d] rounded-xl border border-white/5 shadow-2xl overflow-hidden p-1">
      <div 
        ref={chartContainerRef} 
        className="w-full h-[450px] relative overflow-hidden"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
};
