import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Candle, Viewport } from './types';
import { generateMockData } from './mockData';
import { ChartRenderer } from './ChartRenderer';

export const ModernChart: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ChartRenderer | null>(null);
  const requestRef = useRef<number>(0);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [viewport, setViewport] = useState<Viewport>({
    offset: 0,
    zoom: 12,
    minPrice: 0,
    maxPrice: 0,
  });
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);

  // Interaction State
  const isDragging = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });

  // 1. Initialize Data
  useEffect(() => {
    const data = generateMockData(500);
    setCandles(data);
    
    // Auto scale initial view
    const visibleCount = Math.floor(800 / 12);
    const visibleCandles = data.slice(-visibleCount);
    const low = Math.min(...visibleCandles.map(c => c.low));
    const high = Math.max(...visibleCandles.map(c => c.high));
    const pad = (high - low) * 0.1;

    setViewport(prev => ({
      ...prev,
      minPrice: low - pad,
      maxPrice: high + pad,
    }));
  }, []);

  // 2. Initialize Renderer
  useEffect(() => {
    if (canvasRef.current) {
      rendererRef.current = new ChartRenderer(canvasRef.current.getContext('2d')!);
      handleResize();
    }
  }, []);

  const handleResize = useCallback(() => {
    if (containerRef.current && rendererRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      rendererRef.current.setSize(clientWidth || 800, clientHeight || 500);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver(() => {
      handleResize();
    });
    
    observer.observe(containerRef.current);
    
    return () => {
      observer.disconnect();
    };
  }, [handleResize]);

  // 3. Animation Loop (60 FPS)
  const animate = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.render(candles, viewport, crosshair);
    }
    requestRef.current = requestAnimationFrame(animate);
  }, [candles, viewport, crosshair]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate]);

  // 4. Pointer Interaction
  const onPointerDown = (e: React.PointerEvent) => {
    const x = e.nativeEvent.offsetX;
    const pricePadding = 60;
    const chartWidth = (containerRef.current?.clientWidth || 800) - pricePadding;

    // Block interaction if starting on price scale
    if (x > chartWidth) return;

    isDragging.current = true;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const x = e.nativeEvent.offsetX;
    const y = e.nativeEvent.offsetY;
    setCrosshair({ x, y });

    // Pillar: Prevent any interaction if touch/mouse is on the price scale (right 60px)
    const pricePadding = 60;
    const chartWidth = (containerRef.current?.clientWidth || 800) - pricePadding;
    
    if (x > chartWidth) {
      isDragging.current = false;
      return;
    }

    if (!isDragging.current) return;

    const deltaX = e.clientX - lastPointerPos.current.x;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    setViewport(prev => {
      const newOffset = prev.offset + deltaX;
      
      // Boundary Logic for Horizontal Panning
      const maxOffset = 300; 
      const minOffset = -((candles.length * prev.zoom) - 100);
      const boundedOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));

      // Auto-Scale Vertical based on visible candles
      const pricePadding = 60;
      const chartWidth = (containerRef.current?.clientWidth || 800) - pricePadding;
      const spacing = prev.zoom;
      
      // Find visible candles
      const visibleCandles = candles.filter((_, index) => {
        const x = chartWidth - (candles.length - 1 - index) * spacing + boundedOffset;
        return x + spacing > 0 && x < chartWidth;
      });

      if (visibleCandles.length > 0) {
        const low = Math.min(...visibleCandles.map(c => c.low));
        const high = Math.max(...visibleCandles.map(c => c.high));
        const pricePad = (high - low) * 0.15;
        
        return {
          ...prev,
          offset: boundedOffset,
          minPrice: low - pricePad,
          maxPrice: high + pricePad,
        };
      }

      return {
        ...prev,
        offset: boundedOffset,
      };
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY > 0 ? -1 : 1;
    setViewport(prev => {
      const nextZoom = Math.max(2, Math.min(50, prev.zoom + zoomDelta));
      return { ...prev, zoom: nextZoom };
    });
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-[500px] bg-[#0a0b0d] rounded-xl overflow-hidden border border-white/5 select-none touch-none"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
      
      {/* HUD Info */}
      <div className="absolute top-4 left-4 pointer-events-none">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold tracking-tighter text-xl">BTC/USD</span>
          <span className="text-[#00c076] font-mono text-sm">1.08542 (+0.04%)</span>
        </div>
      </div>
    </div>
  );
};
