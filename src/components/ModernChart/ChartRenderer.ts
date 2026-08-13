import { Candle, Viewport } from './types';

export class ChartRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  private dpr: number = window.devicePixelRatio || 1;

  // Colors
  private colors = {
    bg: '#0a0b0d',
    grid: 'rgba(255, 255, 255, 0.03)',
    up: '#00c076',
    down: '#ff3b30',
    text: '#8a8d97',
    crosshair: 'rgba(255, 255, 255, 0.2)',
    priceLine: 'rgba(0, 192, 118, 0.4)',
  };

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  public setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ctx.canvas.width = width * this.dpr;
    this.ctx.canvas.height = height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  public render(
    candles: Candle[],
    viewport: Viewport,
    crosshair: { x: number; y: number } | null
  ) {
    this.ctx.fillStyle = this.colors.bg;
    this.ctx.fillRect(0, 0, this.width, this.height);

    const pricePadding = 60; // Right scale
    const timePadding = 30;  // Bottom scale
    const chartWidth = this.width - pricePadding;
    const chartHeight = this.height - timePadding;

    // 1. Calculate Scales
    const { minPrice, maxPrice, zoom, offset } = viewport;
    const priceRange = maxPrice - minPrice;
    
    const getY = (price: number) => {
      return chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    };

    // 2. Draw Grid
    this.drawGrid(chartWidth, chartHeight, minPrice, maxPrice);

    // 3. Draw Candles
    const candleWidth = zoom * 0.8;
    const spacing = zoom;

    candles.forEach((candle, index) => {
      // Calculate X position
      // offset is the number of pixels shifted
      const x = chartWidth - (candles.length - 1 - index) * spacing + offset;

      // Only draw if within viewport
      if (x + candleWidth < 0 || x > chartWidth) return;

      const isUp = candle.close >= candle.open;
      this.ctx.strokeStyle = isUp ? this.colors.up : this.colors.down;
      this.ctx.fillStyle = isUp ? this.colors.up : this.colors.down;
      this.ctx.lineWidth = 1;

      // Wick
      this.ctx.beginPath();
      this.ctx.moveTo(x + candleWidth / 2, getY(candle.high));
      this.ctx.lineTo(x + candleWidth / 2, getY(candle.low));
      this.ctx.stroke();

      // Body
      const bodyY = getY(Math.max(candle.open, candle.close));
      const bodyHeight = Math.max(1, Math.abs(getY(candle.open) - getY(candle.close)));
      this.ctx.fillRect(x, bodyY, candleWidth, bodyHeight);
    });

    // 4. Draw Right Price Scale
    this.drawPriceScale(chartWidth, chartHeight, pricePadding, minPrice, maxPrice);

    // 5. Draw Crosshair
    if (crosshair && crosshair.x < chartWidth && crosshair.y < chartHeight) {
      this.drawCrosshair(crosshair.x, crosshair.y, chartWidth, chartHeight);
    }
    
    // 6. Draw Current Price Line
    if (candles.length > 0) {
      const lastCandle = candles[candles.length - 1];
      const ly = getY(lastCandle.close);
      this.ctx.setLineDash([5, 5]);
      this.ctx.strokeStyle = this.colors.priceLine;
      this.ctx.beginPath();
      this.ctx.moveTo(0, ly);
      this.ctx.lineTo(chartWidth, ly);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  private drawGrid(w: number, h: number, min: number, max: number) {
    this.ctx.strokeStyle = this.colors.grid;
    this.ctx.lineWidth = 1;

    // Horizontal grid lines (Price)
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const y = (h / steps) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }
    
    // Vertical grid lines
    const vSteps = 8;
    for (let i = 0; i <= vSteps; i++) {
      const x = (w / vSteps) * i;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
  }

  private drawPriceScale(w: number, h: number, pad: number, min: number, max: number) {
    this.ctx.fillStyle = this.colors.text;
    this.ctx.font = '10px Inter, sans-serif';
    this.ctx.textAlign = 'left';
    
    const steps = 6;
    const range = max - min;
    for (let i = 0; i <= steps; i++) {
      const y = (h / steps) * i;
      const price = max - (range / steps) * i;
      this.ctx.fillText(price.toFixed(5), w + 10, y + 4);
    }
  }

  private drawCrosshair(x: number, y: number, w: number, h: number) {
    this.ctx.strokeStyle = this.colors.crosshair;
    this.ctx.setLineDash([2, 2]);
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, h);
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(w, y);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
}
