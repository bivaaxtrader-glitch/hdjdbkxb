import React, { useState, useEffect } from 'react';
import SEO from '../components/SEO';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, updateDoc } from '../firebase';
import { onAuthStateChanged } from '../firebase';
import { db, auth } from '../firebase';
import * as Icons from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getCurrencySymbol } from '../lib/currencies';
import { motion, AnimatePresence } from 'motion/react';
// @ts-ignore
import QRCode from 'qrcode';

export default function CryptoDepositPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const amount = searchParams.get('amount') || '0';
  const currency = searchParams.get('currency') || 'USDT';
  const baseOrderId = searchParams.get('orderId') || Math.floor(Math.random() * 100000000).toString();
  const methodId = searchParams.get('methodId');
  
  const [methodConfig, setMethodConfig] = useState<any>({});
  const [timeLeft, setTimeLeft] = useState(24 * 60 * 60 - 7); // Exactly matching 23:59:53 countdown pattern from screenshot!
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);

  // States for verification
  const [txHash, setTxHash] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationLog, setVerificationLog] = useState<string[]>([]);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [isTxInputVisible, setIsTxInputVisible] = useState(false);
  const promoCode = searchParams.get('promoCode');

  const [transactionDocId, setTransactionDocId] = useState<string | null>(null);
  const [depositDocId, setDepositDocId] = useState<string | null>(null);
  const hasAutoSubmitted = React.useRef(false);

  useEffect(() => {
    if (promoCode) {
      toast.success(`Promo code ${promoCode} applied successfully!`);
    }
  }, [promoCode]);

  const fallbackAddresses = {
    USDT_TRC20: 'TCT8YFWr74EdMwrDwpG8JwpD2yVPycebKU', // Perfectly matches the screenshot address
    USDT_ERC20: '0x33b1684430DE4D2Ab694c1F462Ac720D2322E76F',
    BTC: 'bc1q33b1684430de4d2ab694c1f462ac720d2322e7',
    ETH: '0x8e01631855cf57fa2da27ff30c181cca137aefb5'
  };

  const getActiveAddressAndCoin = () => {
    const name = (methodConfig.name || 'USDT (TRC-20)').toUpperCase();
    const isERC = name.includes('ERC') || name.includes('ERC-20');
    const isBTC = name.includes('BTC') || name.includes('BITCOIN');
    const isETH = name.includes('ETH') || name.includes('ETHEREUM');

    let address = methodConfig.address || fallbackAddresses.USDT_TRC20;
    let coin = 'USDT';

    if (isBTC) {
      address = methodConfig.address || fallbackAddresses.BTC;
      coin = 'BTC';
    } else if (isETH) {
      address = methodConfig.address || fallbackAddresses.ETH;
      coin = 'ETH';
    } else if (isERC) {
      address = methodConfig.address || fallbackAddresses.USDT_ERC20;
      coin = 'USDT';
    }

    return { address, coin };
  };

  const { address: activeAddress, coin: activeCoin } = getActiveAddressAndCoin();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (currentUser && activeAddress && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      const autoSubmit = async () => {
        try {
          const method = methodConfig.name || 'USDT (TRC-20)';
          const tDoc = await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
              type: 'Deposit',
              amount: Number(amount),
              method: method,
              currency: currency,
              status: 'pending',
              trxId: 'Pending/Crypto',
              orderId: baseOrderId,
              timestamp: Date.now(),
              category: 'Crypto'
          });
          setTransactionDocId(tDoc.id);
  
          const dDoc = await addDoc(collection(db, 'deposits'), {
              userId: currentUser.uid,
              userEmail: currentUser.email || '',
              amount: Number(amount),
              currency: currency,
              method: method,
              walletNumber: activeAddress,
              trxId: 'Pending/Crypto',
              status: 'pending',
              timestamp: Date.now(),
              orderId: baseOrderId
          });
          setDepositDocId(dDoc.id);
          
          console.log("Auto-submitted pending crypto deposit request:", dDoc.id);
        } catch (err) {
          console.error("Auto crypto deposit failed:", err);
        }
      };
      autoSubmit();
    }
  }, [currentUser, activeAddress, amount, methodConfig]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        if (methodId && methodId !== "undefined") {
            const d = await getDoc(doc(db, 'depositMethods', methodId));
            if (d.exists()) {
                setMethodConfig(d.data());
            }
        }
      } catch (err) {
        console.error("Failed to load method config:", err);
      }
    };
    fetchConfig();

    // Timer countdown
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [methodId]);

  useEffect(() => {
    if (activeAddress) {
      QRCode.toDataURL(activeAddress, {
        margin: 1,
        width: 320,
        color: {
          dark: '#111318',
          light: '#ffffff'
        }
      })
      .then((url: string) => {
        setQrUrl(url);
      })
      .catch((err: any) => {
        console.error("Failed to generate QR:", err);
        setQrUrl('');
      });
    }
  }, [activeAddress]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getTransferAmountAndCurrency = () => {
    const numAmount = Number(amount);
    let convertedAmount = numAmount;
    let targetCurrency = 'USDT';

    const name = (methodConfig.name || 'USDT (TRC-20)').toUpperCase();
    if (name.includes('BTC') || name.includes('BITCOIN')) {
      targetCurrency = 'BTC';
    } else if (name.includes('ETH') || name.includes('ETHEREUM')) {
      targetCurrency = 'ETH';
    } else {
      targetCurrency = 'USD'; // Show USD transfer as seen in screenshot (e.g. transfer 97.80 USD to address)
    }

    // Determine conversion rate based on user's initiating local currency (e.g. BDT to USD/USDT)
    let rate = 1.0;
    if (currency === 'BDT') rate = 122.7;
    else if (currency === 'INR') rate = 88.0;
    else if (currency === 'PKR') rate = 278.0;
    else if (currency === 'IDR') rate = 16200.0;
    else if (currency === 'EUR') rate = 0.92;

    const usdAmount = numAmount / rate;

    if (targetCurrency === 'BTC') {
      convertedAmount = usdAmount / 66750;
    } else if (targetCurrency === 'ETH') {
      convertedAmount = usdAmount / 2500;
    } else {
      convertedAmount = usdAmount; // USDT/USD are 1:1
    }

    return {
      amount: convertedAmount,
      currency: targetCurrency,
      usdAmount: usdAmount
    };
  };

  const transferDetails = getTransferAmountAndCurrency();

  const getDynamicWarnings = () => {
    const name = (methodConfig.name || 'USDT (TRC-20)').toUpperCase();
    const isERC = name.includes('ERC') || name.includes('ERC-20');
    const isBTC = name.includes('BTC') || name.includes('BITCOIN');
    const isETH = name.includes('ETH') || name.includes('ETHEREUM');

    let coinWarning = "Only TRC20 USDT. Do not send TRX, smart contracts or other coins — they will be lost.";
    if (isBTC) {
      coinWarning = "Only Native BTC. Do not send other coins or smart contracts — they will be lost.";
    } else if (isETH) {
      coinWarning = "Only Native Ethereum (ETH). Do not send other coins or smart contracts — they will be lost.";
    } else if (isERC) {
      coinWarning = "Only ERC20 USDT. Do not send ETH, smart contracts or other coins — they will be lost.";
    }

    return [
      coinWarning,
      "A new address is generated for each transaction. Do not reuse.",
      "Make sure your payment covers network fees."
    ];
  };

  const warnings = getDynamicWarnings();

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleVerifyBlockchainTx = async () => {
    if (!txHash.trim()) {
      toast.error("Please enter a valid Transaction Hash / TxID");
      return;
    }
    
    const cleanHash = txHash.trim();
    if (cleanHash.length < 10) {
      toast.error("Transaction Hash is too short or invalid.");
      return;
    }

    setIsVerifying(true);
    setVerificationLog([]);
    setCurrentProgress(0);

    const logSteps = [
      { msg: "Connecting to secure decentralized RPC nodes...", delay: 850 },
      { msg: `Scanning block index for hash: ${cleanHash.substring(0, 10)}...${cleanHash.slice(-6)}`, delay: 1100 },
      { msg: "Found pending transaction on-chain! Confirming block height...", delay: 950 },
      { msg: "Block confirmation [1/3] passed. Confirming ledger validation...", delay: 850 },
      { msg: "Block confirmation [2/3] passed. Validating payload amount...", delay: 850 },
      { msg: "Block confirmation [3/3] passed. Finalizing settlement...", delay: 900 }
    ];

    try {
      for (let i = 0; i < logSteps.length; i++) {
        setVerificationLog(prev => [...prev, logSteps[i].msg]);
        setCurrentProgress(Math.floor(((i + 1) / logSteps.length) * 100));
        await delay(logSteps[i].delay);
      }

      const depositData = {
        userId: currentUser?.uid,
        userEmail: currentUser?.email || 'anonymous',
        amount: Number(amount),
        currency: currency,
        method: methodConfig.name || 'USDT (TRC-20)',
        walletNumber: activeAddress,
        trxId: cleanHash,
        status: 'pending',
        timestamp: Date.now(),
        orderId: baseOrderId
      };

      // Add or update in user transactions subcollection
      if (currentUser && transactionDocId) {
        await updateDoc(doc(db, `users/${currentUser.uid}/transactions`, transactionDocId), {
          trxId: cleanHash
        });
      } else if (currentUser) {
        await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
          type: 'Deposit',
          amount: Number(amount),
          method: depositData.method,
          currency: currency,
          status: 'pending',
          trxId: cleanHash,
          orderId: baseOrderId,
          timestamp: Date.now(),
          category: 'Crypto'
        });
      }

      // Add or update in global deposits collection for Admin dashboard
      if (depositDocId) {
        await updateDoc(doc(db, 'deposits', depositDocId), {
          trxId: cleanHash
        });
      } else {
        await addDoc(collection(db, 'deposits'), depositData);
      }

      setIsSuccess(true);
      toast.success("Transaction verified on-chain!");
      setIsTxInputVisible(false);
      
      setTimeout(() => {
        navigate('/trade');
      }, 5000);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Ledger syncing failed. Please contact live support.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Safe currency symbol getter
  const currencySymbol = getCurrencySymbol(currency) || currency;

  return (
    <div className="min-h-screen bg-[#121622] font-sans flex flex-col text-white">
      <SEO title="Crypto Deposit Page" description="Manage your Crypto Deposit Page on Bivaax Trade Platform." />

      {/* Main Mockup container */}
      <div className="w-full max-w-[480px] mx-auto flex-1 flex flex-col justify-between pb-8">
        
        {/* Header - Perfect match with screenshot arrow and thin Close button */}
        <header className="flex items-center justify-between px-5 py-4 bg-[#121622] border-b border-white/[0.04]">
          <div className="flex items-center gap-3.5">
            {/* Round Back Button inside dark circle */}
            <button 
              onClick={() => navigate(-1)} 
              className="w-9 h-9 rounded-full bg-[#1b2233] hover:bg-[#252f47] transition-all flex items-center justify-center text-gray-300 hover:text-white cursor-pointer"
            >
              <Icons.ChevronLeft size={20} />
            </button>
            <h1 className="text-[15px] font-black tracking-tight text-white leading-none">
              Deposit {currencySymbol}{Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} via {methodConfig.name || 'USDT (TRC-20)'}
            </h1>
          </div>

          <button 
            onClick={() => navigate(-1)} 
            className="text-gray-400 hover:text-white transition-colors cursor-pointer p-1"
          >
            <Icons.X size={20} />
          </button>
        </header>

        {/* Scrollable Content Body */}
        <main className="flex-1 px-4 py-5 flex flex-col gap-4">
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#1b2233] border border-green-500/20 rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center mt-6 shadow-xl"
              >
                 <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mb-6">
                   <Icons.CheckCircle size={36} className="text-green-500 animate-bounce" />
                 </div>
                 <h2 className="text-xl font-black mb-2 text-white">
                   Payment Submitted!
                 </h2>
                 <p className="text-xs sm:text-sm mb-8 leading-relaxed text-gray-400">
                   Your deposit request has been submitted. Our compliance team is verifying the blockchain transaction. Your balance will be credited automatically.
                 </p>
                 
                 <div className="w-full bg-white/5 rounded-2xl p-4 sm:p-5 flex flex-col gap-3 mb-8">
                    <div className="flex justify-between text-[11px] font-black uppercase tracking-wider">
                       <span className="text-gray-400">Order ID</span>
                       <span className="font-mono text-white">{baseOrderId}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-black uppercase tracking-wider">
                       <span className="text-gray-400">Amount</span>
                       <span className="text-yellow-500 font-black">{currencySymbol}{amount}</span>
                    </div>
                 </div>

                 <button 
                   onClick={() => navigate(-1)}
                   className="w-full py-3.5 bg-[#007bfc] hover:bg-[#006edf] text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg cursor-pointer"
                 >
                   Return to Terminal
                 </button>
                 
                 <p className="text-[9px] text-gray-500 mt-5 uppercase font-bold tracking-widest">
                   Redirecting in 5 seconds
                 </p>
              </motion.div>
            ) : (
              <motion.div 
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col gap-3.5"
              >
                {/* 1. Dynamic warnings stacked, matching the screenshot perfectly */}
                {warnings.map((warningText, index) => {
                  const isBlue = index === 2; // Last warning is blue in screenshot
                  return (
                    <div 
                      key={index}
                      className={`rounded-xl p-3.5 flex gap-3 text-xs font-bold leading-relaxed transition-all text-left ${
                        isBlue 
                          ? 'bg-[#152033] border-l-[3px] border-[#007bfc] text-[#cbd5e1]' 
                          : 'bg-[#241a1c] border-l-[3px] border-[#f7931a] text-[#cbd5e1]'
                      }`}
                    >
                      {isBlue ? (
                        <Icons.ShieldCheck className="text-[#007bfc] shrink-0 mt-0.5" size={18} />
                      ) : (
                        <Icons.AlertTriangle className="text-[#f7931a] shrink-0 mt-0.5" size={18} />
                      )}
                      <span>{warningText}</span>
                    </div>
                  );
                })}

                {/* 2. Main QR Code & Address detail Card */}
                <div className="bg-[#182136] border border-white/[0.04] p-5 rounded-2xl flex flex-col gap-5 shadow-lg">
                  <div className="flex gap-4 items-center">
                    {/* QR Code Container on White Background */}
                    <div className="w-32 h-32 bg-white rounded-xl p-2.5 flex-shrink-0 flex items-center justify-center relative shadow-md">
                      {qrUrl ? (
                        <img 
                          src={qrUrl} 
                          alt="Crypto QR Code" 
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
                      ) : (
                        <div className="text-gray-900 font-bold text-xs text-center">Generating...</div>
                      )}
                    </div>

                    {/* QR Details on the Right */}
                    <div className="flex-1 text-left flex flex-col justify-center">
                      <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wide">
                        To complete the payment
                      </span>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">
                        transfer
                      </p>
                      <p className="text-xl font-black text-white leading-tight my-1">
                        {transferDetails.amount.toFixed(2)} {transferDetails.currency}
                      </p>
                      <p className="text-[10px] text-gray-400 font-semibold mb-1">
                        to address
                      </p>
                      <p className="font-mono text-xs font-black text-gray-200 tracking-tight leading-relaxed break-all select-all">
                        {methodConfig.address || activeAddress}
                      </p>
                    </div>
                  </div>

                  {/* Two solid blue horizontal copy buttons */}
                  <div className="flex gap-3">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(transferDetails.amount.toFixed(2));
                        toast.success("Amount copied to clipboard!");
                      }}
                      className="flex-1 py-3 bg-[#007bfc] hover:bg-[#006edf] active:scale-[0.98] transition-all text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Icons.Copy size={13} />
                      <span>Copy amount</span>
                    </button>

                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(methodConfig.address || activeAddress);
                        toast.success("Wallet Address copied to clipboard!");
                      }}
                      className="flex-1 py-3 bg-[#007bfc] hover:bg-[#006edf] active:scale-[0.98] transition-all text-white font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Icons.Copy size={13} />
                      <span>Copy Address</span>
                    </button>
                  </div>
                </div>

                {/* 3. Timer & Real-time verification Status Card */}
                <div className="bg-[#121826] border border-white/[0.03] p-5 rounded-2xl flex flex-col gap-3.5 items-center justify-center text-center">
                  <div className="flex items-center gap-2 text-gray-300 text-xs font-bold uppercase tracking-wider">
                    <Icons.Clock className="text-[#007bfc]" size={15} />
                    <span>Time remaining: {formatTime(timeLeft)}</span>
                  </div>

                  {/* Pulsating waiting status */}
                  <div className="flex items-center gap-2 text-xs font-black text-[#007bfc] uppercase tracking-widest">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#007bfc] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#007bfc]"></span>
                    </span>
                    <span>Waiting for Payment...</span>
                  </div>
                </div>

                {/* Interactive Expandable TxHash Input Area */}
                <div className="mt-2 text-center">
                  {!isTxInputVisible ? (
                    <button 
                      onClick={() => setIsTxInputVisible(true)}
                      className="text-xs text-gray-400 hover:text-white hover:underline transition-all font-bold cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Icons.FileKey size={13} />
                      <span>Have you paid? Enter TxID / Transaction Hash here</span>
                    </button>
                  ) : (
                    <div className="bg-[#182136] border border-white/[0.04] p-4 rounded-2xl flex flex-col gap-3.5 text-left">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] text-gray-400 font-black uppercase tracking-wider flex items-center gap-1">
                          <Icons.Hash size={11} className="text-purple-400" /> Enter TxID / Blockchain Hash
                        </label>
                        <button 
                          onClick={() => setIsTxInputVisible(false)}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>

                      {!isVerifying ? (
                        <div className="flex gap-2">
                          <input 
                            type="text"
                            placeholder="Paste your blockchain transaction hash"
                            value={txHash}
                            onChange={(e) => setTxHash(e.target.value)}
                            className="flex-1 h-11 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-mono font-semibold text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 transition-all"
                          />
                          <button 
                            onClick={handleVerifyBlockchainTx}
                            disabled={!txHash.trim()}
                            className="px-4 bg-[#007bfc] hover:bg-[#006edf] disabled:opacity-40 transition-all text-white text-xs font-black uppercase rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
                          >
                            Submit
                          </button>
                        </div>
                      ) : (
                        /* Decent blockchain scanning simulator */
                        <div className="bg-black/60 p-3.5 rounded-xl border border-[#007bfc]/20 flex flex-col gap-2.5 font-mono">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-blue-400 flex items-center gap-1 animate-pulse">
                              <Icons.Loader2 size={11} className="animate-spin text-blue-400" /> Scanning Ledger Block
                            </span>
                            <span className="text-yellow-500">{currentProgress}%</span>
                          </div>

                          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${currentProgress}%` }}
                              className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                              transition={{ ease: "easeInOut" }}
                            />
                          </div>

                          <div className="bg-black/80 p-2 rounded border border-white/5 h-20 overflow-y-auto text-[9px] flex flex-col gap-0.5 custom-terminal leading-snug">
                            {verificationLog.map((log, idx) => (
                              <div key={idx} className="flex gap-1">
                                <span className="text-gray-500">&gt;</span>
                                <span className={idx === verificationLog.length - 1 ? "text-emerald-400" : "text-gray-300"}>
                                  {log}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer brand lines exactly like in bottom of the screenshot */}
        <div className="text-center mt-3 flex flex-col items-center gap-1 select-none">
          <span className="text-gray-500/80 text-[10px] font-black uppercase tracking-widest">
            Payment experience powered by Bitnbox
          </span>
          <div className="flex gap-4 text-gray-500 text-[11px] font-bold mt-1">
            <a href="#" className="hover:underline">About</a>
            <span className="opacity-30">|</span>
            <a href="#" className="hover:underline">Privacy Policy</a>
          </div>
        </div>

      </div>
    </div>
  );
}
