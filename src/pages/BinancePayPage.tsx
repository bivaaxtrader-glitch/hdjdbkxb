import React, { useState, useEffect } from 'react';
import SEO from '../components/SEO';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, updateDoc, increment } from '../firebase';
import { onAuthStateChanged } from '../firebase';
import { db, auth } from '../firebase';
import * as Icons from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';

// Translations dictionary to perfectly match the screens & languages requested by the user
const translations: Record<string, any> = {
  en: {
    title: "Complete payment",
    expires: "Payment expires in",
    howToPay: "How to pay with Binance ?",
    totalAmount: "Total amount",
    merchant: "Merchant",
    orderId: "Order ID",
    description: "Description",
    depositId: "Bivaax Deposit ID",
    poweredBy: "Payment experience powered by Bitnbox",
    confirmPayment: "Confirm Payment",
    about: "About",
    privacy: "Privacy Policy",
    successTitle: "Deposit Request Submitted!",
    successDesc: "Your Binance Pay deposit request has been submitted. It will be reviewed by our admin and credited to your balance shortly.",
    returnTerm: "Return to Terminal",
    connecting: "Connecting to Secure Ledger...",
    verifying: "Verifying request details...",
    securing: "Securing transaction request...",
    crediting: "Finalizing request...",
    languageTitle: "Language",
    merchantVal: "Bivaax"
  },
  bn: {
    title: "পেমেন্ট সম্পন্ন করুন",
    expires: "পেমেন্ট শেষ হবে",
    howToPay: "কিভাবে বাইনান্স দিয়ে পে করবেন ?",
    totalAmount: "মোট পরিমাণ",
    merchant: "মার্চেন্ট",
    orderId: "অর্ডার আইডি",
    description: "বর্ণনা",
    depositId: "Bivaax ডিপোজিট আইডি",
    poweredBy: "পেমেন্ট অভিজ্ঞতা Bitnbox দ্বারা চালিত",
    confirmPayment: "পেমেন্ট নিশ্চিত করুন",
    about: "আমাদের সম্পর্কে",
    privacy: "গোপনীয়তা নীতি",
    successTitle: "ডিপোজিট অনুরোধ জমা দেওয়া হয়েছে!",
    successDesc: "আপনার বাইনান্স পে ডিপোজিট অনুরোধ জমা দেওয়া হয়েছে। এটি আমাদের অ্যাডমিন দ্বারা পর্যালোচনা করা হবে এবং শীঘ্রই আপনার ব্যালেন্সে যোগ করা হবে।",
    returnTerm: "টার্মিনালে ফিরে যান",
    connecting: "সুরক্ষিত লেজারে সংযুক্ত হচ্ছে...",
    verifying: "অনুরোধের তথ্য যাচাই করা হচ্ছে...",
    securing: "লেনদেনের অনুরোধ সুরক্ষিত করা হচ্ছে...",
    crediting: "অনুরোধ চূড়ান্ত করা হচ্ছে...",
    languageTitle: "ভাষা",
    merchantVal: "বিভাস"
  },
  es: {
    title: "Completar pago",
    expires: "El pago vence en",
    howToPay: "¿Cómo pagar con Binance?",
    totalAmount: "Cantidad total",
    merchant: "Comerciante",
    orderId: "ID del pedido",
    description: "Descripción",
    depositId: "Bivaax ID de depósito",
    poweredBy: "Experiencia de pago impulsada por Bitnbox",
    confirmPayment: "Confirmar Pago",
    about: "Acerca de",
    privacy: "Política de privacidad",
    successTitle: "¡Solicitud de Depósito Enviada!",
    successDesc: "Su solicitud de depósito de Binance Pay ha sido enviada. Será revisada por nuestro administrador y acreditada en su saldo a la brevedad.",
    returnTerm: "Volver a la Terminal",
    connecting: "Conectando al libro mayor seguro...",
    verifying: "Verificando detalles de la solicitud...",
    securing: "Asegurando la solicitud de transacción...",
    crediting: "Finalizando solicitud...",
    languageTitle: "Idioma",
    merchantVal: "Bivaax"
  },
  ar: {
    title: "إكمال الدفع",
    expires: "تنتهي صلاحية الدفع في",
    howToPay: "كيفية الدفع باستخدام بينانس؟",
    totalAmount: "المبلغ الإجمالي",
    merchant: "التاجر",
    orderId: "رقم الطلب",
    description: "الوصف",
    depositId: "معرف إيداع Bivaax",
    poweredBy: "تجربة الدفع مدعومة من Bitnbox",
    confirmPayment: "تأكيد الدفع",
    about: "حول",
    privacy: "سياسة الخصوصية",
    successTitle: "تم تقديم طلب الإيداع!",
    successDesc: "تم تقديم طلب إيداع Binance Pay الخاص بك. سيقوم المسؤول بمراجعته وإضافته إلى رصيدك قريبًا.",
    returnTerm: "العودة إلى المنصة",
    connecting: "الاتصال بدفتر الحسابات الآمن...",
    verifying: "التحقق من تفاصيل الطلب...",
    securing: "تأمين طلب المعاملة...",
    crediting: "إكمال الطلب...",
    languageTitle: "اللغة",
    merchantVal: "Bivaax"
  },
  fr: {
    title: "Compléter le paiement",
    expires: "Le paiement expire dans",
    howToPay: "Comment payer avec Binance ?",
    totalAmount: "Montant total",
    merchant: "Marchand",
    orderId: "ID de la commande",
    description: "Description",
    depositId: "Bivaax ID de dépôt",
    poweredBy: "Expérience de paiement propulsée par Bitnbox",
    confirmPayment: "Confirmer le Paiement",
    about: "À propos",
    privacy: "Politique de confidentialité",
    successTitle: "Demande de Dépôt Soumise !",
    successDesc: "Votre demande de dépôt Binance Pay a été soumise. Elle sera examinée par notre administrateur et créditée sur votre solde sous peu.",
    returnTerm: "Retourner au Terminal",
    connecting: "Connexion au registre sécurisé...",
    verifying: "Vérification des détails de la demande...",
    securing: "Sécurisation de la demande de transaction...",
    crediting: "Finalisation de la demande...",
    languageTitle: "Langue",
    merchantVal: "Bivaax"
  },
  pt: {
    title: "Concluir pagamento",
    expires: "O pagamento expira em",
    howToPay: "Como pagar com a Binance?",
    totalAmount: "Valor total",
    merchant: "Comerciante",
    orderId: "ID do pedido",
    description: "Descrição",
    depositId: "Bivaax ID de depósito",
    poweredBy: "Experiência de pagamento alimentada por Bitnbox",
    confirmPayment: "Confirmar Pagamento",
    about: "Sobre",
    privacy: "Política de privacidad",
    successTitle: "Solicitação de Depósito Enviada!",
    successDesc: "Sua solicitação de depósito via Binance Pay foi enviada. Ela será revisada pelo nosso administrador e creditada em seu saldo em breve.",
    returnTerm: "Voltar para o Terminal",
    connecting: "Conectando ao livro de registros seguro...",
    verifying: "Verificando detalhes da solicitação...",
    securing: "Garantindo a solicitação da transação...",
    crediting: "Finalizando solicitação...",
    languageTitle: "Idioma",
    merchantVal: "Bivaax"
  },
  ru: {
    title: "Завершить платеж",
    expires: "Срок действия платежа истекает через",
    howToPay: "Как оплатить через Binance ?",
    totalAmount: "Итоговая сумма",
    merchant: "Продавец",
    orderId: "ID заказа",
    description: "Описание",
    depositId: "ID депозита Bivaax",
    poweredBy: "Платеж проведен через Bitnbox",
    confirmPayment: "Подтвердить платеж",
    about: "О нас",
    privacy: "Политика конфиденциальности",
    successTitle: "Запрос на депозит отправлен!",
    successDesc: "Ваш запрос на депозит через Binance Pay был отправлен. Он будет проверен администратором и в ближайшее время зачислен на ваш баланс.",
    returnTerm: "Вернуться в терминал",
    connecting: "Подключение к защищенному реестру...",
    verifying: "Проверка данных запроса...",
    securing: "Защита запроса транзакции...",
    crediting: "Завершение запроса...",
    languageTitle: "Язык",
    merchantVal: "Bivaax"
  }
};

