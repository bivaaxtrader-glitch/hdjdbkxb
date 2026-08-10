import React, { useState, useEffect } from 'react';
import SEO from '../components/SEO';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc } from '../firebase';
import { onAuthStateChanged } from '../firebase';
import { db, auth } from '../firebase';
import * as Icons from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';

export default function TonDeposit() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const amountCrypto = searchParams.get('amount') || '20';
  const currency = searchParams.get('currency') || 'Toncoin (TON)';
  const amountBdt = searchParams.get('amountBdt') || '2,400.00';
  
  const [appConfig, setAppConfig] = useState<any>({});
  const [timeLeft, setTimeLeft] = useState(24 * 60 * 60); 
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

  const tonWalletAddress = appConfig.tonAddress || "UQCCpPsMUQJZK9DEzR-C51gJ13vBtSfPKNm53h1Wxys3Bof5";

  useEffect(() => {
    if (currentUser && tonWalletAddress && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      const autoSubmit = async () => {
        try {
          const tDoc = await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
              type: 'Deposit',
              amount: Number(amountCrypto.replace(',', '')),
              method: 'Toncoin (TON)',
              currency: 'TON',
              status: 'Pending',
              trxId: 'Pending/TON',
              orderId: orderId,
              timestamp: Date.now(),
              category: 'Crypto'
          });
          setTransactionDocId(tDoc.id);
  
          const dDoc = await addDoc(collection(db, 'deposits'), {
              userId: currentUser.uid,
              userEmail: currentUser.email || '',
              amount: Number(amountCrypto.replace(',', '')),
              currency: 'TON',
              method: 'Toncoin (TON)',
              walletNumber: tonWalletAddress,
              trxId: 'Pending/TON',
              status: 'pending',
              timestamp: Date.now(),
              orderId: orderId
          });
          setDepositDocId(dDoc.id);
          
          console.log("Auto-submitted pending TON deposit request:", dDoc.id);
        } catch (err) {
          console.error("Auto TON deposit failed:", err);
        }
      };
      autoSubmit();
    }
  }, [currentUser, tonWalletAddress, amountCrypto]);
  
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

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const walletAddress = appConfig.tonAddress || "UQCCpPsMUQJZK9DEzR-C51gJ13vBtSfPKNm53h1Wxys3Bof5";
  const qrCodeUrl = appConfig.tonQrCode || "https://i.postimg.cc/TYcfV9hD/IMG-20260805-120710.png";

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [trxId, setTrxId] = useState('');

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
         
         await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
             type: 'Deposit',
             amount: Number(amountCrypto.replace(',', '')),
             method: 'Toncoin (TON)',
             currency: 'TON',
             status: 'Pending',
             trxId: trxId ? trxId : 'Pending/TON',
             orderId: baseOrderId,
             timestamp: Date.now(),
             category: 'Crypto'
         });
 
         await addDoc(collection(db, 'deposits'), {
             userId: currentUser.uid,
             userEmail: currentUser.email || '',
             amount: Number(amountCrypto.replace(',', '')),
             currency: 'TON',
             method: 'Toncoin (TON)',
             walletNumber: walletAddress,
             trxId: trxId ? trxId : 'Pending/TON',
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
      <SEO title="Deposit Toncoin (TON)" description="Secure Toncoin payment gateway." />

      <div className="w-full max-w-[480px] min-h-screen flex flex-col pb-10">
        
        <header className="flex items-center justify-between px-4 py-6 border-b border-white/5">
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
            <Icons.ChevronLeft size={28} />
          </button>
          <h1 className="text-white font-black text-xl tracking-tight">
            Deposit {amountCrypto} TON
          </h1>
          <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
            <Icons.X size={28} />
          </button>
        </header>

        <div className="w-full h-[1px] bg-gray-500/20 border-dashed border-t-[1px] my-4 mx-4"></div>

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
                 <h2 className="text-2xl font-black text-white mb-2">Deposit Submitted Successfully!</h2>
                 <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                   Your Toncoin (TON) deposit of <strong className="text-white">{amountCrypto} TON</strong> has been submitted. Our automated system or admin will verify and credit your balance within a few minutes.
                 </p>
                 <button 
                   onClick={() => navigate(-1)}
                   className="w-full py-4 bg-[#FFE24C] hover:bg-[#ffea6c] text-black font-black rounded-xl transition-all shadow-lg"
                 >
                   Return to Trading
                 </button>
              </motion.div>
            ) : (
              <motion.div 
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-4 space-y-6"
              >
                <div className="bg-[#232936] rounded-3xl p-6 border border-white/5 shadow-2xl relative overflow-hidden">
                   <div className="absolute top-0 right-0 bg-[#0098EA]/10 text-[#0098EA] font-extrabold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-bl-2xl border-l border-b border-[#0098EA]/20">
                     TON Network
                   </div>

                   <div className="flex items-center gap-3 mb-6">
                     <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center p-2">
                       <img src="https://i.postimg.cc/bvZPjfg2/images-(2).jpg" alt="TON" className="w-full h-full object-cover rounded-xl" />
                     </div>
                     <div>
                       <h3 className="font-black text-lg text-white">Toncoin Deposit</h3>
                       <p className="text-xs text-gray-400">Min deposit: <span className="text-[#FFE24C] font-bold">20 TON</span></p>
                     </div>
                   </div>

                   <div className="bg-[#1a1f2e] border border-white/5 rounded-2xl p-4 flex flex-col items-center mb-6">
                     <div className="w-44 h-44 bg-white p-3 rounded-xl shadow-inner mb-4 flex items-center justify-center">
                       <img src={qrCodeUrl} alt="TON QR" className="w-full h-full object-contain" />
                     </div>
                     <span className="text-xs text-gray-400 mb-1">Scan QR code to pay</span>
                     <div className="flex items-center gap-2 text-xs font-mono text-[#0098EA] bg-[#0098EA]/10 px-3 py-1 rounded-full">
                       <span>Time remaining: {formatTime(timeLeft)}</span>
                     </div>
                   </div>

                   <div className="space-y-2 mb-6">
                     <label className="text-[11px] font-black uppercase text-gray-400 tracking-wider">Toncoin Wallet Address</label>
                     <div className="flex items-center gap-2 bg-[#1a1f2e] border border-white/10 rounded-xl p-3">
                       <input 
                         type="text" 
                         readOnly 
                         value={walletAddress} 
                         className="bg-transparent text-xs text-white font-mono w-full outline-none select-all" 
                       />
                       <button 
                         onClick={() => copyToClipboard(walletAddress, "Wallet Address")}
                         className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-[#FFE24C] transition-colors shrink-0"
                       >
                         <Icons.Copy size={16} />
                       </button>
                     </div>
                   </div>

                   <div className="space-y-2 mb-6">
                     <label className="text-[11px] font-black uppercase text-gray-400 tracking-wider">Transaction Hash / TxID (Optional)</label>
                     <input 
                       type="text" 
                       placeholder="Enter TxID or transaction hash..."
                       value={trxId}
                       onChange={(e) => setTrxId(e.target.value)}
                       className="w-full bg-[#1a1f2e] border border-white/10 rounded-xl p-3 text-xs text-white font-mono outline-none focus:border-[#0098EA]"
                     />
                   </div>

                   <button 
                     onClick={handleConfirmPayment}
                     disabled={isSubmitting}
                     className="w-full py-4 bg-[#FFE24C] hover:bg-[#ffea6c] text-black font-black rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2 uppercase tracking-wider text-sm disabled:opacity-50"
                   >
                     {isSubmitting ? (
                       <>
                         <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                         <span>Submitting...</span>
                       </>
                     ) : (
                       <span>I've Paid / Confirm Deposit</span>
                     )}
                   </button>
                </div>

                <div className="bg-[#232936] rounded-2xl p-5 border border-white/5 text-xs text-gray-400 space-y-2">
                   <p className="font-bold text-white flex items-center gap-1.5">
                     <Icons.AlertCircle size={14} className="text-yellow-500" /> Important Instructions:
                   </p>
                   <ul className="list-disc pl-4 space-y-1">
                     <li>Send only Toncoin (TON) to the address above.</li>
                     <li>Minimum deposit amount is <strong className="text-white">20 TON</strong>.</li>
                     <li>Transactions are usually credited after 1-3 network confirmations.</li>
                   </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
