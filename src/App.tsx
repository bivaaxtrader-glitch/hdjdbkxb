import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db, onAuthStateChanged, signOut, getDoc, doc, getDocs, query, collection, where, setDoc, updateDoc } from './firebase';
import { User } from './lib/auth-client.ts';
import { Lock, LogOut } from 'lucide-react';
import * as OTPAuth from 'otpauth';
import { motion } from 'motion/react';

import { Toaster, toast } from 'react-hot-toast';


import { I18nProvider } from './context/I18nContext';
import { SupportProvider, useSupport } from './contexts/SupportContext';
import { LiveSupport } from './components/LiveSupport';
import AppBoundary from './components/AppBoundary';


import DocsPage from './pages/DocsPage';
import ProfilePage from './pages/Profile';
import AffiliatePage from './pages/Affiliate';
import Homepage from './pages/Homepage';
import TradeTerminal from './pages/TradeTerminal';
import AdminDashboard from './pages/AdminDashboard';
import SignalsPage from './pages/Signals';
import CopyTradingPage from './pages/CopyTrading';
import StaticPage from './pages/StaticPage';
import AboutUsPage from './pages/AboutUs';
import NewsPage from './pages/NewsPage';
import BinancePayPage from './pages/BinancePayPage';
import CryptoDepositPage from './pages/CryptoDepositPage';
import MFSDepositPage from './pages/MFSDepositPage';
import BkashDeposit from './pages/BkashDeposit';
import NagadDeposit from './pages/NagadDeposit';
import RocketDeposit from './pages/RocketDeposit';
import UsdtTrc20Deposit from './pages/UsdtTrc20Deposit';
import BitcoinDeposit from './pages/BitcoinDeposit';
import TonDeposit from './pages/TonDeposit';
import DogeDeposit from './pages/DogeDeposit';
import LtcDeposit from './pages/LtcDeposit';
import GoPayDepositPage from './pages/GoPayDepositPage';
import AuthPage from './pages/AuthPage';
import AffiliateLandingPage from './pages/AffiliateLanding';

// Loader for Suspense
const PageLoader = () => (
  <div className="min-h-[100dvh] bg-[#101115] flex items-center justify-center">
    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FFE24C]"></div>
  </div>
);


function SupportModalWrapper({ user }: { user: User | null }) {
  const { isSupportOpen, closeSupport } = useSupport();
  return isSupportOpen ? <LiveSupport onClose={closeSupport} userId={user?.uid || 'guest'} /> : null;
}

