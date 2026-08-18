import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Bell, MessageSquare, Ticket, BookOpen, Shield, 
  CreditCard, Wallet, TrendingUp, UserCheck, HelpCircle, 
  ChevronRight, ArrowRight, Plus, Send, Paperclip, 
  Smile, Mic, Image as ImageIcon, X, MessageCircle, 
  ChevronDown, Mail, Phone, Zap, Star, Layout, 
  User, History, AlertCircle, CheckCircle2, Clock, 
  Smartphone, Globe, Info, Headphones, Sparkles, Loader2,
  Trash2, ShieldCheck, CheckCheck, Menu, Filter,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { auth, db, collection, addDoc, query, where, orderBy, onSnapshot, doc, updateDoc, getDoc } from '../firebase';
import { useI18n } from '../context/I18nContext';
import { useTranslation } from '../lib/translations';
import { toast } from 'react-hot-toast';

interface SupportTicket {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  subject?: string;
  category?: string;
  status?: 'open' | 'pending' | 'resolved' | 'closed' | string;
  lastMessage?: string;
  createdAt?: number;
  updatedAt?: number;
}

interface TicketMessage {
  id?: string;
  ticketId?: string;
  senderId?: string;
  senderName?: string;
  senderType?: 'user' | 'support' | 'agent';
  isAdmin?: boolean;
  text?: string;
  message?: string;
  attachments?: string[];
  createdAt?: number;
}

interface Category {
  id: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  color: string;
}

const CATEGORIES: Category[] = [
  { id: 'deposit', title: 'Deposit', desc: 'Issues with adding funds', icon: Wallet, color: 'emerald' },
  { id: 'withdrawal', title: 'Withdrawal', desc: 'Processing & status', icon: CreditCard, color: 'amber' },
  { id: 'trading', title: 'Trading', desc: 'Order & platform help', icon: TrendingUp, color: 'blue' },
  { id: 'kyc', title: 'Verification', desc: 'Identity & documents', icon: UserCheck, color: 'purple' },
  { id: 'security', title: 'Security', desc: '2FA & account safety', icon: Shield, color: 'red' },
  { id: 'bonus', title: 'Bonus', desc: 'Promotions & rewards', icon: Star, color: 'pink' },
];

const FAQS = [
  { q: "How long do deposits take?", a: "Crypto deposits typically reflect after 1-3 network confirmations (approx. 5-10 mins). MFS deposits like bKash are processed within 15-30 minutes." },
  { q: "What is the minimum withdrawal?", a: "The minimum withdrawal amount is $10 for most methods. Fees vary depending on the network used." },
  { q: "How to enable 2FA?", a: "Go to Profile > Security > Google Authenticator. Scan the QR code and enter the 6-digit verification code." },
  { q: "My verification was rejected, why?", a: "Common reasons include blurry images, expired documents, or a mismatch between the ID and your profile information." }
];

