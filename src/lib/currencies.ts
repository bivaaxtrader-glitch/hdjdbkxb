export interface Currency {
  code: string;
  symbol: string;
  rate: number; // Rate relative to USD (1 USD = ?)
  name: string;
}

export const currencies: Currency[] = [
  { code: 'USD', symbol: '$', rate: 1, name: 'US Dollar' },
  { code: 'USDT', symbol: '$', rate: 1, name: 'Tether' },
  { code: 'BDT', symbol: '৳', rate: 120, name: 'Bangladeshi Taka' },
  { code: 'EUR', symbol: '€', rate: 0.92, name: 'Euro' },
  { code: 'GBP', symbol: '£', rate: 0.78, name: 'British Pound' },
  { code: 'INR', symbol: '₹', rate: 83.5, name: 'Indian Rupee' },
  { code: 'PKR', symbol: '₨', rate: 278, name: 'Pakistani Rupee' },
  { code: 'BRL', symbol: 'R$', rate: 5.4, name: 'Brazilian Real' },
  { code: 'TRY', symbol: '₺', rate: 32.5, name: 'Turkish Lira' },
  { code: 'NGN', symbol: '₦', rate: 1500, name: 'Nigerian Naira' },
];

export const getCurrencySymbol = (code: string = 'USD') => {
  return currencies.find(c => c.code === code)?.symbol || '$';
};

export const formatWithCurrency = (amount: number, currencyCode: string = 'USD') => {
  const currency = currencies.find(c => c.code === currencyCode) || currencies[0];
  const num = Number(amount || 0);
  const converted = num * (currency.rate || 1);
  const decimals = ['USD', 'USDT', 'EUR', 'GBP'].includes(currency.code) ? 2 : (Math.abs(converted) < 10 ? 2 : 0);
  
  return `${currency.symbol}${converted.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  })}`;
};

export const formatCurrencyOnly = (amount: number, currencyCode: string = 'USD') => {
  const currency = currencies.find(c => c.code === currencyCode) || currencies[0];
  const num = Number(amount || 0);
  const decimals = ['USD', 'USDT', 'EUR', 'GBP'].includes(currency.code) ? 2 : (Math.abs(num) < 10 ? 2 : 0);
  
  return `${currency.symbol}${num.toLocaleString('en-US', { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  })}`;
};

export const convertToBase = (amount: number, currencyCode: string = 'USD') => {
  const currency = currencies.find(c => c.code === currencyCode) || currencies[0];
  return amount / (currency.rate || 1);
};

export const convertFromBase = (amount: number, currencyCode: string = 'USD') => {
  const currency = currencies.find(c => c.code === currencyCode) || currencies[0];
  return amount * (currency.rate || 1);
};