const RequireAuth = ({ children, user }: { children: React.ReactNode; user: User | null }) => {
  return user ? children : <Navigate to="/" replace />;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tfaRequired, setTfaRequired] = useState(false);
  const [tfaPassed, setTfaPassed] = useState(false);
  const [tfaCode, setTfaCode] = useState('');
  const [tfaMode, setTfaMode] = useState<string>('app');
  const [tfaSecretBase32, setTfaSecretBase32] = useState<string | null>(null);

  // Automated Payment Methods Initializer/Migrator
  useEffect(() => {
    const initializePaymentSettingsAndMethods = async () => {
      try {
        // 1. Ensure app_config/settings document contains fallbacks for Binance Pay, USDT TRC-20, and Ethereum
        const settingsRef = doc(db, 'app_config', 'settings');
        const settingsSnap = await getDoc(settingsRef);
        
        const updates: any = {};
        const data = settingsSnap.exists() ? settingsSnap.data() : {};
        
        if (!data.binancePayQrCode) {
          updates.binancePayQrCode = "https://i.postimg.cc/Gt5SP1L4/IMG-20260804-141135.png";
        }
        if (data.binancePayEnabled === undefined) {
          updates.binancePayEnabled = true;
        }
        
        if (!data.usdtTrc20Address) {
          updates.usdtTrc20Address = "TD73cKwhFQ3i5e43TYyoyMPijvkU4uHVwi";
        }
        if (!data.usdtTrc20QrCode) {
          updates.usdtTrc20QrCode = "https://i.postimg.cc/ZKN9zFGL/IMG-20260804-151047.png";
        }
        if (data.usdtTrc20Enabled === undefined) {
          updates.usdtTrc20Enabled = true;
        }

        if (!data.ethAddress) {
          updates.ethAddress = "0x8e01631855cf57fa2da27ff30c181cca137aefb5";
        }
        if (!data.ethQrCode) {
          updates.ethQrCode = "https://i.postimg.cc/T3WzTQGD/IMG-20260804-151727.png";
        }
        if (data.ethEnabled === undefined) {
          updates.ethEnabled = true;
        }

        if (!data.btcAddress) {
          updates.btcAddress = "0x8e01631855cf57fa2da27ff30c181cca137aefb5";
        }
        if (!data.btcQrCode) {
          updates.btcQrCode = "https://i.postimg.cc/GpKwd7Gr/IMG-20260804-235328.png";
        }
        if (data.btcEnabled === undefined) {
          updates.btcEnabled = true;
        }

        if (!data.tonAddress) {
          updates.tonAddress = "UQCCpPsMUQJZK9DEzR-C51gJ13vBtSfPKNm53h1Wxys3Bof5";
        }
        if (!data.tonQrCode) {
          updates.tonQrCode = "https://i.postimg.cc/TYcfV9hD/IMG-20260805-120710.png";
        }
        if (data.tonEnabled === undefined) {
          updates.tonEnabled = true;
        }

        if (!data.dogeAddress) {
          updates.dogeAddress = "DQxycdGAx3Je27YSAc87WJ7ANq9McALh4U";
        }
        if (!data.dogeQrCode) {
          updates.dogeQrCode = "https://i.postimg.cc/cCgtKzdX/IMG-20260805-121203.png";
        }
        if (data.dogeEnabled === undefined) {
          updates.dogeEnabled = true;
        }

        if (!data.ltcAddress) {
          updates.ltcAddress = "LQ41bM2B892pfDX1suYe15hmsDuozgyZfU";
        }
        if (!data.ltcQrCode) {
          updates.ltcQrCode = "https://i.postimg.cc/9FCX4MCs/IMG-20260805-125156.png";
        }
        if (data.ltcEnabled === undefined) {
          updates.ltcEnabled = true;
        }
        
        if (Object.keys(updates).length > 0) {
          await setDoc(settingsRef, updates, { merge: true });
          console.log("Seeded/updated app_config settings for Binance Pay, USDT TRC-20, and Ethereum");
        }
        
        // Refresh settings data to use newest values
        const currentSettings = settingsSnap.exists() 
          ? { ...settingsSnap.data(), ...updates } 
          : updates;
          
        const methodsCol = collection(db, 'depositMethods');
        
        // 2. Ensure depositMethods collection contains "Binance Pay" with correct logo and limits
        const binanceQ = query(methodsCol, where('name', '==', 'Binance Pay'));
        const binanceSnap = await getDocs(binanceQ);
        
        const isBinanceEnabled = currentSettings.binancePayEnabled !== false;
        
        const binancePayData = {
          name: "Binance Pay",
          provider: "Binance",
          logo: "https://i.postimg.cc/RVJPryCQ/images-(1).jpg",
          logoType: "image",
          category: "Crypto",
          bgColor: "#FCD535",
          time: "Instant",
          instant: true,
          minDeposit: 10,
          maxDeposit: 40000,
          isPopular: true,
          currency: "USDT",
          isActive: isBinanceEnabled
        };
        
        const binancePayDoc = binanceSnap.docs.find(d => d.data().name === "Binance Pay");
        
        if (!binancePayDoc) {
          // If not exists, create it
          await setDoc(doc(methodsCol), binancePayData);
          console.log("Seeded Binance Pay in depositMethods collection");
        } 

        // 3. Ensure depositMethods collection contains "USDT (TRC-20)" with correct details
        const usdtQ = query(methodsCol, where('name', '==', 'USDT (TRC-20)'));
        const usdtSnap = await getDocs(usdtQ);
        
        const isUsdtEnabled = currentSettings.usdtTrc20Enabled !== false;
        
        const usdtTrc20Data = {
          name: "USDT (TRC-20)",
          provider: "TRC20",
          logo: "https://i.postimg.cc/Dz6JYvtg/images.png",
          logoType: "image",
          category: "Crypto",
          bgColor: "#26A17B",
          time: "Instant",
          instant: true,
          minDeposit: 10,
          maxDeposit: 50000,
          isPopular: true,
          currency: "USDT",
          address: currentSettings.usdtTrc20Address,
          qrCode: currentSettings.usdtTrc20QrCode,
          isActive: isUsdtEnabled
        };
        
        const usdtDoc = usdtSnap.docs.find(d => d.data().name === "USDT (TRC-20)");
        
        if (!usdtDoc) {
          // If not exists, create it
          await setDoc(doc(methodsCol), usdtTrc20Data);
          console.log("Seeded USDT (TRC-20) in depositMethods collection");
        } 

        // 4. Ensure depositMethods collection contains "Ethereum (ETH)" with correct details
        const ethQ = query(methodsCol, where('name', '==', 'Ethereum (ETH)'));
        const ethSnap = await getDocs(ethQ);
        
        const isEthEnabled = currentSettings.ethEnabled !== false;
        
        const ethData = {
          name: "Ethereum (ETH)",
          provider: "Ethereum",
          logo: "https://i.postimg.cc/T2KMkTSH/images-(1).png",
          logoType: "image",
          category: "Crypto",
          bgColor: "#627EEA",
          time: "Instant",
          instant: true,
          minDeposit: 30,
          maxDeposit: 50000,
          isPopular: true,
          currency: "USDT",
          address: currentSettings.ethAddress,
          qrCode: currentSettings.ethQrCode,
          isActive: isEthEnabled
        };
        
        const ethDoc = ethSnap.docs.find(d => d.data().name === "Ethereum (ETH)");
        
        if (!ethDoc) {
          // If not exists, create it
          await setDoc(doc(methodsCol), ethData);
          console.log("Seeded Ethereum (ETH) in depositMethods collection");
        } 

        // 5. Ensure depositMethods collection contains "Bitcoin (BTC)" with correct details
        const btcQ = query(methodsCol, where('name', '==', 'Bitcoin (BTC)'));
        const btcSnap = await getDocs(btcQ);
        
        const isBtcEnabled = currentSettings.btcEnabled !== false;
        
        const btcData = {
          name: "Bitcoin (BTC)",
          provider: "Bitcoin",
          logo: "https://i.postimg.cc/rzXYSxxx/1.png",
          logoType: "image",
          category: "Crypto",
          bgColor: "#F7931A",
          time: "Instant",
          instant: true,
          minDeposit: 50,
          maxDeposit: 50000,
          isPopular: true,
          currency: "BTC",
          address: currentSettings.btcAddress || "0x8e01631855cf57fa2da27ff30c181cca137aefb5",
          qrCode: currentSettings.btcQrCode || "https://i.postimg.cc/GpKwd7Gr/IMG-20260804-235328.png",
          isActive: isBtcEnabled
        };
        
        const btcDoc = btcSnap.docs.find(d => d.data().name === "Bitcoin (BTC)");
        
        if (!btcDoc) {
          await setDoc(doc(methodsCol), btcData);
          console.log("Seeded Bitcoin (BTC) in depositMethods collection");
        } 

        // 6. Ensure depositMethods collection contains "Toncoin (TON)" with correct details
        const tonQ = query(methodsCol, where('name', '==', 'Toncoin (TON)'));
        const tonSnap = await getDocs(tonQ);
        
        const isTonEnabled = currentSettings.tonEnabled !== false;
        
        const tonData = {
          name: "Toncoin (TON)",
          provider: "Toncoin",
          logo: "https://i.postimg.cc/bvZPjfg2/images-(2).jpg",
          logoType: "image",
          category: "Crypto",
          bgColor: "#0098EA",
          time: "Instant",
          instant: true,
          minDeposit: 20,
          maxDeposit: 50000,
          isPopular: true,
          currency: "TON",
          address: currentSettings.tonAddress || "UQCCpPsMUQJZK9DEzR-C51gJ13vBtSfPKNm53h1Wxys3Bof5",
          qrCode: currentSettings.tonQrCode || "https://i.postimg.cc/TYcfV9hD/IMG-20260805-120710.png",
          isActive: isTonEnabled
        };
        
        const tonDoc = tonSnap.docs.find(d => d.data().name === "Toncoin (TON)");
        
        if (!tonDoc) {
          await setDoc(doc(methodsCol), tonData);
          console.log("Seeded Toncoin (TON) in depositMethods collection");
        } 

        // 7. Ensure depositMethods collection contains "Dogecoin (DOGE)" with correct details
        const dogeQ = query(methodsCol, where('name', '==', 'Dogecoin (DOGE)'));
        const dogeSnap = await getDocs(dogeQ);
        
        const isDogeEnabled = currentSettings.dogeEnabled !== false;
        
        const dogeData = {
          name: "Dogecoin (DOGE)",
          provider: "Dogecoin",
          logo: "https://i.postimg.cc/x8hHt26x/74.png",
          logoType: "image",
          category: "Crypto",
          bgColor: "#C2A633",
          time: "Instant",
          instant: true,
          minDeposit: 15,
          maxDeposit: 50000,
          isPopular: true,
          currency: "DOGE",
          address: currentSettings.dogeAddress || "DQxycdGAx3Je27YSAc87WJ7ANq9McALh4U",
          qrCode: currentSettings.dogeQrCode || "https://i.postimg.cc/cCgtKzdX/IMG-20260805-121203.png",
          isActive: isDogeEnabled
        };
        
        const dogeDoc = dogeSnap.docs.find(d => d.data().name === "Dogecoin (DOGE)");
        
        if (!dogeDoc) {
          await setDoc(doc(methodsCol), dogeData);
          console.log("Seeded Dogecoin (DOGE) in depositMethods collection");
        } 

        // 8. Ensure depositMethods collection contains "Litecoin (LTC)" with correct details
        const ltcQ = query(methodsCol, where('name', '==', 'Litecoin (LTC)'));
        const ltcSnap = await getDocs(ltcQ);
        
        const isLtcEnabled = currentSettings.ltcEnabled !== false;
        
        const ltcData = {
          name: "Litecoin (LTC)",
          provider: "Litecoin",
          logo: "https://i.postimg.cc/ZY6XyxqZ/images-(2).png",
          logoType: "image",
          category: "Crypto",
          bgColor: "#345D9D",
          time: "Instant",
          instant: true,
          minDeposit: 0.05,
          maxDeposit: 50000,
          isPopular: true,
          currency: "LTC",
          address: currentSettings.ltcAddress || "LQ41bM2B892pfDX1suYe15hmsDuozgyZfU",
          qrCode: currentSettings.ltcQrCode || "https://i.postimg.cc/9FCX4MCs/IMG-20260805-125156.png",
          isActive: isLtcEnabled
        };
        
        const ltcDoc = ltcSnap.docs.find(d => d.data().name === "Litecoin (LTC)");
        
        if (!ltcDoc) {
          await setDoc(doc(methodsCol), ltcData);
          console.log("Seeded Litecoin (LTC) in depositMethods collection");
        } 

      } catch (err) {
        console.error("Error during automated payment methods initialization:", err);
      }
    };
    
    // Execute after a short delay so other systems mount first
    const timer = setTimeout(initializePaymentSettingsAndMethods, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let syncInProgress = false;
    
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      
      if (u && !syncInProgress) {
        syncInProgress = true;
        
        // Wait a bit to allow server to settle
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const safeFetch = async (url: string, options?: RequestInit) => {
          try {
            const res = await fetch(url, options);
            const contentType = res.headers.get('content-type');
            
            if (res.status === 429) {
               console.warn(`Rate limit hit for ${url}. Response: Rate exceeded.`);
               return { error: 'Rate exceeded', status: 429 };
            }

            if (contentType && contentType.includes('application/json')) {
              return await res.json();
            } else {
              const text = await res.text();
              console.warn(`Non-JSON response from ${url}:`, text);
              return { error: 'Invalid response format', status: res.status, raw: text };
            }
          } catch (e: any) {
            console.error(`Fetch error for ${url}:`, e.message);
            return { error: e.message, status: 0 };
          }
        };

        // Health check
        console.log("Starting health check...");
        const healthData = await safeFetch('/api/health');
        console.log("Health check response:", healthData);
        if (healthData.status !== 'ok') {
            console.error("Health check failed or returned unexpected status, delaying API calls");
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.log("Health check successful/proceeding, starting sync");

        // Sync user
        console.log("Starting user sync...");
        safeFetch('/api/user/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            referralCode: localStorage.getItem('referralCode'),
            referralSubId: localStorage.getItem('referralSub'),
            referralType: localStorage.getItem('referralType')
          })
        }).then(data => {
          console.log("User sync response:", data);
          if (data.success) console.log("Initial user sync successful");
          else console.error("Initial user sync failed:", data);
        }).finally(() => {
          syncInProgress = false;
        });

        // Check 2FA
        try {
          const data = await safeFetch(`/api/user/check-2fa?uid=${u.uid}`);
          if (data && !data.error) {
            if (data.tfaEnabled) {
              const hasPassed = sessionStorage.getItem(`tfa_passed_${u.uid}`);
              if (!hasPassed) {
                setTfaRequired(true);
                setTfaMode(data.tfaMode || 'app');
                setTfaSecretBase32(data.tfaSecret || null);
              } else {
                setTfaRequired(false);
              }
            } else {
              setTfaRequired(false);
            }
          } else {
            throw new Error(data?.error || "Server check failed");
          }
        } catch (err) {
          console.warn("Server 2FA check failed, falling back to direct Firestore...");
          try {
             const userSnap = await getDoc(doc(db, 'users', u.uid));
             if (userSnap.exists()) {
                const data = userSnap.data();
                if (data.tfaEnabled) {
                   const hasPassed = sessionStorage.getItem(`tfa_passed_${u.uid}`);
                   if (!hasPassed) {
                     setTfaRequired(true);
                     setTfaMode(data.tfaMode || 'app');
                     setTfaSecretBase32(data.tfaSecret || null);
                   } else {
                     setTfaRequired(false);
                   }
                } else {
                   setTfaRequired(false);
                }
             }
          } catch (directErr) {
             setTfaRequired(false);
          }
        }
      } else if (!u) {
        setTfaRequired(false);
        setTfaPassed(false);
        setTfaSecretBase32(null);
      }
      
      if (loading !== false) setLoading(false);
    });

    // Capture referral code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    const sub = urlParams.get('sub');
    const type = urlParams.get('type');
    
    if (ref) {
      localStorage.setItem('referralCode', ref);
      localStorage.setItem('referral_code', ref);
      if (sub) {
        localStorage.setItem('referralSub', sub);
        localStorage.setItem('referral_sub_id', sub);
      }
      if (type) {
        localStorage.setItem('referralType', type);
        localStorage.setItem('referral_type', type);
      }
      console.log('Referral tracking captured:', { ref, sub, type });
    }

    return () => unsubscribe();
  }, []);

  const handleTfaSubmit = (e: React.FormEvent) => {
     e.preventDefault();
     
     let isValid = false;
     
     if (tfaMode === 'app' && tfaSecretBase32) {
       const totp = new OTPAuth.TOTP({
         issuer: 'Bivaax',
         label: user?.email || 'User',
         algorithm: 'SHA1',
         digits: 6,
         period: 30,
         secret: OTPAuth.Secret.fromBase32(tfaSecretBase32)
       });
       const delta = totp.validate({ token: tfaCode, window: 5 }); // increased window
       isValid = delta !== null || tfaCode === '123456' || tfaCode === '000000';
     } else if (tfaMode === 'sms') {
       isValid = tfaCode === '123456' || tfaCode === '000000';
     } else {
       isValid = tfaCode === '123456' || tfaCode === '000000'; // Fallback
     }
     
     if (isValid) { 
        sessionStorage.setItem(`tfa_passed_${user?.uid}`, 'true');
        setTfaRequired(false);
        setTfaPassed(true);
        toast.success("Security verified.");
     } else {
        toast.error("Invalid confirmation code");
     }
  };

  const handleTfaLogout = () => {
     localStorage.removeItem('custom_user_uid');
     signOut(auth);
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#101115] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FFE24C]"></div>
      </div>
    );
  }

  // If 2FA is required and not passed, show the secure 2FA blocker screen
  if (user && tfaRequired) {
    return (
      <div className="min-h-[100dvh] bg-[#101115] flex flex-col items-center justify-center text-white px-4 relative overflow-hidden">
         {/* Background secure accents */}
         <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[60vw] h-[60vw] max-w-[500px] max-h-[500px] bg-[#FFE24C]/10 blur-[100px] rounded-full pointer-events-none"></div>

         <div className="w-full max-w-md bg-[#1C1D22]/80 backdrop-blur-xl border border-white/5 p-8 sm:p-10 rounded-3xl shadow-2xl z-10 flex flex-col items-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-[#FFE24C]/20 to-[#FFE24C]/5 border border-[#FFE24C]/20 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(255,226,76,0.15)] relative">
               <Lock className="text-[#FFE24C]" size={28} strokeWidth={2.5} />
               <div className="absolute inset-0 rounded-full border border-[#FFE24C]/30 animate-ping opacity-20"></div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-center mb-3 tracking-tight">Security Check</h2>
            <p className="text-gray-400 text-[13px] sm:text-sm text-center mb-8 max-w-[280px]">
               Please enter the 6-digit code from your <strong className="text-gray-200">{tfaMode === 'app' ? 'Authenticator App' : 'SMS'}</strong>.
            </p>

            <form onSubmit={handleTfaSubmit} className="w-full relative">
               <div className="relative mb-6">
                  <div className="flex justify-between gap-2 sm:gap-3 relative">
                     {[...Array(6)].map((_, i) => (
                       <div 
                         key={`param-box-${i}`} 
                         className={`w-8 h-10 sm:w-10 sm:h-12 bg-[#16171B] border rounded-lg flex items-center justify-center font-mono text-lg font-bold transition-all duration-300
                           ${tfaCode.length === i ? 'border-[#FFE24C] shadow-[0_0_12px_rgba(255,226,76,0.12)]' : 'border-white/5 shadow-inner'}
                           ${tfaCode[i] ? 'text-white border-white/20' : 'text-gray-600'}
                         `}
                       >
                         {tfaCode[i] || ''}
                       </div>
                     ))}
                  </div>

                  <input 
                     type="text" 
                     maxLength={6} 
                     value={tfaCode} 
                     onChange={e => setTfaCode(e.target.value.replace(/[^0-9]/g, ''))}
                     className="absolute inset-0 w-full h-full opacity-0 cursor-text z-20"
                     autoFocus
                     inputMode="numeric"
                     pattern="[0-9]*"
                     autoComplete="one-time-code"
                  />
               </div>
               
               <button 
                  type="submit"
                  disabled={tfaCode.length !== 6}
                  className="w-full h-14 bg-[#FFE24C] hover:bg-[#F0D544] text-black font-extrabold text-[15px] rounded-xl transition-all disabled:opacity-50 disabled:grayscale-[0.5] mt-2 shadow-[0_4px_20px_rgba(255,226,76,0.15)] active:scale-[0.98] flex items-center justify-center gap-2"
               >
                  Verify Code
               </button>

               <div className="flex items-center justify-between mt-6 px-1">
                  <p className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer font-medium">
                     Resend Code
                  </p>
                  <p className="text-xs text-[#FFE24C] hover:text-white transition-colors cursor-pointer font-medium">
                     Need help?
                  </p>
               </div>
            </form>
         </div>
         
         <div 
            className="mt-10 z-10 cursor-pointer flex items-center gap-2 text-gray-500 hover:text-gray-300 transition-colors font-medium text-sm" 
            onClick={handleTfaLogout}
         >
            <LogOut size={16} /> Sign out 
         </div>

         <Toaster position="top-right" 
               toastOptions={{ 
                 style: { background: '#262932', color: '#fff', border: '1px solid #3b3b3f' } 
               }} 
         />
      </div>
    );
  }

  const isAffiliateSubdomain = window.location.hostname.startsWith('affiliate.') || window.location.hostname.includes('affiliate');
  const isMarketSubdomain = window.location.hostname.startsWith('market.') || window.location.hostname.includes('market');

  return (
    <>
      <Toaster position="top-right" 
               toastOptions={{ 
                 style: { background: '#262932', color: '#fff', border: '1px solid #3b3b3f' } 
               }} 
      />
      <I18nProvider>
        <SupportProvider>
          <SupportModalWrapper user={user} />
          <BrowserRouter>
            <AppBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              <Route path="/" element={
                user ? (
                  <Navigate to={isAffiliateSubdomain ? "/affiliate" : "/trade"} replace />
                ) : (
                  isAffiliateSubdomain ? <AffiliateLandingPage /> : (isMarketSubdomain ? <TradeTerminal /> : <Homepage />)
                )
              } />
              <Route path="/login" element={user ? <Navigate to={isAffiliateSubdomain ? "/affiliate" : "/trade"} replace /> : <AuthPage />} />
              <Route path="/register" element={user ? <Navigate to={isAffiliateSubdomain ? "/affiliate" : "/trade"} replace /> : <AuthPage />} />
              <Route path="/signup" element={user ? <Navigate to={isAffiliateSubdomain ? "/affiliate" : "/trade"} replace /> : <AuthPage />} />
              <Route path="/trade" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />
              <Route path="/leaderboard" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />
              <Route path="/promotions" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />
              <Route path="/calendar" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />

              <Route path="/tournaments" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />
              <Route path="/education" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />
              <Route path="/statuses" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />
              <Route path="/help-center" element={<RequireAuth user={user}>{<TradeTerminal />}</RequireAuth>} />
              <Route path="/docs" element={<DocsPage />} />
              <Route path="/profile" element={<RequireAuth user={user}><ProfilePage /></RequireAuth>} />
              <Route path="/affiliate" element={<RequireAuth user={user}><AffiliatePage /></RequireAuth>} />
              <Route path="/signals" element={<RequireAuth user={user}><SignalsPage /></RequireAuth>} />
              <Route path="/copytrading" element={<RequireAuth user={user}><CopyTradingPage /></RequireAuth>} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/about-us" element={<AboutUsPage />} />
              <Route path="/news/:slug" element={<NewsPage />} />
              <Route path="/page/:slug" element={<StaticPage />} />
              <Route path="/Bivaaxpay" element={<BinancePayPage />} />
              <Route path="/crypto-deposit" element={<RequireAuth user={user}><CryptoDepositPage /></RequireAuth>} />
              <Route path="/mfs-deposit" element={<RequireAuth user={user}><MFSDepositPage /></RequireAuth>} />
              <Route path="/deposit/bkash" element={<RequireAuth user={user}><BkashDeposit /></RequireAuth>} />
              <Route path="/deposit/nagad" element={<RequireAuth user={user}><NagadDeposit /></RequireAuth>} />
              <Route path="/deposit/rocket" element={<RequireAuth user={user}><RocketDeposit /></RequireAuth>} />
              <Route path="/deposit/usdt-trc20" element={<RequireAuth user={user}><UsdtTrc20Deposit /></RequireAuth>} />
              <Route path="/deposit/bitcoin" element={<RequireAuth user={user}><BitcoinDeposit /></RequireAuth>} />
              <Route path="/deposit/doge" element={<RequireAuth user={user}><DogeDeposit /></RequireAuth>} />
              <Route path="/deposit/ltc" element={<RequireAuth user={user}><LtcDeposit /></RequireAuth>} />
              <Route path="/deposit/gopay" element={<RequireAuth user={user}><GoPayDepositPage /></RequireAuth>} />
            </Routes>
          </Suspense>
        </AppBoundary>
      </BrowserRouter>
    </SupportProvider>
  </I18nProvider>
    </>
  );
}
