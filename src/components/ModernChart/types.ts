export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Viewport {
  offset: number; // Horizontal scroll offset
  zoom: number;   // Bar width in pixels
  minPrice: number;
  maxPrice: number;
}
