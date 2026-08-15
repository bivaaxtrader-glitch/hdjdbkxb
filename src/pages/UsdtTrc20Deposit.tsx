import React, { useState, useEffect } from 'react';
import SEO from '../components/SEO';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, updateDoc, increment } from '../firebase';
import { onAuthStateChanged } from '../firebase';
import { db, auth } from '../firebase';
import * as Icons from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';

export default function UsdtTrc20Deposit() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const amountUsd = searchParams.get('amount') || '97.80';
  const currency = searchParams.get('currency') || 'USDT (TRC-20)';
  const amountBdt = searchParams.get('amountBdt') || '12,000.00';
  
  const [appConfig, setAppConfig] = useState<any>({});
  const [timeLeft, setTimeLeft] = useState(24 * 60 * 60 - 7); // 24 hours timer as per screenshot
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);

  const [orderId] = useState(() => Math.floor(Math.random() * 100000000).toString());
  const [transactionDocId, setTransactionDocId] = useState<string | null>(null);
  const [depositDocId, setDepositDocId] = useState<string | null>(null);
  const hasAutoSubmitted = React.useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);
  
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const d = await getDoc(doc(db, 'app_config', 'settings'));
        if (d.exists()) {
          setAppConfig(d.data());
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      }
    };
    fetchConfig();
    
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
  }, []);

  const walletAddress = appConfig.usdtTrc20Address || "TCT8YFWr74eDmW rDwpG8JwpD2yVPy cebKU";

  // Automatically submit request as pending when the page is viewed
  useEffect(() => {
    if (currentUser && walletAddress && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      const autoSubmit = async () => {
        try {
          // 1. Log transaction as Pending
          const tDoc = await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
              type: 'Deposit',
              amount: Number(amountUsd.replace(',', '')),
              method: 'USDT (TRC-20)',
              currency: 'USDT',
              status: 'Pending',
              trxId: 'Pending/USDT',
              orderId: orderId,
              timestamp: Date.now(),
              category: 'Crypto'
          });
          setTransactionDocId(tDoc.id);
  
          // 2. Add to global deposits as pending
          const dDoc = await addDoc(collection(db, 'deposits'), {
              userId: currentUser.uid,
              userEmail: currentUser.email || '',
              amount: Number(amountUsd.replace(',', '')),
              currency: 'USDT',
              method: 'USDT (TRC-20)',
              walletNumber: walletAddress,
              trxId: 'Pending/USDT',
              status: 'pending',
              timestamp: Date.now(),
              orderId: orderId
          });
          setDepositDocId(dDoc.id);
          
          console.log("Auto-submitted pending deposit request:", dDoc.id);
        } catch (err) {
          console.error("Auto deposit failed:", err);
        }
      };
      autoSubmit();
    }
  }, [currentUser, walletAddress, amountUsd]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const qrCodeUrl = appConfig.usdtTrc20QrCode || "https://i.postimg.cc/ZKN9zFGL/IMG-20260804-151047.png";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleConfirmPayment = async () => {
     if (!currentUser) {
         toast.error("You must be logged in.");
         return;
     }

     setIsSubmitting(true);
     setIsSuccess(true);
     toast.success("Deposit request confirmed!");
     setTimeout(() => { navigate('/trade'); }, 5000);
     return;
     try {
         const baseOrderId = Math.floor(Math.random() * 100000000).toString();
         
         // 1. Log transaction as Pending
         await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
             type: 'Deposit',
             amount: Number(amountUsd.replace(',', '')),
             method: 'USDT (TRC-20)',
             currency: 'USDT',
             status: 'Pending',
             trxId: 'Pending/USDT',
             orderId: baseOrderId,
             timestamp: Date.now(),
             category: 'Crypto'
         });
 
         // 2. Add to global deposits as pending
         await addDoc(collection(db, 'deposits'), {
             userId: currentUser.uid,
             userEmail: currentUser.email || '',
             amount: Number(amountUsd.replace(',', '')),
             currency: 'USDT',
             method: 'USDT (TRC-20)',
             walletNumber: walletAddress,
             trxId: 'Pending/USDT',
             status: 'pending',
             timestamp: Date.now(),
             orderId: baseOrderId
         });
 
         setIsSuccess(true);
         toast.success("Deposit request submitted!");
         setTimeout(() => {
             navigate('/trade');
         }, 5000);
     } catch(err) {
         console.error(err);
         toast.error("Failed to submit request.");
         setIsSubmitting(false);
     }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  return (
    <div className="min-h-screen bg-[#1a1f2e] text-[#E1E6F0] font-sans flex flex-col items-center">
      <SEO title="Deposit USDT TRC-20" description="Secure USDT TRC-20 payment gateway." />

      <div className="w-full max-w-[480px] min-h-screen flex flex-col pb-10">
        
        {/* Top Bar - Matches screenshot precisely */}
        <header className="flex items-center justify-between px-4 py-6 border-b border-white/5">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
            <Icons.ChevronLeft size={28} />
          </button>
          <h1 className="text-white font-black text-xl tracking-tight">
            Deposit ${amountUsd} via {currency}
          </h1>
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
            <Icons.X size={28} />
          </button>
        </header>

        {/* Dash/Divider line */}
        <div className="w-full h-[1px] bg-gray-500/20 border-dashed border-t-[1px] my-4 mx-4"></div>

        {/* Main Content Area */}
        <main className="flex-1">
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mx-4 mt-6 bg-[#232936] rounded-2xl p-8 border border-white/5 flex flex-col items-center text-center shadow-xl"
              >
                 <div className="w-20 h-20 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mb-6">
                   <Icons.CheckCircle size={48} className="text-green-500 animate-bounce" />
                 </div>
                 <h2 className="text-2xl font-black text-white mb-4">Deposit Request Submitted!</h2>
                 <p className="text-gray-400 text-sm leading-relaxed mb-8">
                   Your USDT (TRC-20) deposit request has been submitted. It will be reviewed by our admin and credited to your balance shortly.
                 </p>
                 
                 <div className="w-full bg-white/5 rounded-2xl p-5 flex flex-col gap-3 mb-8">
                    <div className="flex justify-between text-[11px] font-black uppercase tracking-wider">
                       <span className="text-gray-400">Total Amount</span>
                       <span className="text-[#fbbf24]">${amountUsd} USDT</span>
                    </div>
                 </div>

                 <button 
                   onClick={() => navigate(-1)}
                   className="w-full py-4 bg-[#3b82f6] hover:bg-[#2563eb] text-white rounded-xl font-black text-xs uppercase tracking-widest transition-all"
                 >
                   Return to Terminal
                 </button>
              </motion.div>
            ) : (
              <motion.div 
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col"
              >
                {/* Warning & Info Boxes */}
                <div className="px-4 flex flex-col gap-2 mt-2">
                  {/* Warning 1 */}
                  <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/20 p-4 rounded-md flex gap-4 items-start">
                     <Icons.AlertTriangle size={20} className="text-[#fbbf24] shrink-0 mt-0.5" />
                     <p className="text-[13px] font-bold text-gray-300 leading-tight">
                       Only TRC20 USDT. Do not send TRX, smart contracts or other coins — they will be lost.
                     </p>
                  </div>

                  {/* Warning 2 */}
                  <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/20 p-4 rounded-md flex gap-4 items-start">
                     <Icons.AlertTriangle size={20} className="text-[#fbbf24] shrink-0 mt-0.5" />
                     <p className="text-[13px] font-bold text-gray-300 leading-tight">
                       A new address is generated for each transaction. Do not reuse.
                     </p>
                  </div>

                  {/* Info 1 */}
                  <div className="bg-[#3b82f6]/10 border border-[#3b82f6]/20 p-4 rounded-md flex gap-4 items-center">
                     <div className="w-6 h-6 bg-[#3b82f6] rounded flex items-center justify-center shrink-0">
                       <Icons.DollarSign size={14} className="text-white" />
                     </div>
                     <p className="text-[13px] font-bold text-gray-300 leading-tight">
                       Make sure your payment covers network fees.
                     </p>
                  </div>
                </div>

                {/* Main Payment Card */}
                <div className="mx-4 mt-6 bg-[#232936] rounded-2xl p-6 border border-white/5 flex flex-col items-center">
                   <div className="flex w-full gap-6 items-center">
                      {/* QR Code */}
                      <div className="w-32 h-32 bg-white rounded-lg p-1.5 shrink-0 overflow-hidden shadow-xl">
                         <img src={qrCodeUrl} alt="TRC20 QR Code" className="w-full h-full object-contain" />
                      </div>

                      {/* Transfer Text */}
                      <div className="flex flex-col gap-1.5 flex-1">
                         <p className="text-[13px] font-bold text-gray-400">
                            To complete the payment transfer <span className="text-white font-black">{amountUsd} USD</span> to address
                         </p>
                         <p className="text-[15px] font-black text-white break-all leading-tight">
                            {walletAddress}
                         </p>
                      </div>
                   </div>

                   {/* Copy Buttons */}
                   <div className="grid grid-cols-2 gap-3 w-full mt-8">
                      <button 
                        onClick={() => copyToClipboard(amountUsd, 'Amount')}
                        className="bg-[#1d4ed8] hover:bg-[#1e40af] py-3.5 rounded-lg flex items-center justify-center gap-2 font-black text-sm transition-all active:scale-95"
                      >
                        <Icons.Link size={14} />
                        Copy amount
                      </button>
                      <button 
                        onClick={() => copyToClipboard(walletAddress, 'Address')}
                        className="bg-[#1d4ed8] hover:bg-[#1e40af] py-3.5 rounded-lg flex items-center justify-center gap-2 font-black text-sm transition-all active:scale-95"
                      >
                        <Icons.Link size={14} />
                        Copy Address
                      </button>
                   </div>
                </div>

                {/* Bottom Status */}
                <div className="mx-4 mt-4 bg-[#232936] rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center gap-4">
                   <div className="flex items-center gap-3 text-[#3b82f6] font-bold text-lg">
                      <Icons.Clock size={24} />
                      <span>Time remaining: {formatTime(timeLeft)}</span>
                   </div>

                   <div className="flex items-center gap-3 text-[#3b82f6] font-bold text-lg">
                      <div className="w-6 h-6 border-2 border-[#3b82f6]/30 border-t-[#3b82f6] rounded-full animate-spin"></div>
                      <span>Waiting for Payment...</span>
                   </div>
                </div>

                {/* Confirm Payment Button */}
                <div className="px-4 mt-8">
                  <button 
                    onClick={handleConfirmPayment}
                    disabled={isSubmitting}
                    className="w-full h-16 bg-[#3b82f6] hover:bg-[#2563eb] active:scale-[0.98] transition-all text-white font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 disabled:opacity-50 shadow-xl"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span className="animate-pulse">Submitting Request...</span>
                      </>
                    ) : (
                      <>
                        <Icons.CheckCircle size={20} />
                        <span>Confirm Payment</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

      </div>
    </div>
  );
}