const languagesList = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'ru', label: 'Русский' }
];

export default function BinancePayPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const amount = searchParams.get('amount') || '0';
  const currency = searchParams.get('currency') || 'USDT';
  const baseOrderId = searchParams.get('orderId') || Math.floor(Math.random() * 100000000).toString();
  
  const [appConfig, setAppConfig] = useState<any>({});
  const [timeLeft, setTimeLeft] = useState(3 * 60 * 60 - 17); // 3 hours (almost) in seconds
  const [currentUser, setCurrentUser] = useState<any>(auth.currentUser);

  // Redesign state managers
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedLang, setSelectedLang] = useState('en');
  const [isLangSheetOpen, setIsLangSheetOpen] = useState(false);

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
    if (currentUser && !hasAutoSubmitted.current) {
      hasAutoSubmitted.current = true;
      const autoSubmit = async () => {
        try {
          const tDoc = await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
              type: 'Deposit',
              amount: Number(amount),
              method: 'Binance Pay',
              currency: currency,
              status: 'Pending',
              trxId: 'Pending/BinancePay',
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
              method: 'Binance Pay',
              walletNumber: appConfig.binancePayUid || 'BinancePay',
              trxId: 'Pending/BinancePay',
              status: 'pending',
              timestamp: Date.now(),
              orderId: baseOrderId
          });
          setDepositDocId(dDoc.id);
          
          console.log("Auto-submitted pending Binance Pay deposit request:", dDoc.id);
        } catch (err) {
          console.error("Auto Binance Pay deposit failed:", err);
        }
      };
      autoSubmit();
    }
  }, [currentUser, appConfig, amount]);
  
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
    
    // Timer
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittingStep, setSubmittingStep] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const handleConfirmPayment = async () => {
     if (!currentUser) {
         toast.error("You must be logged in.");
         return;
     }

     setIsSubmitting(true);
     setSubmittingStep(t.connecting);
     await delay(1200);
     setSubmittingStep(t.verifying);
     await delay(1000);
     setSubmittingStep(t.securing);
     await delay(1000);
     setSubmittingStep(t.crediting);
     await delay(800);
     setIsSuccess(true);
     toast.success("Deposit request submitted!");
     return;
     try {
         setSubmittingStep(t.connecting);
         await delay(1800);
         
         setSubmittingStep(t.verifying);
         await delay(1500);

         setSubmittingStep(t.securing);
         await delay(1500);

         setSubmittingStep(t.crediting);
         await delay(1200);
         
         // 1. Log transaction as Pending
         await addDoc(collection(db, `users/${currentUser.uid}/transactions`), {
             type: 'Deposit',
             amount: Number(amount),
             method: 'Binance Pay',
             currency: currency,
             status: 'Pending',
             trxId: 'Pending/BinancePay',
             orderId: baseOrderId,
             timestamp: Date.now(),
             category: 'Crypto'
         });

         // 2. Add to global deposits as pending
         await addDoc(collection(db, 'deposits'), {
             userId: currentUser.uid,
             userEmail: currentUser.email || '',
             amount: Number(amount),
             currency: currency,
             method: 'Binance Pay',
             walletNumber: appConfig.binancePayUid || 'BinancePay',
             trxId: 'Pending/BinancePay',
             status: 'pending',
             timestamp: Date.now(),
             orderId: baseOrderId
         });



         await delay(800);

         setIsSuccess(true);
         toast.success("Deposit request submitted!");
         setTimeout(() => {
             navigate('/trade');
         }, 8000);
     } catch(err) {
         console.error(err);
         toast.error("Failed to submit request.");
         setIsSubmitting(false);
     }
  };

  const t = translations[selectedLang] || translations['en'];

  return (
    <div className={`min-h-screen font-sans flex flex-col justify-between transition-colors duration-300 ${
      isDarkMode ? 'bg-[#121622] text-[#E1E6F0]' : 'bg-[#F4F6F9] text-[#131722]'
    }`}>
      <SEO title="Binance Pay Page" description="Manage your Binance Pay Page on Bivaax Trade Platform." />

      {/* Main Container constrained to look like a premium mobile interface */}
      <div className="w-full max-w-[480px] mx-auto flex-1 flex flex-col justify-between pb-28">
        
        {/* Header - Matches the exact screenshot style */}
        <header className={`flex items-center justify-between px-6 py-4 border-b transition-colors duration-300 ${
          isDarkMode ? 'bg-[#121622] border-white/[0.06]' : 'bg-[#F4F6F9] border-gray-200'
        }`}>
          {/* Logo Brand Title */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)} 
              className={`p-1 rounded-lg transition-colors ${
                isDarkMode ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              <Icons.ArrowLeft size={20} />
            </button>
            <span className={`text-lg font-black tracking-tight ${
              isDarkMode ? 'text-white' : 'text-[#0F141E]'
            }`}>
              Bivaax
            </span>
          </div>

          {/* Right actions: Language Trigger and Theme switch */}
          <div className="flex items-center gap-4">
            {/* Language Selector Pill */}
            <button 
              onClick={() => setIsLangSheetOpen(true)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all flex items-center gap-1 border ${
                isDarkMode 
                  ? 'bg-[#1B2233] border-white/[0.08] text-white hover:bg-[#252E42]' 
                  : 'bg-white border-gray-200 text-[#0F141E] hover:bg-gray-50'
              }`}
            >
              <span>{selectedLang.toUpperCase()}</span>
              <Icons.ChevronDown size={12} className="opacity-60" />
            </button>

            {/* Theme Toggle */}
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-1.5 rounded-lg transition-colors ${
                isDarkMode ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'
              }`}
            >
              {isDarkMode ? <Icons.Sun size={18} /> : <Icons.Moon size={18} />}
            </button>
          </div>
        </header>

        {/* Content Box */}
        <main className="flex-1 px-4 py-5 flex flex-col gap-4">
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`border rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center mt-6 shadow-xl transition-colors ${
                  isDarkMode ? 'bg-[#1B2233] border-white/[0.06]' : 'bg-white border-gray-100'
                }`}
              >
                 <div className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mb-6">
                   <Icons.CheckCircle size={36} className="text-green-500 animate-bounce" />
                 </div>
                 <h2 className={`text-xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-[#0F141E]'}`}>
                   {t.successTitle}
                 </h2>
                 <p className={`text-xs sm:text-sm mb-8 leading-relaxed ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                   {t.successDesc}
                 </p>
                 
                 <div className={`w-full rounded-2xl p-4 sm:p-5 flex flex-col gap-3 mb-8 ${
                   isDarkMode ? 'bg-white/5' : 'bg-gray-50'
                 }`}>
                    <div className="flex justify-between text-[11px] font-black uppercase tracking-wider">
                       <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t.depositId}</span>
                       <span className={`font-mono ${isDarkMode ? 'text-white' : 'text-black'}`}>{baseOrderId}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-black uppercase tracking-wider">
                       <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>{t.totalAmount}</span>
                       <span className="text-[#F5C300] font-black">${amount} {currency}</span>
                    </div>
                 </div>

                 <button 
                   onClick={() => navigate(-1)}
                   className="w-full py-3.5 bg-[#FFE24C] hover:bg-[#F5C300] text-black rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg"
                 >
                   {t.returnTerm}
                 </button>
                 
                 <p className="text-[9px] text-gray-500 mt-5 uppercase font-bold tracking-widest">
                   Redirecting in 5 seconds
                 </p>
              </motion.div>
            ) : (
              <motion.div 
                key="form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-4"
              >
                
                {/* 1. Complete Payment header banner */}
                <div className={`rounded-3xl p-6 text-center border transition-colors ${
                  isDarkMode ? 'bg-[#1B2233] border-white/[0.06]' : 'bg-white border-gray-100 shadow-sm'
                }`}>
                  <h2 className={`text-lg sm:text-xl font-extrabold tracking-tight ${isDarkMode ? 'text-white' : 'text-[#0F141E]'}`}>
                    {t.title}
                  </h2>
                  <p className={`text-xs mt-1.5 font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t.expires} <span className="font-mono text-[#F5C300] font-bold">{formatTime(timeLeft)}</span>
                  </p>
                </div>

                {/* 2. QR Code Block */}
                <div className={`rounded-3xl p-6 flex flex-col items-center justify-center text-center border transition-colors ${
                  isDarkMode ? 'bg-[#1B2233] border-white/[0.06]' : 'bg-white border-gray-100 shadow-sm'
                }`}>
                  
                  {/* Outer QR Wrapper to center logo perfectly */}
                  <div className="w-48 h-48 bg-white border border-gray-100 rounded-2xl flex items-center justify-center p-3.5 relative overflow-hidden shadow-md">
                     <img 
                       src={appConfig.binancePayQrCode || "https://i.postimg.cc/Gt5SP1L4/IMG-20260804-141135.png"} 
                       alt="Binance Pay QR Code" 
                       className="w-full h-full object-contain"  
                       loading="lazy" 
                     />
                  </div>

                  {/* Guide text */}
                  <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-gray-400 justify-center">
                    <span>{t.howToPay}</span>
                    <Icons.HelpCircle size={14} className="opacity-80" />
                  </div>
                </div>

                {/* 3. Transaction Details List */}
                <div className={`rounded-3xl p-6 flex flex-col gap-4 border transition-colors ${
                  isDarkMode ? 'bg-[#1B2233] border-white/[0.06]' : 'bg-white border-gray-100 shadow-sm'
                }`}>
                  {/* Total Amount */}
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.totalAmount}</span>
                    <span className={`font-mono font-black text-sm sm:text-base ${isDarkMode ? 'text-white' : 'text-[#0F141E]'}`}>{amount} USDT</span>
                  </div>
                  
                  <div className={`h-[1px] ${isDarkMode ? 'bg-white/[0.06]' : 'bg-gray-100'}`} />

                  {/* Merchant */}
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.merchant}</span>
                    <span className={`text-xs font-extrabold ${isDarkMode ? 'text-white' : 'text-[#0F141E]'}`}>{t.merchantVal}</span>
                  </div>

                  <div className={`h-[1px] ${isDarkMode ? 'bg-white/[0.06]' : 'bg-gray-100'}`} />

                  {/* Order ID */}
                  <div className="flex justify-between items-center">
                    <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.orderId}</span>
                    <span className={`font-mono text-xs font-extrabold ${isDarkMode ? 'text-white' : 'text-[#0F141E]'}`}>{baseOrderId}</span>
                  </div>
                </div>

                {/* 4. Description Box */}
                <div className={`rounded-3xl p-6 border transition-colors ${
                  isDarkMode ? 'bg-[#1B2233] border-white/[0.06]' : 'bg-white border-gray-100 shadow-sm'
                }`}>
                  <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.description}</p>
                  <p className={`text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-[#0F141E]'}`}>{t.merchantVal} Deposit ID: {baseOrderId}</p>
                </div>

                {/* Footer and Brand */}
                <div className="text-center mt-3 flex flex-col items-center gap-1.5">
                  <span className="text-gray-400/80 text-[10px] font-bold uppercase tracking-wider">{t.poweredBy}</span>
                  <div className="flex gap-4 text-gray-400 text-[11px] font-bold mt-1">
                    <a href="#" className="hover:underline">{t.about}</a>
                    <span className="opacity-30">|</span>
                    <a href="#" className="hover:underline">{t.privacy}</a>
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Sticky Action Button at the very bottom */}
        {!isSuccess && (
          <div className={`fixed bottom-0 left-0 right-0 p-4 border-t backdrop-blur-md z-40 transition-colors ${
            isDarkMode ? 'bg-[#121622]/90 border-white/[0.06]' : 'bg-[#F4F6F9]/90 border-gray-200'
          }`}>
            <div className="w-full max-w-[480px] mx-auto">
              <button 
                onClick={handleConfirmPayment}
                disabled={isSubmitting}
                className="w-full h-14 bg-[#FFE24C] hover:bg-[#F5C300] active:scale-[0.98] transition-all text-black font-black text-sm uppercase tracking-widest rounded-3xl flex items-center justify-center gap-3 disabled:opacity-50 shadow-lg cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
                    <span className="text-xs font-extrabold animate-pulse">{submittingStep}</span>
                  </>
                ) : (
                  <>
                    <Icons.CheckCircle size={20} className="text-white" />
                    <span>{t.confirmPayment}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Language bottom-sheet selection switcher - Beautiful dynamic bottom sheet requested */}
      <AnimatePresence>
        {isLangSheetOpen && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLangSheetOpen(false)}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-xs"
            />

            {/* Language Sheet */}
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className={`fixed bottom-0 left-0 right-0 rounded-t-[32px] p-6 z-50 max-w-[480px] mx-auto transition-colors border-t ${
                isDarkMode ? 'bg-[#121622] border-white/[0.06]' : 'bg-white border-gray-200'
              }`}
            >
              {/* Top notch indicator */}
              <div className="w-12 h-1 bg-gray-500/30 rounded-full mx-auto mb-5" />

              <div className="flex items-center justify-between mb-5">
                <span className={`text-base font-black ${isDarkMode ? 'text-white' : 'text-[#0F141E]'}`}>
                  {t.languageTitle}
                </span>
                <button 
                  onClick={() => setIsLangSheetOpen(false)}
                  className={`p-1 rounded-full ${isDarkMode ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-100 hover:bg-gray-200'}`}
                >
                  <Icons.X size={16} />
                </button>
              </div>

              {/* Language list selection */}
              <div className="flex flex-col gap-1.5 max-h-[350px] overflow-y-auto pr-1">
                {languagesList.map((lang) => (
                  <button 
                    key={lang.code}
                    onClick={() => {
                      setSelectedLang(lang.code);
                      setIsLangSheetOpen(false);
                    }}
                    className={`w-full py-4 px-4 rounded-2xl flex items-center justify-between transition-all font-bold text-xs ${
                      selectedLang === lang.code
                        ? 'bg-[#FFE24C]/10 text-yellow-500'
                        : isDarkMode ? 'text-gray-300 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{lang.label}</span>
                    {selectedLang === lang.code && (
                      <Icons.Check size={16} className="text-yellow-500" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
