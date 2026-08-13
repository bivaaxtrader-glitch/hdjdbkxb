import { Candle } from './types';

export const generateMockData = (count: number): Candle[] => {
  const data: Candle[] = [];
  let time = Math.floor(Date.now() / 1000) - count * 5;
  let price = 1.08540;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 0.00040;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * 0.00010;
    const low = Math.min(open, close) - Math.random() * 0.00010;

    data.push({
      time: time,
      open,
      high,
      low,
      close,
    });

    price = close;
    time += 5;
  }

  return data;
};
