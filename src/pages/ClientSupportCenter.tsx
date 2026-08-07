import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Bell, MessageSquare, Ticket, BookOpen, Shield, 
  CreditCard, Wallet, TrendingUp, UserCheck, HelpCircle, 
  ChevronRight, ArrowRight, Plus, Send, Paperclip, 
  Smile, Mic, Image as ImageIcon, X, MessageCircle, 
  ChevronDown, Mail, Phone, Zap, Star, Layout, 
  User, History, AlertCircle, CheckCircle2, Clock, 
  Smartphone, Globe, Info, Headphones, Sparkles, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { auth, db, collection, addDoc, query, where, orderBy, onSnapshot } from '../firebase';
import { toast } from 'react-hot-toast';

interface Category {
  id: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  color: string;
}

const CATEGORIES: Category[] = [
  { id: 'deposit', title: 'Deposit', desc: 'Issues with adding funds', icon: <Wallet size={24} />, color: 'from-emerald-500/20 to-emerald-600/20 text-emerald-400' },
  { id: 'withdrawal', title: 'Withdrawal', desc: 'Processing & status', icon: <CreditCard size={24} />, color: 'from-amber-500/20 to-amber-600/20 text-amber-400' },
  { id: 'trading', title: 'Trading', desc: 'Order & platform help', icon: <TrendingUp size={24} />, color: 'from-blue-500/20 to-blue-600/20 text-blue-400' },
  { id: 'kyc', title: 'Verification', desc: 'Identity & documents', icon: <UserCheck size={24} />, color: 'from-purple-500/20 to-purple-600/20 text-purple-400' },
  { id: 'security', title: 'Security', desc: '2FA & account safety', icon: <Shield size={24} />, color: 'from-red-500/20 to-red-600/20 text-red-400' },
  { id: 'bonus', title: 'Bonus', desc: 'Promotions & rewards', icon: <Star size={24} />, color: 'from-pink-500/20 to-pink-600/20 text-pink-400' },
];

const FAQS = [
  { q: "How long do deposits take?", a: "Crypto deposits typically reflect after 1-3 network confirmations (approx. 5-10 mins). MFS deposits like bKash are processed within 15-30 minutes." },
  { q: "What is the minimum withdrawal?", a: "The minimum withdrawal amount is $10 for most methods. Fees vary depending on the network used." },
  { q: "How to enable 2FA?", a: "Go to Profile > Security > Google Authenticator. Scan the QR code and enter the 6-digit verification code." },
  { q: "My verification was rejected, why?", a: "Common reasons include blurry images, expired documents, or a mismatch between the ID and your profile information." }
];

