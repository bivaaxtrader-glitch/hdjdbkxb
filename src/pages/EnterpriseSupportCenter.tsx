import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, MessageSquare, Ticket, Clock, CheckCircle2, AlertTriangle, 
  UserCheck, Users, BookOpen, FileText, Settings, BarChart3, Search, Filter, 
  Send, Paperclip, Smile, ShieldAlert, User, Shield, ArrowRight, RefreshCw, 
  Check, X, ChevronRight, Bell, Moon, Sun, Download, Trash2, Edit3, 
  Plus, MoreVertical, Sparkles, Headphones, Lock, CheckCheck, Loader2, Globe, ExternalLink
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, updateDoc, addDoc, where, db, auth, handleFirestoreError, OperationType } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TicketItem {
  id: string;
  userId: string;
  userName: string;
  userUid: string;
  userEmail: string;
  userPhone?: string;
  subject: string;
  department: string;
  status: 'Open' | 'Pending' | 'Resolved' | 'Escalated';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  assignedAgentId?: string;
  assignedAgentName?: string;
  lastMessage?: string;
  internalNotes?: string[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

interface MessageItem {
  id: string;
  senderId: string;
  senderName: string;
  senderType: 'user' | 'agent' | 'bot' | 'system';
  text: string;
  attachments?: string[];
  createdAt: number;
  isAdmin?: boolean;
}

export default function EnterpriseSupportCenter() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'live-chats' | 'open-tickets' | 'pending-tickets' | 'resolved-tickets' | 'escalated-tickets' | 'assigned-me' | 'customers' | 'knowledge-base' | 'canned' | 'agents' | 'reports' | 'settings'>('dashboard');
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<TicketItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [userContext, setUserContext] = useState<any>(null);
  const [replyText, setReplyText] = useState('');
  const [internalNoteInput, setInternalNoteInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [knowledgeArticles, setKnowledgeArticles] = useState<any[]>([]);
  const [cannedResponses, setCannedResponses] = useState<any[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth & Permissions Check
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigate('/login');
      return;
    }
    
    // Check if user has support permissions
    const checkAccess = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data();
        const allowedRoles = ['support', 'moderator', 'agent', 'team_leader', 'admin'];
        if (!userData?.isAdmin && !allowedRoles.includes(userData?.role)) {
          toast.error('Access Denied: Support privileges required');
          navigate('/trade');
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'users/' + user.uid);
      }
    };
    checkAccess();
  }, [navigate]);

  // Real-time Tickets Listener
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'tickets'), orderBy('updated_at', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot: any) => {
      const ticketsData: TicketItem[] = [];
      snapshot.forEach((doc: any) => {
        ticketsData.push({ id: doc.id, ...doc.data() } as TicketItem);
      });
      setTickets(ticketsData);
      setIsLoading(false);
    }, (err: any) => {
      handleFirestoreError(err, OperationType.QUERY, 'tickets');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Knowledge Base & Canned Responses Fetch
  useEffect(() => {
    const unsubKB = onSnapshot(collection(db, 'knowledge_base'), (snap: any) => {
      const items: any[] = [];
      snap.forEach((d: any) => items.push({ id: d.id, ...d.data() }));
      setKnowledgeArticles(items);
      
      // Auto-seed if empty
      if (snap.empty && items.length === 0) {
        const initialArticles = [
          { title: 'Deposit Guide', content: 'To deposit funds, go to the wallet section and select your preferred method...', status: 'Published', category: 'General', createdAt: Date.now() },
          { title: 'KYC Verification', content: 'Please upload a clear photo of your NID/Passport and a selfie for verification...', status: 'Published', category: 'Account', createdAt: Date.now() },
          { title: 'Withdrawal Rules', content: 'Withdrawals are processed within 24 hours. Minimum withdrawal is $10...', status: 'Published', category: 'General', createdAt: Date.now() }
        ];
        initialArticles.forEach(a => addDoc(collection(db, 'knowledge_base'), a));
      }
    });

    const unsubCanned = onSnapshot(collection(db, 'canned_responses'), (snap: any) => {
      const items: any[] = [];
      snap.forEach((d: any) => items.push({ id: d.id, ...d.data() }));
      setCannedResponses(items);

      // Auto-seed if empty
      if (snap.empty && items.length === 0) {
        const initialCanned = [
          { title: 'Greeting', text: 'Hello! How can I assist you today?', category: 'General', shortcut: 'hi', createdAt: Date.now() },
          { title: 'KYC Request', text: 'Please provide your NID front and back for verification.', category: 'Account', shortcut: 'kyc', createdAt: Date.now() },
          { title: 'Deposit Delay', text: 'We are experiencing a slight delay with bKash deposits. Please wait 15 mins.', category: 'Payment', shortcut: 'delay', createdAt: Date.now() }
        ];
        initialCanned.forEach(c => addDoc(collection(db, 'canned_responses'), c));
      }
    });

    return () => {
      unsubKB();
      unsubCanned();
    };
  }, []);

  // Selected Ticket Messages Listener
  useEffect(() => {
    if (!selectedTicket) {
      setMessages([]);
      setUserContext(null);
      setAiSuggestion(null);
      return;
    }

    // Fetch Messages
    const msgQuery = query(collection(db, `tickets/${selectedTicket.id}/messages`), orderBy('createdAt', 'asc'));
    const unsubMsg = onSnapshot(msgQuery, (snapshot: any) => {
      const msgsData: MessageItem[] = [];
      snapshot.forEach((doc: any) => {
        msgsData.push({ id: doc.id, ...doc.data() } as MessageItem);
      });
      setMessages(msgsData);
    });

    // Fetch User Context
    const fetchContext = async () => {
      try {
        const res = await fetch(`/api/support/user-context/${selectedTicket.userId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('bivax_token')}` }
        });
        const data = await res.json();
        if (!data.error) {
          setUserContext(data);
        }
      } catch (err) {
        console.error('Failed to fetch user context', err);
      }
    };
    fetchContext();

    // Trigger AI Suggestion
    const getAiSuggestion = async () => {
      if (selectedTicket.status === 'Resolved') return;
      setIsAiLoading(true);
      try {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.senderType === 'user') {
          const res = await fetch('/api/support/ai-chat', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('bivax_token')}`
            },
            body: JSON.stringify({ 
              userId: selectedTicket.userId, 
              message: lastMsg.text,
              mode: 'agentic'
            })
          });
          const data = await res.json();
          if (data.reply) {
            setAiSuggestion(data.reply);
          }
        }
      } catch (err) {
        console.error('AI Suggestion failed', err);
      } finally {
        setIsAiLoading(false);
      }
    };

    // Only get suggestion if the last message is from user
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.senderType === 'user' && !aiSuggestion) {
      getAiSuggestion();
    }

    return () => unsubMsg();
  }, [selectedTicket, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!replyText.trim() || !selectedTicket || isSending) return;
    setIsSending(true);

    const currentUser = auth.currentUser;
    const messageId = 'msg_' + Date.now();
    const messageData = {
      senderId: currentUser.uid,
      senderName: currentUser.displayName || 'Support Agent',
      senderType: 'agent',
      text: replyText,
      createdAt: Date.now(),
      isAdmin: true
    };

    try {
      await addDoc(collection(db, `tickets/${selectedTicket.id}/messages`), messageData);
      
      // Update ticket
      await updateDoc(doc(db, 'tickets', selectedTicket.id), {
        lastMessage: replyText,
        updatedAt: Date.now(),
        status: selectedTicket.status === 'Open' ? 'Pending' : selectedTicket.status
      });

      setReplyText('');
      setAiSuggestion(null);
      toast.success('Reply sent');
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleAddInternalNote = async () => {
    if (!internalNoteInput.trim() || !selectedTicket) return;
    
    try {
      const currentNotes = selectedTicket.internalNotes || [];
      await updateDoc(doc(db, 'tickets', selectedTicket.id), {
        internalNotes: [...currentNotes, internalNoteInput],
        updatedAt: Date.now()
      });
      setInternalNoteInput('');
      toast.success('Note added');
    } catch (err) {
      toast.error('Failed to add note');
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedTicket) return;
    const user = auth.currentUser;
    try {
      await updateDoc(doc(db, 'tickets', selectedTicket.id), {
        assignedAgentId: user.uid,
        assignedAgentName: user.displayName || 'Agent',
        status: 'Open',
        updatedAt: Date.now()
      });
      toast.success('Ticket assigned to you');
    } catch (err) {
      toast.error('Assignment failed');
    }
  };

  const handleEscalate = async () => {
    if (!selectedTicket) return;
    try {
      await updateDoc(doc(db, 'tickets', selectedTicket.id), {
        status: 'Escalated',
        priority: 'Urgent',
        updatedAt: Date.now()
      });
      toast.error('Ticket escalated');
    } catch (err) {
      toast.error('Escalation failed');
    }
  };

  const handleResolve = async () => {
    if (!selectedTicket) return;
    try {
      await updateDoc(doc(db, 'tickets', selectedTicket.id), {
        status: 'Resolved',
        updatedAt: Date.now()
      });
      toast.success('Ticket marked as resolved');
    } catch (err) {
      toast.error('Failed to resolve ticket');
    }
  };

  const stats = {
    totalOpen: tickets.filter(t => t.status === 'Open').length,
    activeChats: tickets.filter(t => t.status === 'Open' || t.status === 'Pending').length,
    resolved: tickets.filter(t => t.status === 'Resolved').length,
    escalated: tickets.filter(t => t.status === 'Escalated').length,
    resolutionRate: tickets.length > 0 ? Math.round((tickets.filter(t => t.status === 'Resolved').length / tickets.length) * 100) : 0,
    avgResponseTime: "1m 24s" // Mock for now, would need message timestamp diffs
  };

  const filteredTickets = tickets.filter(t => {
    const matchesSearch = (t.userName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
                          t.id.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t.userUid.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (t.userEmail?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    
    if (activeTab === 'open-tickets' && t.status !== 'Open') return false;
    if (activeTab === 'pending-tickets' && t.status !== 'Pending') return false;
    if (activeTab === 'resolved-tickets' && t.status !== 'Resolved') return false;
    if (activeTab === 'escalated-tickets' && t.status !== 'Escalated') return false;
    if (activeTab === 'assigned-me' && t.assignedAgentId !== auth.currentUser?.uid) return false;

    if (statusFilter !== 'All' && t.status !== statusFilter) return false;
    if (departmentFilter !== 'All' && t.department !== departmentFilter) return false;

    return matchesSearch;
  });


  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#0b0e11] text-gray-100' : 'bg-gray-50 text-gray-900'} flex font-sans`}>
      
      {/* Sidebar Navigation */}
      <aside className={`w-72 border-r ${isDarkMode ? 'bg-[#12161c] border-gray-800' : 'bg-white border-gray-200'} flex flex-col`}>
        <div className="p-5 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#f45c5c] to-[#ffb703] flex items-center justify-center shadow-lg">
              <Headphones className="text-white" size={22} />
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-wide text-white">BIVAAX ENTERPRISE</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Support Center v4.0</p>
            </div>
          </div>
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Overview</div>
          
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'dashboard' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>

          <div className="pt-4 px-3 pb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Tickets & Chats</div>

          <button 
            onClick={() => setActiveTab('live-chats')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'live-chats' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <div className="flex items-center gap-3"><MessageSquare size={18} /> Live Chats</div>
            <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full font-bold">12 Active</span>
          </button>

          <button 
            onClick={() => setActiveTab('open-tickets')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'open-tickets' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <div className="flex items-center gap-3"><Ticket size={18} /> Open Tickets</div>
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full font-bold">
              {tickets.filter(t => t.status === 'Open').length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab('pending-tickets')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'pending-tickets' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <Clock size={18} /> Pending Tickets
          </button>

          <button 
            onClick={() => setActiveTab('resolved-tickets')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'resolved-tickets' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <CheckCircle2 size={18} /> Resolved Tickets
          </button>

          <button 
            onClick={() => setActiveTab('escalated-tickets')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'escalated-tickets' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <div className="flex items-center gap-3"><ShieldAlert size={18} /> Escalated</div>
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full font-bold">
              {tickets.filter(t => t.status === 'Escalated').length}
            </span>
          </button>

          <button 
            onClick={() => setActiveTab('assigned-me')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'assigned-me' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <UserCheck size={18} /> Assigned to Me
          </button>

          <div className="pt-4 px-3 pb-2 text-[10px] font-black uppercase tracking-wider text-gray-400">Management & Tools</div>

          <button 
            onClick={() => setActiveTab('customers')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'customers' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <Users size={18} /> All Customers
          </button>

          <button 
            onClick={() => setActiveTab('knowledge-base')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'knowledge-base' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <BookOpen size={18} /> Knowledge Base
          </button>

          <button 
            onClick={() => setActiveTab('canned')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'canned' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <FileText size={18} /> Canned Responses
          </button>

          <button 
            onClick={() => setActiveTab('agents')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'agents' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <UserCheck size={18} /> Agent Management
          </button>

          <button 
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'reports' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <BarChart3 size={18} /> Reports & Analytics
          </button>

          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'settings' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            <Settings size={18} /> Settings
          </button>
        </div>

        <div className="p-4 border-t border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              AS
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Alex Support</h4>
              <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Online (Tier 2)
              </p>
            </div>
          </div>
          <a href="/trade" className="text-xs text-gray-400 hover:text-white font-bold px-2 py-1 bg-gray-800 rounded-lg">Exit</a>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Bar */}
        <header className={`h-16 border-b ${isDarkMode ? 'bg-[#12161c] border-gray-800' : 'bg-white border-gray-200'} px-6 flex items-center justify-between`}>
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-black tracking-tight text-white capitalize">{activeTab.replace('-', ' ')}</h2>
            <div className="flex items-center gap-2 bg-gray-800/60 px-3 py-1.5 rounded-xl border border-white/5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold text-gray-300">AI Support Assistant: <span className="text-emerald-400">Active</span></span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input 
                type="text"
                placeholder="Search tickets, UID, user name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-gray-800/60 border border-gray-700/60 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#f45c5c] w-72"
              />
            </div>

            <button className="relative p-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#f45c5c]"></span>
            </button>
          </div>
        </header>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Open Tickets</p>
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400"><Ticket size={20} /></div>
                  </div>
                  <h3 className="text-3xl font-black text-white mt-3">{stats.totalOpen}</h3>
                  <p className="text-xs text-emerald-400 mt-2 font-semibold">↑ 12% from yesterday</p>
                </div>

                <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Active Live Chats</p>
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><MessageSquare size={20} /></div>
                  </div>
                  <h3 className="text-3xl font-black text-white mt-3">{stats.activeChats}</h3>
                  <p className="text-xs text-emerald-400 mt-2 font-semibold">Real-time engagement</p>
                </div>

                <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Avg Response Time</p>
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400"><Clock size={20} /></div>
                  </div>
                  <h3 className="text-3xl font-black text-white mt-3">{stats.avgResponseTime}</h3>
                  <p className="text-xs text-emerald-400 mt-2 font-semibold">⚡ Exceeds SLA standard</p>
                </div>

                <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-5 shadow-lg">
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Resolution Rate</p>
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400"><CheckCircle2 size={20} /></div>
                  </div>
                  <h3 className="text-3xl font-black text-white mt-3">{stats.resolutionRate}%</h3>
                  <p className="text-xs text-emerald-400 mt-2 font-semibold">Closed successfully</p>
                </div>
              </div>

              {/* Tickets Table Overview */}
              <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-lg">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-black text-white">Recent Enterprise Support Tickets</h3>
                    <p className="text-xs text-gray-400">Managed priority queue across global trading desks</p>
                  </div>
                  <button onClick={() => setActiveTab('open-tickets')} className="text-xs font-bold text-[#f45c5c] hover:underline flex items-center gap-1">
                    View All Tickets <ChevronRight size={14} />
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs font-bold text-gray-400 uppercase">
                        <th className="pb-3 px-4">Ticket ID</th>
                        <th className="pb-3 px-4">Customer</th>
                        <th className="pb-3 px-4">Department</th>
                        <th className="pb-3 px-4">Priority</th>
                        <th className="pb-3 px-4">Status</th>
                        <th className="pb-3 px-4">Assigned Agent</th>
                        <th className="pb-3 px-4">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-sm">
                      {tickets.slice(0, 10).map(t => (
                        <tr key={t.id} onClick={() => { setSelectedTicket(t); setActiveTab('live-chats'); }} className="hover:bg-gray-800/40 cursor-pointer transition-colors group">
                          <td className="py-4 px-4 font-mono font-bold text-[#f45c5c]">{t.id}</td>
                          <td className="py-4 px-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-white group-hover:text-[#f45c5c] transition-colors">{t.userName}</span>
                              <span className="text-[10px] text-gray-500 font-mono tracking-tighter">{t.userUid}</span>
                            </div>
                          </td>
                          <td className="py-4 px-4 text-gray-300">{t.department}</td>
                          <td className="py-4 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              t.priority === 'Urgent' ? 'bg-red-500/20 text-red-400' :
                              t.priority === 'High' ? 'bg-amber-500/20 text-amber-400' : 
                              t.priority === 'Medium' ? 'bg-blue-500/20 text-blue-400' :
                              'bg-gray-700 text-gray-400'
                            }`}>{t.priority}</span>
                          </td>
                          <td className="py-4 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                              t.status === 'Open' ? 'bg-emerald-500/20 text-emerald-400' :
                              t.status === 'Escalated' ? 'bg-red-500/20 text-red-400' : 
                              t.status === 'Pending' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-gray-700 text-gray-300'
                            }`}>{t.status}</span>
                          </td>
                          <td className="py-4 px-4 text-gray-300 font-medium">{t.assignedAgentName || 'Unassigned'}</td>
                          <td className="py-4 px-4 text-gray-500 text-[10px]">{new Date(t.updatedAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* LIVE CHATS & TICKET DESK WORKSPACE */}
          {(activeTab === 'live-chats' || activeTab === 'open-tickets' || activeTab === 'pending-tickets' || activeTab === 'resolved-tickets' || activeTab === 'escalated-tickets' || activeTab === 'assigned-me') && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
              
              {/* Left Column: Ticket / Chat List */}
              <div className="lg:col-span-4 bg-[#161b22] border border-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-lg">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                  <h3 className="font-bold text-white text-sm">Conversations ({filteredTickets.length})</h3>
                  <select 
                    value={statusFilter} 
                    onChange={e => setStatusFilter(e.target.value)}
                    className="bg-gray-800 text-xs text-gray-300 border border-gray-700 rounded-lg px-2 py-1 focus:outline-none"
                  >
                    <option value="All">All Status</option>
                    <option value="Open">Open</option>
                    <option value="Pending">Pending</option>
                    <option value="Escalated">Escalated</option>
                  </select>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-gray-800">
                  {filteredTickets.map(t => (
                    <div 
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className={`p-4 cursor-pointer transition-all hover:bg-gray-800/50 ${selectedTicket?.id === t.id ? 'bg-[#f45c5c]/10 border-l-4 border-[#f45c5c]' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-sm text-white">{t.userName}</span>
                        <span className="text-[10px] text-gray-400">{new Date(t.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs text-gray-400 font-mono mb-2">{t.id} • {t.department}</p>
                      <p className="text-xs text-gray-300 truncate">{t.lastMessage || 'No messages'}</p>
                      <div className="flex gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.priority === 'Urgent' ? 'bg-red-500/20 text-red-400' : 'bg-gray-800 text-gray-400'}`}>{t.priority}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.status === 'Open' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Center Column: Real-time Chat Window */}
              <div className="lg:col-span-5 bg-[#161b22] border border-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-lg">
                {selectedTicket ? (
                  <>
                    {/* Chat Header */}
                    <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#12161c]">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#f45c5c] text-white flex items-center justify-center font-bold">
                          {(selectedTicket.userName || 'U').substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">{selectedTicket.userName}</h4>
                          <p className="text-xs text-gray-400">{selectedTicket.userUid} • {selectedTicket.userEmail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleAssignToMe} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors">
                          Assign to Me
                        </button>
                        <button onClick={handleEscalate} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors">
                          Escalate
                        </button>
                      </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      <div className="text-center">
                        <span className="px-3 py-1 rounded-full bg-gray-800 text-gray-400 text-[10px] font-bold">
                          Ticket Created: {new Date(selectedTicket.createdAt).toLocaleString()} • Department: {selectedTicket.department}
                        </span>
                      </div>

                      {messages.map(m => (
                        <div key={m.id} className={`flex flex-col ${m.senderType === 'agent' ? 'items-end' : 'items-start'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-bold text-gray-400">{m.senderName}</span>
                            <span className="text-[10px] text-gray-500">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className={`p-3 rounded-2xl max-w-[80%] text-sm ${
                            m.senderType === 'agent' ? 'bg-[#f45c5c] text-white rounded-br-none' : 
                            m.senderType === 'bot' ? 'bg-amber-500/20 text-amber-200 border border-amber-500/30' :
                            'bg-gray-800 text-gray-200 rounded-bl-none border border-white/5'
                          }`}>
                            {m.text}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* AI Suggested Response Banner for Agent */}
                    <AnimatePresence>
                      {aiSuggestion && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/20 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 text-xs text-amber-400">
                            <Sparkles size={14} className="animate-pulse" />
                            <span className="italic font-medium">AI Suggestion: "{aiSuggestion.length > 80 ? aiSuggestion.substring(0, 80) + '...' : aiSuggestion}"</span>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => setReplyText(aiSuggestion)}
                              className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold rounded uppercase tracking-wider"
                            >
                              Apply
                            </button>
                            <button onClick={() => setAiSuggestion(null)} className="p-1 text-gray-500 hover:text-gray-300"><X size={14} /></button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Chat Input */}
                    <div className="p-3 border-t border-gray-800 flex items-center gap-2 bg-[#12161c]">
                      <button className="p-2 text-gray-400 hover:text-white transition-colors"><Paperclip size={18} /></button>
                      <button className="p-2 text-gray-400 hover:text-white transition-colors"><Smile size={18} /></button>
                      <input 
                        type="text"
                        placeholder="Type your reply to customer..."
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        disabled={isSending}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#f45c5c] disabled:opacity-50"
                      />
                      <button 
                        onClick={handleSendMessage}
                        disabled={isSending || !replyText.trim()}
                        className="p-2.5 bg-[#f45c5c] hover:bg-[#e04848] text-white rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:grayscale"
                      >
                        {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                    Select a conversation from the left queue
                  </div>
                )}
              </div>

              {/* Right Column: Customer 360° Profile & Internal Notes */}
              <div className="lg:col-span-3 bg-[#161b22] border border-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-lg p-4 space-y-4">
                {selectedTicket ? (
                  <>
                    <div className="border-b border-gray-800 pb-3 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-sm text-white mb-0.5">Customer 360°</h4>
                        <p className="text-[10px] text-gray-400 font-mono tracking-tighter">{selectedTicket.userUid}</p>
                      </div>
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold ${userContext?.user?.kyc_status === 'verified' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {userContext?.user?.kyc_status?.toUpperCase() || 'UNKNOWN'}
                      </div>
                    </div>

                    <div className="space-y-2.5 text-[11px]">
                      <div className="flex justify-between py-1.5 border-b border-gray-800/30">
                        <span className="text-gray-400">Name</span>
                        <span className="font-bold text-white">{selectedTicket.userName}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-gray-800/30">
                        <span className="text-gray-400">Email</span>
                        <span className="font-bold text-white truncate max-w-[120px]">{selectedTicket.userEmail}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-gray-800/30">
                        <span className="text-gray-400">Account Type</span>
                        <span className="font-bold text-amber-400">Standard</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-gray-800/30">
                        <span className="text-gray-400">Real Balance</span>
                        <span className="font-bold text-emerald-400">${userContext?.user?.real_balance || '0.00'}</span>
                      </div>
                    </div>

                    {/* Recent Transactions Context */}
                    <div className="space-y-2 mt-2">
                      <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Recent Transactions</h5>
                      {userContext?.deposits?.length > 0 ? (
                        <div className="space-y-1.5">
                          {userContext.deposits.slice(0, 2).map((tx: any, i: number) => (
                            <div key={i} className="p-2 bg-gray-800/40 rounded-lg border border-white/5 flex justify-between items-center">
                              <div>
                                <p className="text-[10px] font-bold text-white">Deposit • {tx.method}</p>
                                <p className="text-[9px] text-gray-500">{new Date(tx.created_at).toLocaleDateString()}</p>
                              </div>
                              <span className="text-[10px] font-bold text-emerald-400">+${tx.amount}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-600 italic">No recent transactions</p>
                      )}
                    </div>

                    {/* Internal Notes Section */}
                    <div className="border-t border-gray-800 pt-3 flex-1 flex flex-col overflow-hidden">
                      <h4 className="font-bold text-xs text-white mb-2 flex items-center gap-2">
                        <Lock size={12} className="text-amber-400" /> Internal Notes
                      </h4>
                      <div className="flex-1 overflow-y-auto space-y-2 mb-3 pr-1 custom-scrollbar">
                        {selectedTicket.internalNotes?.length ? selectedTicket.internalNotes.map((note, idx) => (
                          <div key={idx} className="p-2.5 bg-gray-800/80 rounded-xl text-[11px] text-gray-300 border border-white/5 relative group">
                            {note}
                            <span className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 size={10} className="text-red-500 cursor-pointer" />
                            </span>
                          </div>
                        )) : (
                          <div className="text-[10px] text-gray-600 italic py-4 text-center bg-gray-800/20 rounded-xl border border-dashed border-gray-700">
                            No internal notes yet
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          placeholder="Private note..."
                          value={internalNoteInput}
                          onChange={e => setInternalNoteInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleAddInternalNote()}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-[10px] text-white focus:outline-none focus:border-amber-500"
                        />
                        <button onClick={handleAddInternalNote} className="px-3 bg-amber-500 hover:bg-amber-400 text-black rounded-lg text-[10px] font-black uppercase transition-colors">Add</button>
                      </div>
                    </div>

                    <button onClick={handleResolve} className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-900/20 transition-all flex items-center justify-center gap-2">
                      <CheckCheck size={14} /> Mark as Resolved
                    </button>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-center px-4">
                    <User size={32} className="opacity-10 mb-2" />
                    <p className="text-[10px]">No customer context available</p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* KNOWLEDGE BASE TAB */}
          {activeTab === 'knowledge-base' && (
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-lg space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white">Knowledge Base Articles</h3>
                  <p className="text-xs text-gray-400">Manage FAQ and automated RAG documentation for AI support</p>
                </div>
                <button className="px-4 py-2 bg-[#f45c5c] text-white rounded-xl text-xs font-bold shadow-lg">Add Article</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {knowledgeArticles.length > 0 ? knowledgeArticles.map((article, i) => (
                  <div key={i} className="p-5 bg-gray-800/40 border border-gray-700/60 rounded-2xl space-y-3">
                    <h4 className="font-bold text-white text-sm">{article.title}</h4>
                    <p className="text-xs text-gray-400 line-clamp-3">{article.content}</p>
                    <div className="flex justify-between items-center pt-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${article.status === 'Published' ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                        {article.status}
                      </span>
                      <button className="text-xs text-[#f45c5c] font-bold hover:underline">Edit</button>
                    </div>
                  </div>
                )) : (
                  <div className="col-span-3 text-center py-10 text-gray-500">No articles found. Sync articles to power AI Support.</div>
                )}
              </div>
            </div>
          )}

          {/* CANNED RESPONSES TAB */}
          {activeTab === 'canned' && (
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-lg space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white">Canned Responses</h3>
                  <p className="text-xs text-gray-400">Predefined templates for common customer queries</p>
                </div>
                <button className="px-4 py-2 bg-[#f45c5c] text-white rounded-xl text-xs font-bold shadow-lg">Create Template</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {cannedResponses.length > 0 ? cannedResponses.map((res, i) => (
                  <div key={i} className="p-4 bg-gray-800/40 border border-gray-700/60 rounded-2xl space-y-2">
                    <div className="flex justify-between">
                      <h4 className="font-bold text-white text-sm">{res.title}</h4>
                      <span className="text-[10px] text-gray-500 font-mono">/{res.shortcut}</span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 italic">"{res.text}"</p>
                    <div className="pt-2">
                      <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded font-bold">{res.category}</span>
                    </div>
                  </div>
                )) : (
                  <div className="col-span-3 text-center py-10 text-gray-500">No canned responses found.</div>
                )}
              </div>
            </div>
          )}

          {/* AGENT MANAGEMENT TAB */}
          {activeTab === 'agents' && (
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-lg space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white">Support Agent Management</h3>
                  <p className="text-xs text-gray-400">Configure agent tiers, departments, and permissions</p>
                </div>
                <button className="px-4 py-2 bg-[#f45c5c] text-white rounded-xl text-xs font-bold shadow-lg">Invite Agent</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-xs font-bold text-gray-400 uppercase">
                      <th className="pb-3 px-4">Agent Name</th>
                      <th className="pb-3 px-4">Role / Tier</th>
                      <th className="pb-3 px-4">Department</th>
                      <th className="pb-3 px-4">Status</th>
                      <th className="pb-3 px-4">Active Tickets</th>
                      <th className="pb-3 px-4">Rating</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 text-sm">
                    {[
                      { name: 'Alex Chen', role: 'Senior Support Lead', dept: 'All', status: 'Online', tickets: 4, rating: '4.95' },
                      { name: 'Sarah Jenkins', role: 'Support Agent', dept: 'Withdrawals', status: 'Online', tickets: 6, rating: '4.88' },
                      { name: 'Michael Vance', role: 'Support Agent', dept: 'Deposits', status: 'Busy', tickets: 2, rating: '4.90' },
                    ].map((agent, i) => (
                      <tr key={i} className="hover:bg-gray-800/40">
                        <td className="py-4 px-4 font-bold text-white">{agent.name}</td>
                        <td className="py-4 px-4 text-gray-300">{agent.role}</td>
                        <td className="py-4 px-4 text-gray-300">{agent.dept}</td>
                        <td className="py-4 px-4"><span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400 font-bold">{agent.status}</span></td>
                        <td className="py-4 px-4 text-gray-300">{agent.tickets}</td>
                        <td className="py-4 px-4 text-amber-400 font-bold">★ {agent.rating}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* REPORTS & ANALYTICS TAB */}
          {activeTab === 'reports' && (
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-lg space-y-6">
              <div>
                <h3 className="text-lg font-black text-white">Reports & Performance Analytics</h3>
                <p className="text-xs text-gray-400">Enterprise support SLA, ticket volume trends, and CSAT scores</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 bg-gray-800/40 border border-gray-700/60 rounded-2xl">
                  <h4 className="font-bold text-white text-sm mb-2">Weekly Ticket Volume</h4>
                  <p className="text-2xl font-black text-[#f45c5c]">1,842 tickets</p>
                  <p className="text-xs text-gray-400 mt-1">Peak hour: 14:00 - 18:00 UTC</p>
                </div>
                <div className="p-5 bg-gray-800/40 border border-gray-700/60 rounded-2xl">
                  <h4 className="font-bold text-white text-sm mb-2">First Response Time (FRT)</h4>
                  <p className="text-2xl font-black text-emerald-400">48 seconds</p>
                  <p className="text-xs text-gray-400 mt-1">AI automated first response</p>
                </div>
                <div className="p-5 bg-gray-800/40 border border-gray-700/60 rounded-2xl">
                  <h4 className="font-bold text-white text-sm mb-2">Resolution Rate</h4>
                  <p className="text-2xl font-black text-blue-400">96.4%</p>
                  <p className="text-xs text-gray-400 mt-1">Closed within 24 hours</p>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div className="bg-[#161b22] border border-gray-800 rounded-2xl p-6 shadow-lg space-y-6 max-w-2xl">
              <div>
                <h3 className="text-lg font-black text-white">Enterprise Support Settings</h3>
                <p className="text-xs text-gray-400">Configure AI Agent autonomy, working hours, and auto-assignment</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-800/40 rounded-xl border border-white/5">
                  <div>
                    <h4 className="font-bold text-white text-sm">AI First Responder</h4>
                    <p className="text-xs text-gray-400">Allow AI agent to answer incoming customer chats automatically</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-[#f45c5c]" />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-800/40 rounded-xl border border-white/5">
                  <div>
                    <h4 className="font-bold text-white text-sm">Desktop Push Notifications</h4>
                    <p className="text-xs text-gray-400">Play alert sound and show notification on new escalated tickets</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-[#f45c5c]" />
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-800/40 rounded-xl border border-white/5">
                  <div>
                    <h4 className="font-bold text-white text-sm">Auto-Assign Tickets</h4>
                    <p className="text-xs text-gray-400">Distribute incoming tickets evenly among online agents</p>
                  </div>
                  <input type="checkbox" defaultChecked className="w-5 h-5 accent-[#f45c5c]" />
                </div>
              </div>

              <button onClick={() => toast.success('Support settings saved')} className="px-6 py-2.5 bg-[#f45c5c] text-white font-bold rounded-xl text-sm shadow-lg">
                Save Changes
              </button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