export default function ClientSupportCenter() {
  const navigate = useNavigate();
  const [view, setView] = useState<'home' | 'tickets' | 'chat' | 'new_ticket'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [socialLinks, setSocialLinks] = useState<any>({
    whatsapp: 'https://wa.me/message/BIVAAX',
    telegram: 'https://t.me/Bivaax_Official'
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { language } = useI18n();
  const { t } = useTranslation(language);

  const currentUser = auth.currentUser;
  const currentUid = currentUser?.uid || '';

  // 1. Fetch Social Links from Config
  useEffect(() => {
    const fetchLinks = async () => {
      try {
        const docRef = doc(db, 'app_config', 'settings');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setSocialLinks({
            whatsapp: data.socialWhatsapp || 'https://wa.me/message/BIVAAX',
            telegram: data.socialTelegram || 'https://t.me/Bivaax_Official'
          });
        }
      } catch (err) {}
    };
    fetchLinks();
  }, []);

  // 2. Fetch User Tickets
  useEffect(() => {
    if (!currentUid) return;

    const q = query(
      collection(db, 'tickets'),
      where('userId', '==', currentUid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SupportTicket[];
      setTickets(ticketsData);
      
      // If we are in chat view, keep the active ticket updated
      if (activeTicket) {
        const updated = ticketsData.find(t => t.id === activeTicket.id);
        if (updated) setActiveTicket(updated);
      }
    }, (err) => {
      console.warn("Tickets subscription error:", err);
    });

    return () => unsubscribe();
  }, [currentUid, activeTicket?.id]);

  // 3. Fetch Messages for Active Ticket
  useEffect(() => {
    if (!activeTicket?.id || view !== 'chat') {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'tickets', activeTicket.id, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgList = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as TicketMessage[];
      setMessages(msgList);
    });

    return () => unsubscribe();
  }, [activeTicket?.id, view]);

  // 4. Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping, view]);

  const handleSendMessage = async () => {
    if (!chatMessage.trim() && attachedFiles.length === 0) return;
    if (!activeTicket?.id) return;

    setIsSending(true);
    const now = Date.now();
    const text = chatMessage;
    const files = [...attachedFiles];

    setChatMessage('');
    setAttachedFiles([]);

    try {
      await addDoc(collection(db, 'tickets', activeTicket.id, 'messages'), {
        ticketId: activeTicket.id,
        senderId: currentUid,
        senderName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
        senderType: 'user',
        isAdmin: false,
        text: text,
        attachments: files,
        createdAt: now
      });

      await updateDoc(doc(db, 'tickets', activeTicket.id), {
        lastMessage: text || (files.length > 0 ? 'Sent an attachment' : ''),
        updatedAt: now,
        status: 'open'
      });
    } catch (err) {
      toast.error('Failed to send message');
      setChatMessage(text);
      setAttachedFiles(files);
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateTicket = async () => {
    if (!chatMessage.trim() && attachedFiles.length === 0) {
      toast.error('Please enter a message');
      return;
    }

    setIsSending(true);
    try {
      const now = Date.now();
      const ticketData = {
        userId: currentUid,
        userName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
        userEmail: currentUser?.email || '',
        subject: newSubject.trim() || `${newCategory} Inquiry`,
        category: newCategory,
        status: 'open',
        lastMessage: chatMessage.trim() || 'Attached files',
        createdAt: now,
        updatedAt: now
      };

      const ticketRef = await addDoc(collection(db, 'tickets'), ticketData);
      const ticketId = ticketRef.id;

      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        ticketId: ticketId,
        senderId: currentUid,
        senderName: ticketData.userName,
        senderType: 'user',
        isAdmin: false,
        text: chatMessage.trim(),
        attachments: attachedFiles,
        createdAt: now
      });

      setActiveTicket({ id: ticketId, ...ticketData });
      setChatMessage('');
      setAttachedFiles([]);
      setView('chat');
      toast.success('Ticket created successfully');
    } catch (err) {
      toast.error('Failed to create ticket');
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be under 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setAttachedFiles(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 }
  };

  return (
    <div className="min-h-screen bg-[#0b0e11] text-gray-100 font-sans pb-10 overflow-x-hidden">
      
      {/* Header */}
      <header className="sticky top-0 z-[100] bg-[#0b0e11]/80 backdrop-blur-2xl border-b border-white/5 px-4 md:px-8 h-20 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              if (view === 'home') navigate('/trade');
              else setView('home');
            }} 
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400 transition-all active:scale-95"
          >
            <ChevronRight className="rotate-180" size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-white leading-none mb-1">{t('supportDesk')}</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">VIP Priority Active</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setView('tickets')}
            className={`hidden md:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${view === 'tickets' ? 'bg-[#f45c5c] text-white shadow-lg' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            <Ticket size={16} /> My Tickets
          </button>
          <div className="w-[1px] h-8 bg-white/10 hidden md:block"></div>
          <button className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400">
            <Bell size={20} />
          </button>
          <button className="p-1 rounded-2xl bg-white/5 border border-white/10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f45c5c] to-red-600 flex items-center justify-center font-black text-white shadow-lg">
              {currentUser?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-8 space-y-10">
        
        {view === 'home' && (
          <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-10">
            
            {/* Hero Section */}
            <section className="relative rounded-[32px] bg-gradient-to-br from-[#1e2329] to-[#0b0e11] border border-white/5 p-8 md:p-12 overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#f45c5c]/5 blur-[150px] rounded-full -mr-[250px] -mt-[250px]"></div>
              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-8">
                  <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f45c5c]/10 border border-[#f45c5c]/20 text-[#f45c5c] text-[10px] font-black uppercase tracking-[0.2em]">
                    <Sparkles size={14} fill="currentColor" /> Premium Support Hub
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black text-white leading-[1.1] tracking-tight">
                    World-class <br/>
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f45c5c] to-red-400">assistance</span> {language === 'bn' ? 'আপনার জন্য।' : 'for you.'}
                  </h2>
                  
                  <div className="relative max-w-md group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#f45c5c] transition-colors" size={20} />
                    <input 
                      type="text" 
                      placeholder="Search for help articles..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl pl-14 pr-6 text-sm text-white focus:outline-none focus:border-[#f45c5c] transition-all"
                    />
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <button 
                      onClick={() => setView('new_ticket')}
                      className="px-10 py-4.5 bg-[#f45c5c] hover:bg-[#e04848] text-white font-black rounded-[20px] shadow-2xl shadow-[#f45c5c]/30 transition-all active:scale-95 flex items-center gap-3"
                    >
                      <Plus size={20} strokeWidth={3} /> {t('startNewTicket')}
                    </button>
                    <button 
                      onClick={() => setView('tickets')}
                      className="px-10 py-4.5 bg-white/5 hover:bg-white/10 text-white font-black rounded-[20px] border border-white/10 transition-all active:scale-95"
                    >
                      {t('trackStatus')}
                    </button>
                  </div>
                </div>
                
                <div className="hidden lg:grid grid-cols-2 gap-4 relative">
                   <div className="absolute inset-0 bg-[#f45c5c]/10 blur-[60px] rounded-full"></div>
                   <div className="p-6 bg-[#161a1e]/80 backdrop-blur-xl border border-white/5 rounded-[24px] space-y-3 transform -rotate-3 hover:rotate-0 transition-transform cursor-default">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><CheckCircle2 size={24} /></div>
                      <h4 className="font-black text-white">Verified Security</h4>
                      <p className="text-[11px] text-gray-500">Your data is protected by bank-grade encryption protocols.</p>
                   </div>
                   <div className="p-6 bg-[#161a1e]/80 backdrop-blur-xl border border-white/5 rounded-[24px] space-y-3 transform translate-y-8 rotate-3 hover:rotate-0 transition-transform cursor-default">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center"><Clock size={24} /></div>
                      <h4 className="font-black text-white">5-Min Response</h4>
                      <p className="text-[11px] text-gray-500">Average response time for VIP and standard users.</p>
                   </div>
                </div>
              </div>
            </section>

            {/* Quick Contact Options */}
            <section className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <h3 className="text-xl font-black text-white">{t('quickShortcuts')}</h3>
                  <p className="text-xs text-gray-500">Instant connection via your favorite social platforms.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                 <a 
                   href={socialLinks.whatsapp} 
                   target="_blank" 
                   rel="noreferrer"
                   className="group p-8 bg-[#161a1e] border border-white/5 rounded-[28px] hover:border-[#25D366]/30 transition-all flex flex-col items-center text-center space-y-4 hover:shadow-2xl hover:shadow-[#25D366]/10"
                 >
                    <div className="w-16 h-16 rounded-[22px] bg-[#25D366]/10 text-[#25D366] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                       <MessageSquare size={32} />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-white">WhatsApp</h4>
                      <p className="text-xs text-gray-500 mt-1">Direct Live Chat</p>
                    </div>
                    <div className="pt-2">
                       <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-[#25D366] bg-[#25D366]/10 px-3 py-1 rounded-full">
                          Connect <ExternalLink size={10} />
                       </span>
                    </div>
                 </a>
                 <a 
                   href={socialLinks.telegram} 
                   target="_blank" 
                   rel="noreferrer"
                   className="group p-8 bg-[#161a1e] border border-white/5 rounded-[28px] hover:border-[#0088CC]/30 transition-all flex flex-col items-center text-center space-y-4 hover:shadow-2xl hover:shadow-[#0088CC]/10"
                 >
                    <div className="w-16 h-16 rounded-[22px] bg-[#0088CC]/10 text-[#0088CC] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                       <Send size={32} />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-white">Telegram</h4>
                      <p className="text-xs text-gray-500 mt-1">Official Channel</p>
                    </div>
                    <div className="pt-2">
                       <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-[#0088CC] bg-[#0088CC]/10 px-3 py-1 rounded-full">
                          Connect <ExternalLink size={10} />
                       </span>
                    </div>
                 </a>
                 {[
                   { label: t('depositIssue'), msg: "I have an issue with my deposit. It's not reflecting." },
                   { label: t('withdrawalStatus'), msg: "I want to check my withdrawal status." },
                   { label: t('verificationHelp'), msg: "I need help with my account verification." },
                   { label: t('howToTrade'), msg: "Can you explain how to start trading?" }
                 ].map((item, idx) => (
                   <div 
                    key={idx}
                    onClick={() => {
                      setView('new_ticket');
                      setChatMessage(item.msg);
                      setNewSubject(item.label);
                    }}
                    className="group p-8 bg-[#161a1e] border border-white/5 rounded-[28px] hover:border-[#f45c5c]/30 transition-all flex flex-col items-center text-center space-y-4 hover:shadow-2xl hover:shadow-[#f45c5c]/10 cursor-pointer"
                   >
                      <div className="w-16 h-16 rounded-[22px] bg-[#f45c5c]/10 text-[#f45c5c] flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg">
                        <Zap size={32} />
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-white">{item.label}</h4>
                        <p className="text-xs text-gray-500 mt-1">Quick Action</p>
                      </div>
                      <div className="pt-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase text-[#f45c5c] bg-[#f45c5c]/10 px-3 py-1 rounded-full">
                            Select <Plus size={10} />
                        </span>
                      </div>
                   </div>
                 ))}
              </div>
            </section>

            {/* Categories Grid */}
            <section className="space-y-6">
              <div className="flex justify-between items-end">
                <h3 className="text-xl font-black text-white">Help Categories</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {CATEGORIES.map((cat) => (
                  <motion.div 
                    key={cat.id}
                    variants={itemVariants}
                    whileHover={{ y: -5 }}
                    className="group p-5 bg-[#161a1e] border border-white/5 rounded-2xl hover:bg-[#1e2329] transition-all cursor-pointer text-center space-y-3"
                  >
                    <div className={`w-12 h-12 mx-auto rounded-xl bg-${cat.color}-500/10 text-${cat.color}-400 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                      <cat.icon size={24} />
                    </div>
                    <h4 className="font-bold text-[13px] text-white">{cat.title}</h4>
                  </motion.div>
                ))}
              </div>
            </section>
          </motion.div>
        )}

        {view === 'tickets' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-white uppercase tracking-tight">My Tickets</h3>
              <button 
                onClick={() => setView('new_ticket')}
                className="px-6 py-2.5 bg-[#f45c5c] text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-[#e04848] transition-all active:scale-95"
              >
                Create New
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-4">
              {tickets.length > 0 ? tickets.map((t) => (
                <div 
                  key={t.id} 
                  onClick={() => { setActiveTicket(t); setView('chat'); }}
                  className="bg-[#161a1e] border border-white/5 p-6 rounded-[24px] hover:bg-[#1e2329] transition-all cursor-pointer group flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  <div className="flex items-center gap-5">
                     <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
                       t.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' : 
                       t.status === 'resolved' ? 'bg-gray-500/10 text-gray-500' : 'bg-amber-500/10 text-amber-400'
                     }`}>
                        <MessageCircle size={28} />
                     </div>
                     <div>
                        <h4 className="font-black text-white group-hover:text-[#f45c5c] transition-colors">{t.subject}</h4>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1 italic">"{t.lastMessage}"</p>
                        <div className="flex items-center gap-3 mt-3">
                           <span className="text-[10px] font-mono text-gray-600 uppercase">ID: {t.id}</span>
                           <span className="w-1 h-1 bg-white/10 rounded-full"></span>
                           <span className="text-[10px] font-bold text-gray-500 uppercase">{t.category}</span>
                        </div>
                     </div>
                  </div>
                  <div className="flex items-center justify-between md:flex-col md:items-end gap-2">
                     <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        t.status === 'open' ? 'bg-emerald-500/20 text-emerald-400' : 
                        t.status === 'resolved' ? 'bg-gray-800 text-gray-500' : 'bg-amber-500/20 text-amber-400'
                     }`}>{t.status}</span>
                     <span className="text-[10px] text-gray-600 font-bold uppercase flex items-center gap-1.5">
                        <Clock size={12} /> {new Date(t.updatedAt || t.createdAt || Date.now()).toLocaleDateString()}
                     </span>
                  </div>
                </div>
              )) : (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                   <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center text-gray-600 opacity-20">
                      <Ticket size={48} />
                   </div>
                   <div>
                      <h4 className="text-lg font-black text-gray-500">No support tickets found</h4>
                      <p className="text-xs text-gray-600 mt-1 max-w-xs">You haven't opened any support tickets yet. Click the button above to start.</p>
                   </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {view === 'new_ticket' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto">
             <div className="bg-[#161a1e] border border-white/5 rounded-[32px] p-8 md:p-12 space-y-8 shadow-2xl">
                <div className="space-y-2">
                   <h3 className="text-2xl font-black text-white">{language === 'bn' ? 'সাপোর্ট টিকিট' : 'Create Support'} <span className="text-[#f45c5c]">{language === 'bn' ? 'তৈরি করুন' : 'Ticket'}</span></h3>
                   <p className="text-gray-500 text-sm italic">{t('describeQuery')}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="space-y-2">
                      <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest px-1">{t('category')}</label>
                      <select 
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        className="w-full h-14 bg-[#0b0e11] border border-white/10 rounded-2xl px-5 text-sm text-white focus:outline-none focus:border-[#f45c5c] transition-all appearance-none cursor-pointer"
                      >
                         <option value="General">General Inquiry</option>
                         <option value="Deposit">Deposit Issue</option>
                         <option value="Withdrawal">Withdrawal Delay</option>
                         <option value="KYC">Identity Verification</option>
                         <option value="Technical">Technical Glitch</option>
                         <option value="Other">Other</option>
                      </select>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest px-1">{t('subjectOptional')}</label>
                      <input 
                        type="text" 
                        placeholder="Short description of the issue"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        className="w-full h-14 bg-[#0b0e11] border border-white/10 rounded-2xl px-5 text-sm text-white focus:outline-none focus:border-[#f45c5c] transition-all"
                      />
                   </div>
                </div>

                <div className="space-y-2">
                   <label className="text-[11px] font-black text-gray-500 uppercase tracking-widest px-1">{t('yourMessage')}</label>
                   <textarea 
                     rows={6}
                     placeholder="Type your message here..."
                     value={chatMessage}
                     onChange={(e) => setChatMessage(e.target.value)}
                     className="w-full bg-[#0b0e11] border border-white/10 rounded-3xl p-6 text-sm text-white focus:outline-none focus:border-[#f45c5c] transition-all resize-none leading-relaxed"
                   />
                </div>

                {/* File Upload UI */}
                <div className="space-y-4">
                   <div className="flex flex-wrap gap-3">
                      {attachedFiles.map((file, i) => (
                        <div key={i} className="relative group w-20 h-20 rounded-2xl overflow-hidden border border-white/10">
                           <img src={file} alt="preview" className="w-full h-full object-cover" />
                           <button 
                             onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                             className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                           >
                              <Trash2 size={16} />
                           </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="w-20 h-20 rounded-2xl border-2 border-dashed border-white/10 hover:border-[#f45c5c]/50 flex flex-col items-center justify-center text-gray-500 hover:text-[#f45c5c] transition-all group"
                      >
                         <Plus size={24} className="group-hover:scale-110 transition-transform" />
                         <span className="text-[9px] font-black uppercase mt-1">Add Image</span>
                      </button>
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />
                   </div>
                   <p className="text-[10px] text-gray-600 italic">Recommended: Attach screenshots of transactions or error messages.</p>
                </div>

                <button 
                  onClick={handleCreateTicket}
                  disabled={isSending}
                  className="w-full h-16 bg-[#f45c5c] hover:bg-[#e04848] text-white font-black rounded-2xl shadow-xl shadow-[#f45c5c]/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
                >
                   {isSending ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                   {isSending ? 'PROCESSING...' : 'SUBMIT TICKET'}
                </button>
             </div>
          </motion.div>
        )}

        {view === 'chat' && activeTicket && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="h-[calc(100vh-180px)] flex flex-col bg-[#161a1e] border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
             {/* Chat Header */}
             <div className="px-8 py-5 border-b border-white/5 bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-[#f45c5c] text-white flex items-center justify-center shadow-lg">
                      <Headphones size={24} />
                   </div>
                   <div>
                      <h4 className="font-black text-white uppercase tracking-wider">{activeTicket.subject}</h4>
                      <div className="flex items-center gap-2">
                         <span className={`w-1.5 h-1.5 rounded-full ${activeTicket.status === 'open' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`}></span>
                         <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Status: {activeTicket.status}</span>
                      </div>
                   </div>
                </div>
                <button 
                  onClick={() => setView('tickets')}
                  className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 transition-all active:scale-95"
                >
                   <X size={20} />
                </button>
             </div>

             {/* Messages Area */}
             <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-gradient-to-b from-[#161a1e] to-[#0b0e11]">
                {messages.map((m, i) => {
                  const isUser = m.senderType === 'user';
                  return (
                    <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                       <div className={`max-w-[80%] space-y-2`}>
                          <div className={`p-5 rounded-[24px] text-sm leading-relaxed shadow-xl ${
                            isUser 
                              ? 'bg-[#f45c5c] text-white rounded-br-none' 
                              : 'bg-[#1e2329] text-gray-200 border border-white/10 rounded-bl-none'
                          }`}>
                             {m.text}
                             
                             {m.attachments && m.attachments.length > 0 && (
                               <div className="mt-4 flex flex-wrap gap-2">
                                  {m.attachments.map((img, idx) => (
                                    <a key={idx} href={img} target="_blank" rel="noreferrer" className="block w-32 h-32 rounded-xl overflow-hidden border border-black/10 hover:opacity-80 transition-all">
                                       <img src={img} alt="attachment" className="w-full h-full object-cover" />
                                    </a>
                                  ))}
                               </div>
                             )}
                          </div>
                          <div className={`flex items-center gap-2 px-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                             {!isUser && <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Agent</span>}
                             <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest">
                               {new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             </span>
                             {isUser && <CheckCheck size={12} className="text-[#f45c5c]" />}
                          </div>
                       </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
             </div>

             {/* Footer Input Area */}
             <div className="p-6 bg-white/5 border-t border-white/5 space-y-4">
                {attachedFiles.length > 0 && (
                   <div className="flex flex-wrap gap-2 pb-2">
                      {attachedFiles.map((f, i) => (
                        <div key={i} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-white/10">
                           <img src={f} alt="preview" className="w-full h-full object-cover" />
                           <button onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))} className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100">
                              <Trash2 size={14} />
                           </button>
                        </div>
                      ))}
                   </div>
                )}
                <div className="flex items-center gap-4">
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-gray-400 transition-all"
                   >
                      <Paperclip size={24} />
                   </button>
                   <div className="relative flex-1">
                      <input 
                        type="text" 
                        placeholder="Reply to agent..."
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        className="w-full h-14 bg-[#0b0e11] border border-white/10 rounded-2xl px-6 text-sm text-white focus:outline-none focus:border-[#f45c5c] transition-all pr-12"
                      />
                      <button className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                        <Mic size={20} />
                      </button>
                   </div>
                   <button 
                     onClick={handleSendMessage}
                     disabled={isSending || (!chatMessage.trim() && attachedFiles.length === 0)}
                     className="w-14 h-14 bg-[#f45c5c] hover:bg-[#e04848] text-white rounded-2xl flex items-center justify-center shadow-lg transition-all active:scale-90 disabled:opacity-50 disabled:grayscale"
                   >
                      <Send size={24} />
                   </button>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileSelect} />
             </div>
          </motion.div>
        )}

      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(244, 92, 92, 0.3);
        }
      `}</style>
    </div>
  );
}

