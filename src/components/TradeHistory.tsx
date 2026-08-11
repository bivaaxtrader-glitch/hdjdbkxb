import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';

interface Trade {
  id: string;
  asset: string;
  type: "up" | "down";
  amount: number;
  entryPrice: number;
  exitPrice?: number;
  status: "open" | "won" | "lost" | "draw";
  createdAt: number;
  closedAt?: number;
  payoutAmount: number;
  payout?: number;
}

const TradeHistory: React.FC = () => {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const fetchTrades = async () => {
      try {
        const response = await fetch(`/api/user-trades?userId=${auth.currentUser?.uid}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.trades) {
            setTrades(data.trades);
          }
        }
      } catch (err) {
        console.warn("Trade history fetch failed:", err);
      }
    };

    fetchTrades();
  }, []);

  return (
    <div className="text-gray-300">
      <table className="w-full text-left">
        <thead>
          <tr className="text-xs text-gray-500 uppercase border-b border-white/10">
            <th className="py-3 px-4">Asset</th>
            <th className="py-3 px-4">Type</th>
            <th className="py-3 px-4">Entry</th>
            <th className="py-3 px-4">Exit</th>
            <th className="py-3 px-4">Outcome</th>
            <th className="py-3 px-4">Payout</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, index) => (
            <tr key={`${trade.id || 'trade'}-${index}`} className="border-b border-white/5 text-sm">
              <td className="py-3 px-4">{trade.asset}</td>
              <td className={`py-3 px-4 font-bold ${trade.type === 'up' ? 'text-green-500' : 'text-red-500'}`}>{trade.type.toUpperCase()}</td>
              <td className="py-3 px-4">{trade.entryPrice.toFixed(4)}</td>
              <td className="py-3 px-4">{trade.exitPrice?.toFixed(4) || '-'}</td>
              <td className={`py-3 px-4 font-bold ${trade.status === 'won' ? 'text-green-500' : trade.status === 'draw' ? 'text-yellow-500' : 'text-red-500'}`}>
                   {trade.status.toUpperCase()}
              </td>
              <td className="py-3 px-4">
                  {trade.payoutAmount ? (trade.status === 'won' ? `+${trade.payoutAmount.toFixed(2)}` : trade.payoutAmount.toFixed(2)) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TradeHistory;
