import React, { useState } from 'react';

export const getFlagCode = (currency: string) => {
  const map: Record<string, string> = {
    'USD': 'us', 'EUR': 'eu', 'GBP': 'gb', 'JPY': 'jp', 'AUD': 'au', 
    'CAD': 'ca', 'CHF': 'ch', 'NZD': 'nz', 'DKK': 'dk', 'INR': 'in',
    'BRL': 'br', 'TRY': 'tr', 'RUB': 'ru', 'CNY': 'cn', 'ZAR': 'za'
  };
  return map[currency.toUpperCase()] || 'un';
};

export const AssetLogo = ({ name, size = 32 }: { name: string, size?: number }) => {
  const [hasError, setHasError] = useState(false);

  if (!name) return <div className="rounded-full bg-gray-800" style={{ width: size, height: size }} />;
  if (name === "Crypto IDX") {
    const innerCircleSize = Math.max(8, Math.floor(size * 0.375));
    return (
      <div className="relative flex items-center justify-center bg-gradient-to-br from-[#2b2d35] to-[#1a1b1f] rounded-lg border border-white/10 shadow-lg overflow-hidden group" style={{ width: size, height: size }}>
        <div className="grid grid-cols-2 gap-0.5 p-1 w-full h-full opacity-80 group-hover:opacity-100 transition-opacity">
          <div className="bg-[#f7931a] rounded-[1px] shadow-sm"></div>
          <div className="bg-[#627eea] rounded-[1px] shadow-sm"></div>
          <div className="bg-[#14f195] rounded-[1px] shadow-sm"></div>
          <div className="bg-[#f3ba2f] rounded-[1px] shadow-sm"></div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-[#1a1b1f] rounded-full flex items-center justify-center border border-white/20 shadow-xl" style={{ width: innerCircleSize, height: innerCircleSize }}>
             <span className="font-black italic text-white leading-none" style={{ fontSize: Math.floor(innerCircleSize * 0.6) }}>C</span>
          </div>
        </div>
      </div>
    );
  }

  // Handle crypto icons
  const cryptoIcons: Record<string, { color: string; label: string; symbol: string }> = {
    'BTC/USD': { color: '#F7931A', label: '₿', symbol: 'btc' },
    'ETH/USD': { color: '#627EEA', label: 'Ξ', symbol: 'eth' },
    'LTC/USD': { color: '#345D9D', label: 'Ł', symbol: 'ltc' },
    'SOL/USD': { color: '#14F195', label: 'S', symbol: 'sol' },
    'ADA/USD': { color: '#0033AD', label: 'A', symbol: 'ada' },
    'UNI/USD': { color: '#FF007A', label: 'U', symbol: 'uni' },
    'LINK/USD': { color: '#2A5ADA', label: 'C', symbol: 'link' },
    'LINK/USD (OTC)': { color: '#2A5ADA', label: 'C', symbol: 'link' },
    'TON/USD': { color: '#0088CC', label: 'T', symbol: 'ton' },
    'TON/USD (OTC)': { color: '#0088CC', label: 'T', symbol: 'ton' },
    'CAKE/USD': { color: '#D1884F', label: 'P', symbol: 'cake' },
    'FET/USD': { color: '#000000', label: 'F', symbol: 'fet' },
    'AAVE/USD': { color: '#B6509E', label: 'A', symbol: 'aave' },
    'BCH/USD': { color: '#8BC34A', label: 'B', symbol: 'bch' },
    'DOT/USD': { color: '#E6007A', label: 'P', symbol: 'dot' },
    'AVAX/USD': { color: '#E84142', label: 'A', symbol: 'avax' },
    'POL/USD': { color: '#8247E5', label: 'P', symbol: 'pol' },
    'ICP/USD': { color: '#F48225', label: 'I', symbol: 'icp' },
    'BAR/USD': { color: '#004D98', label: 'B', symbol: 'bar' },
    'KSM/USD': { color: '#000000', label: 'K', symbol: 'ksm' },
    'RSR/USD': { color: '#F6C915', label: 'R', symbol: 'rsr' },
    'LPT/USD': { color: '#00E37D', label: 'L', symbol: 'lpt' },
    'WOO/USD': { color: '#000000', label: 'W', symbol: 'woo' },
    'VEC/USD': { color: '#5C6BC0', label: 'V', symbol: 'vec' },
    'XRP/USD': { color: '#23292F', label: 'X', symbol: 'xrp' },
    'DOGE/USD': { color: '#C2A633', label: 'D', symbol: 'doge' },
    'SHIB/USD': { color: '#FFA409', label: 'S', symbol: 'shib' },
  };

  const stockIcons: Record<string, { color: string; label: string }> = {
    'Apple': { color: '#555555', label: '' },
    'Tesla': { color: '#E31937', label: 'T' },
    'Microsoft': { color: '#00A4EF', label: 'M' },
    'Google': { color: '#4285F4', label: 'G' },
    'Amazon': { color: '#FF9900', label: 'A' },
    'Meta': { color: '#0668E1', label: 'M' },
    'NVIDIA': { color: '#76B900', label: 'N' },
    'Netflix': { color: '#E50914', label: 'N' },
    'Intel': { color: '#0071C5', label: 'I' },
    'Disney': { color: '#113CCF', label: 'D' },
    'Yum Brands': { color: '#C41230', label: 'Y' },
  };

  const indexIcons: Record<string, { color: string; label: string }> = {
    'US 30': { color: '#1a1b1f', label: '30' },
    'US 100': { color: '#1a1b1f', label: '100' },
    'US 500': { color: '#1a1b1f', label: '500' },
    'GER 40': { color: '#1a1b1f', label: '40' },
    'UK 100': { color: '#1a1b1f', label: '100' },
    'JPN 225': { color: '#1a1b1f', label: '225' },
    'Gold': { color: '#FFD700', label: 'Au' },
    'Oil': { color: '#333333', label: 'Oil' },
  };

  const cryptoKey = Object.keys(cryptoIcons).find(k => name.includes(k));
  if (cryptoKey) {
    const icon = cryptoIcons[cryptoKey];
    return (
      <div 
        className="rounded-full flex items-center justify-center overflow-hidden bg-[#2A2C31] shadow-lg ring-1 ring-white/10 transition-all"
        style={hasError ? { backgroundColor: icon.color, width: size, height: size } : { width: size, height: size }}
      >
        {hasError ? (
          <span className="text-white font-bold" style={{ fontSize: Math.floor(size * 0.4) }}>{icon.label}</span>
        ) : (
          <img 
            src={`https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${icon.symbol}.png`}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setHasError(true)}
          />
        )}
      </div>
    );
  }

  // Handle Stocks
  const stockKey = Object.keys(stockIcons).find(k => name.includes(k));
  if (stockKey) {
    const icon = stockIcons[stockKey];
    return (
      <div 
        className="rounded-lg flex items-center justify-center overflow-hidden bg-[#2A2C31] shadow-lg border border-white/10 transition-all"
        style={{ backgroundColor: icon.color, width: size, height: size }}
      >
        <span className="text-white font-black" style={{ fontSize: Math.floor(size * 0.5) }}>{icon.label}</span>
      </div>
    );
  }

  // Handle Indices
  const indexKey = Object.keys(indexIcons).find(k => name.includes(k));
  if (indexKey) {
    const icon = indexIcons[indexKey];
    return (
      <div 
        className="rounded-lg flex items-center justify-center overflow-hidden bg-[#1a1b1f] shadow-lg border-2 border-yellow-500/50 transition-all"
        style={{ width: size, height: size }}
      >
        <span className="text-yellow-500 font-black italic tracking-tighter" style={{ fontSize: Math.floor(size * 0.4) }}>{icon.label}</span>
      </div>
    );
  }

  // Handle currency pairs (Flags)
  if (name.includes('/')) {
    const parts = name.split(' ')[0].split('/');
    const code1 = getFlagCode(parts[0]);
    const code2 = getFlagCode(parts[1]);
    
    const flagW = Math.floor(size * 0.75);
    const flagH = Math.floor(size * 0.5);

    return (
      <div className="flex -space-x-1.5 items-center">
        <div className="rounded-sm overflow-hidden border border-white/10 shadow-sm z-10" style={{ width: flagW, height: flagH }}>
          <img src={`https://flagcdn.com/w80/${code1}.png`} alt={parts[0]} className="w-full h-full object-cover"  loading="lazy" />
        </div>
        <div className="rounded-sm overflow-hidden border border-white/10 shadow-sm" style={{ width: flagW, height: flagH }}>
          <img src={`https://flagcdn.com/w80/${code2}.png`} alt={parts[1]} className="w-full h-full object-cover"  loading="lazy" />
        </div>
      </div>
    );
  }

  // Default fallback
  return (
    <div className="bg-gradient-to-br from-gray-700 to-gray-800 rounded-md flex items-center justify-center font-black border border-white/5 text-gray-400" style={{ width: size, height: size, fontSize: Math.floor(size * 0.3) }}>
      {name.substring(0, 3)}
    </div>
  );
};