export default function ClientSupportCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'home' | 'tickets' | 'chat'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [tickets, setTickets] = useState<any[]>([]);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [messages, setMessages] = useState<any[]>([
    { id: '1', type: 'bot', text: 'Hello! I am your Bivaax AI Assistant. How can I help you today?', time: new Date().getTime() }
  ]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, 'tickets'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(ticketsData);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiTyping]);

  const handleSendMessage = async () => {
    if (!chatMessage.trim()) return;

    const userMessage = { 
      id: Date.now().toString(), 
      type: 'user', 
      text: chatMessage, 
      time: new Date().getTime() 
    };
    
    setMessages(prev => [...prev, userMessage]);
    setChatMessage('');
    setIsAiTyping(true);

    try {
      const user = auth.currentUser;
      const res = await fetch('/api/support/ai-chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          userId: user?.uid || 'anonymous', 
          message: chatMessage,
          mode: 'agentic'
        })
      });
      const data = await res.json();
      
      setIsAiTyping(false);
      if (data.reply) {
        const botResponse = {
          id: Date.now().toString(),
          type: 'bot',
          text: data.reply,
          time: new Date().getTime()
        };
        setMessages(prev => [...prev, botResponse]);
        
        if (data.transferToAgent) {
          toast.success('Connecting you to a live agent...');
          // Optional: Add logic to switch to a live chat interface
        }
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (err) {
      setIsAiTyping(false);
      toast.error('AI assistant is currently unavailable.');
      console.error(err);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 }
  };

  return (
    <div className="min-h-screen bg-[#0b0e11] text-gray-100 font-sans pb-24 overflow-x-hidden">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0b0e11]/80 backdrop-blur-xl border-b border-white/5 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white/5 rounded-full text-gray-400">
            <ChevronRight className="rotate-180" size={20} />
          </button>
          <h1 className="text-lg font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">Support Center</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors relative">
            <Bell size={20} className="text-gray-400" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-[#f45c5c] rounded-full border-2 border-[#0b0e11]"></span>
          </button>
          <button className="p-2.5 bg-white/5 hover:bg-white/10 rounded-full transition-colors">
            <Search size={20} className="text-gray-400" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-6 space-y-8">
        
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1e2329] to-[#161a1e] border border-white/5 p-8 shadow-2xl"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#f45c5c]/10 blur-[100px] rounded-full -mr-32 -mt-32"></div>
          <div className="relative z-10 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
              <Zap size={12} fill="currentColor" /> System Online
            </div>
            <h2 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              How can we <span className="text-[#f45c5c]">help</span> you today?
            </h2>
            <p className="text-gray-400 text-sm max-w-md">
              Search our knowledge base or chat with our AI-powered assistant for instant resolutions.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <button 
                onClick={() => setActiveTab('chat')}
                className="px-8 py-3.5 bg-[#f45c5c] hover:bg-[#e04848] text-white font-bold rounded-2xl shadow-lg shadow-[#f45c5c]/20 transition-all flex items-center gap-2 active:scale-95"
              >
                <Sparkles size={18} /> Start AI Chat
              </button>
              <button className="px-8 py-3.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/10 transition-all active:scale-95">
                View Tutorials
              </button>
            </div>
          </div>
          
          {/* Decorative Illustration (Abstract) */}
          <div className="hidden lg:block absolute right-12 bottom-0 w-80 h-80 opacity-20 pointer-events-none">
            <div className="w-full h-full bg-[#f45c5c] rounded-full blur-[80px] animate-pulse"></div>
            <Headphones size={200} className="absolute inset-0 m-auto text-white/40" />
          </div>
        </motion.div>

        {/* Categories Grid */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Layout size={20} className="text-[#f45c5c]" /> Help Categories
            </h3>
            <button className="text-xs font-bold text-gray-500 hover:text-white transition-colors">View All</button>
          </div>
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {CATEGORIES.map((cat) => (
              <motion.div 
                key={cat.id}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                className="group p-5 bg-[#161a1e] border border-white/5 rounded-2xl hover:bg-[#1e2329] hover:border-[#f45c5c]/30 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${cat.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                  {cat.icon}
                </div>
                <h4 className="font-bold text-lg text-white mb-1 flex items-center justify-between">
                  {cat.title}
                  <ChevronRight size={18} className="text-gray-600 group-hover:text-[#f45c5c] transition-colors" />
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed">{cat.desc}</p>
                <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        {/* AI Chat Window Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-4">
          
          {/* Left: Chat Card */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-7 bg-[#161a1e] border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[500px]"
          >
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f45c5c] to-red-600 flex items-center justify-center shadow-lg shadow-[#f45c5c]/20">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider">AI Support Bot</h4>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-[10px] text-gray-400 font-bold">Active Assistant</span>
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-white/10 rounded-lg text-gray-400"><Info size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] space-y-1 ${m.type === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      m.type === 'user' 
                      ? 'bg-[#f45c5c] text-white rounded-br-none' 
                      : 'bg-[#1e2329] text-gray-200 border border-white/10 rounded-bl-none'
                    }`}>
                      {m.text}
                    </div>
                    <span className="text-[9px] text-gray-600 font-bold uppercase tracking-widest px-2">
                      {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isAiTyping && (
                <div className="flex justify-start">
                  <div className="bg-[#1e2329] p-3 rounded-2xl flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
                      <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                      <span className="w-1.5 h-1.5 bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-bold italic">AI is thinking...</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Suggested Actions */}
            <div className="px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar border-t border-white/5">
              {['Check my balance', 'Reset 2FA', 'Withdrawal status', 'KYC help'].map((q, i) => (
                <button 
                  key={i}
                  onClick={() => { setChatMessage(q); }}
                  className="whitespace-nowrap px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-[10px] font-bold text-gray-400 transition-all active:scale-95"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/5 border-t border-white/5 flex items-center gap-2">
              <button className="p-2.5 hover:bg-white/10 rounded-xl text-gray-400"><Paperclip size={20} /></button>
              <div className="relative flex-1">
                <input 
                  type="text"
                  placeholder="Ask anything about Bivaax..."
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="w-full bg-[#0b0e11] border border-white/10 rounded-2xl px-5 py-3 text-sm text-white focus:outline-none focus:border-[#f45c5c] transition-all pr-12"
                />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-500 hover:text-white"><Mic size={18} /></button>
              </div>
              <button 
                onClick={handleSendMessage}
                disabled={!chatMessage.trim()}
                className="p-3.5 bg-[#f45c5c] hover:bg-[#e04848] text-white rounded-2xl shadow-lg transition-all active:scale-90 disabled:opacity-50 disabled:grayscale"
              >
                <Send size={20} />
              </button>
            </div>
          </motion.div>

          {/* Right: Tickets & Quick Contacts */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* My Tickets Card */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-[#161a1e] border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Ticket size={16} className="text-[#f45c5c]" /> My Support Tickets
                </h4>
                <div className="flex gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase">{tickets.filter(t => t.status === 'Open').length} Open</span>
                </div>
              </div>
              
              <div className="max-h-[300px] overflow-y-auto divide-y divide-white/5">
                {tickets.length > 0 ? tickets.map((t) => (
                  <div key={t.id} className="p-4 hover:bg-white/5 transition-colors cursor-pointer group">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-black text-white group-hover:text-[#f45c5c] transition-colors">{t.subject}</span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                        t.status === 'Open' ? 'bg-emerald-500/20 text-emerald-400' : 
                        t.status === 'Resolved' ? 'bg-gray-800 text-gray-500' : 'bg-amber-500/20 text-amber-400'
                      }`}>{t.status}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-500 font-mono">ID: {t.id}</span>
                      <span className="text-gray-600 flex items-center gap-1"><Clock size={10} /> {new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                )) : (
                  <div className="py-12 flex flex-col items-center justify-center text-gray-600 text-center px-6">
                    <AlertCircle size={32} className="opacity-10 mb-2" />
                    <p className="text-xs font-bold uppercase tracking-widest">No active tickets</p>
                    <p className="text-[10px] mt-1 italic">Your support history will appear here.</p>
                  </div>
                )}
              </div>
              
              <button className="w-full p-4 text-xs font-black text-[#f45c5c] hover:bg-[#f45c5c]/5 transition-all uppercase tracking-widest border-t border-white/5">
                View All History
              </button>
            </motion.div>

            {/* Quick Contact Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex flex-col items-center text-center space-y-2 hover:bg-emerald-500/10 transition-all cursor-pointer">
                <div className="p-3 rounded-full bg-emerald-500/20 text-emerald-400"><MessageCircle size={20} /></div>
                <h5 className="text-xs font-bold text-white">Live Chat</h5>
                <p className="text-[9px] text-gray-500">24/7 Agent Support</p>
              </div>
              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex flex-col items-center text-center space-y-2 hover:bg-blue-500/10 transition-all cursor-pointer">
                <div className="p-3 rounded-full bg-blue-500/20 text-blue-400"><Mail size={20} /></div>
                <h5 className="text-xs font-bold text-white">Email Us</h5>
                <p className="text-[9px] text-gray-500">support@bivaax.com</p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="bg-[#161a1e] border border-white/5 rounded-3xl p-8 space-y-6">
          <div className="text-center space-y-2 max-w-xl mx-auto">
            <h3 className="text-2xl font-black text-white">Frequently Asked <span className="text-[#f45c5c]">Questions</span></h3>
            <p className="text-gray-500 text-xs">Find quick answers to common issues from our global user base.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            {FAQS.map((faq, i) => (
              <div key={i} className="group p-5 bg-[#0b0e11] border border-white/5 rounded-2xl hover:border-[#f45c5c]/20 transition-all">
                <div className="flex items-start gap-4">
                  <div className="mt-1 w-6 h-6 rounded-lg bg-[#f45c5c]/10 flex items-center justify-center text-[#f45c5c] font-black text-xs shrink-0">Q</div>
                  <div className="space-y-2">
                    <h5 className="text-sm font-bold text-white group-hover:text-[#f45c5c] transition-colors">{faq.q}</h5>
                    <p className="text-xs text-gray-500 leading-relaxed italic">"{faq.a}"</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="pt-4 flex justify-center">
            <button className="flex items-center gap-2 text-xs font-black text-gray-500 hover:text-white transition-all uppercase tracking-widest group">
              Explore Help Center <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </section>

      </main>

      {/* Floating Action Button for Live Agent */}
      <motion.button 
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-24 right-6 lg:bottom-12 lg:right-12 z-50 p-4 bg-[#f45c5c] text-white rounded-2xl shadow-2xl shadow-[#f45c5c]/30 flex items-center gap-3 group"
      >
        <div className="relative">
          <Headphones size={24} />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#f45c5c] animate-pulse"></span>
        </div>
        <span className="font-black text-sm uppercase tracking-tighter">Live Agent</span>
      </motion.button>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-[#161a1e]/90 backdrop-blur-xl border-t border-white/5 h-16 flex items-center justify-around px-4 z-50">
        <button onClick={() => navigate('/')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white">
          <Globe size={20} />
          <span className="text-[10px] font-bold">Home</span>
        </button>
        <button onClick={() => navigate('/markets')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white">
          <TrendingUp size={20} />
          <span className="text-[10px] font-bold">Markets</span>
        </button>
        <button onClick={() => navigate('/trade')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white">
          <Zap size={20} />
          <span className="text-[10px] font-bold">Trade</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-[#f45c5c]">
          <Headphones size={20} />
          <span className="text-[10px] font-bold">Support</span>
        </button>
        <button onClick={() => navigate('/profile')} className="flex flex-col items-center gap-1 text-gray-500 hover:text-white">
          <User size={20} />
          <span className="text-[10px] font-bold">Profile</span>
        </button>
      </nav>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(244, 92, 92, 0.2);
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

    </div>
  );
}
