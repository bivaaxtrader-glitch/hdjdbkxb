import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  ChevronLeft, 
  ChevronDown, 
  Send, 
  Paperclip, 
  Headphones, 
  MessageCircle, 
  Plus, 
  Image as ImageIcon, 
  Clock, 
  CheckCheck, 
  User, 
  ShieldCheck,
  Trash2,
  ExternalLink,
  MessageSquare,
  Zap
} from 'lucide-react';
import { 
  db, 
  auth, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  getDoc
} from '../firebase';
import { toast } from 'react-hot-toast';
import { useI18n } from '../context/I18nContext';
import { useTranslation } from '../lib/translations';

interface LiveSupportProps {
  onClose: () => void;
  userId: string;
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

export const LiveSupport: React.FC<LiveSupportProps> = ({ onClose, userId }) => {
  const [view, setView] = useState<'list' | 'chat' | 'new'>('list');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newCategory, setNewCategory] = useState('General');
  const [attachedFiles, setAttachedFiles] = useState<string[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { language } = useI18n();
  const { t } = useTranslation(language);

  const [socialLinks, setSocialLinks] = useState({
    whatsapp: 'https://wa.me/message/BIVAAX',
    telegram: 'https://t.me/Bivaax_Official'
  });

  useEffect(() => {
    const fetchLinks = async () => {
      try {
        const snap = await getDoc(doc(db, 'app_config', 'settings'));
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

  const currentUser = auth.currentUser;
  const currentUid = currentUser?.uid || userId || 'guest_user';
  const currentUserName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Trader';
  const currentUserEmail = currentUser?.email || '';

  // Listen to user's tickets in real-time
  useEffect(() => {
    if (!currentUid) return;

    try {
      const q = query(
        collection(db, 'tickets'),
        where('userId', '==', currentUid)
      );

      const unsub = onSnapshot(q, (snapshot) => {
        const ticketList: SupportTicket[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        } as SupportTicket));

        // Sort by updatedAt descending
        ticketList.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
        setTickets(ticketList);

        // If there's an active ticket, keep it synced
        if (activeTicket) {
          const updated = ticketList.find(t => t.id === activeTicket.id);
          if (updated) setActiveTicket(updated);
        }
      }, (error) => {
        console.warn("Tickets snapshot error:", error);
      });

      return () => unsub();
    } catch (e) {
      console.error("Failed to subscribe to tickets:", e);
    }
  }, [currentUid, activeTicket?.id]);

  // Listen to messages for the active ticket in real-time
  useEffect(() => {
    if (!activeTicket?.id) {
      setMessages([]);
      return;
    }

    try {
      const q = query(
        collection(db, 'tickets', activeTicket.id, 'messages'),
        orderBy('createdAt', 'asc')
      );

      const unsub = onSnapshot(q, (snapshot) => {
        const msgList: TicketMessage[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        } as TicketMessage));
        setMessages(msgList);
      }, (error) => {
        console.warn("Messages snapshot error:", error);
      });

      return () => unsub();
    } catch (e) {
      console.error("Failed to subscribe to ticket messages:", e);
    }
  }, [activeTicket?.id]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, view]);

  // Open a specific ticket chat
  const handleOpenTicket = (ticket: SupportTicket) => {
    setActiveTicket(ticket);
    setView('chat');
  };

  // Handle file attachment selection (e.g., screenshots)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be under 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setAttachedFiles(prev => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Start a new chat ticket
  const handleCreateNewChat = async () => {
    if (!inputMessage.trim() && attachedFiles.length === 0) {
      toast.error("Please enter a message to begin");
      return;
    }

    setIsSending(true);
    try {
      const subject = newSubject.trim() || `${newCategory} Inquiry - ${new Date().toLocaleDateString()}`;
      const now = Date.now();

      const ticketData = {
        userId: currentUid,
        userName: currentUserName,
        userEmail: currentUserEmail,
        subject: subject,
        category: newCategory,
        status: 'open',
        lastMessage: inputMessage.trim() || 'Attached files',
        createdAt: now,
        updatedAt: now
      };

      const ticketRef = await addDoc(collection(db, 'tickets'), ticketData);
      const ticketId = ticketRef.id;

      // Add the initial message
      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        ticketId: ticketId,
        senderId: currentUid,
        senderName: currentUserName,
        senderType: 'user',
        isAdmin: false,
        text: inputMessage.trim(),
        attachments: attachedFiles,
        createdAt: now
      });

      const newTicket: SupportTicket = {
        id: ticketId,
        ...ticketData
      };

      setActiveTicket(newTicket);
      setInputMessage('');
      setAttachedFiles([]);
      setNewSubject('');
      setView('chat');
      toast.success("Support conversation started!");
    } catch (error) {
      console.error("Error creating support chat:", error);
      toast.error("Could not start conversation. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  // Send a message inside the active ticket chat
  const handleSendMessage = async () => {
    if (!activeTicket?.id) return;
    if (!inputMessage.trim() && attachedFiles.length === 0) return;

    setIsSending(true);
    const textToSend = inputMessage.trim();
    const attachmentsToSend = [...attachedFiles];
    const now = Date.now();

    setInputMessage('');
    setAttachedFiles([]);

    try {
      // 1. Add message to subcollection
      await addDoc(collection(db, 'tickets', activeTicket.id, 'messages'), {
        ticketId: activeTicket.id,
        senderId: currentUid,
        senderName: currentUserName,
        senderType: 'user',
        isAdmin: false,
        text: textToSend,
        attachments: attachmentsToSend,
        createdAt: now
      });

      // 2. Update ticket status & timestamp
      await updateDoc(doc(db, 'tickets', activeTicket.id), {
        lastMessage: textToSend || (attachmentsToSend.length > 0 ? 'Sent an attachment' : ''),
        updatedAt: now,
        status: 'open'
      });
    } catch (error) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
      // Restore input on failure
      setInputMessage(textToSend);
      setAttachedFiles(attachmentsToSend);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 100, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 100, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[1000] bg-white flex flex-col md:w-[460px] md:h-[680px] md:top-auto md:bottom-6 md:right-6 md:rounded-3xl shadow-[0_25px_70px_rgba(0,0,0,0.4)] border border-gray-200 overflow-hidden font-sans"
    >
      {/* Top Navigation Bar */}
      <div className="bg-[#181920] text-white px-5 py-4 flex items-center justify-between shadow-md select-none shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3 min-w-0">
          {view !== 'list' && (
            <button 
              onClick={() => {
                setView('list');
                setActiveTicket(null);
                setAttachedFiles([]);
              }} 
              className="p-1.5 -ml-1 text-gray-300 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
            >
              <ChevronLeft size={22} />
            </button>
          )}
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FFE24C] to-[#E5CB44] text-black flex items-center justify-center font-black shadow-md shrink-0">
            <Headphones size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black tracking-tight text-white truncate">
              {view === 'list' ? t('supportDesk') : (activeTicket?.subject || t('liveChat'))}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-bold text-gray-300 tracking-wide">
                {view === 'chat' ? 'Support Agent Connected' : '24/7 Live Agents Online'}
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={onClose} 
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-all"
        >
          <ChevronDown size={22} />
        </button>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#F4F6F9] overflow-hidden">
        
        {/* VIEW 1: Ticket / Conversation List */}
        {view === 'list' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            
            {/* Primary Action Card: Chat with Live Support */}
            <div 
              onClick={() => {
                if (tickets.length > 0) {
                  // If there's an open ticket, jump to the most recent one or allow starting new
                  handleOpenTicket(tickets[0]);
                } else {
                  setView('new');
                }
              }}
              className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:border-[#FFE24C] hover:shadow-md cursor-pointer transition-all group relative overflow-hidden"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#181920] text-[#FFE24C] flex items-center justify-center text-xl shadow-lg group-hover:scale-105 transition-transform shrink-0">
                  <Headphones size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-gray-900 group-hover:text-black transition-colors">
                      Direct Live Support
                    </h3>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                      Online
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    Message our support team directly. Get fast assistance with deposits, withdrawals, and account inquiries.
                  </p>
                </div>
              </div>
            </div>

            {/* Start New Chat Button */}
            <button 
              onClick={() => {
                setView('new');
                setInputMessage('');
                setAttachedFiles([]);
              }}
              className="w-full py-3.5 px-4 bg-[#FFE24C] hover:bg-[#F0D544] text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <Plus size={16} strokeWidth={3} />
              {t('startNewChat')}
            </button>

            {/* Social Shortcuts */}
            <div className="grid grid-cols-2 gap-3">
              <a 
                href={socialLinks.whatsapp}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-3 px-4 bg-[#25D366] text-white rounded-2xl shadow-sm hover:opacity-90 transition-all font-bold text-[11px] uppercase tracking-wide"
              >
                <MessageSquare size={16} /> WhatsApp
              </a>
              <a 
                href={socialLinks.telegram}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-3 px-4 bg-[#0088CC] text-white rounded-2xl shadow-sm hover:opacity-90 transition-all font-bold text-[11px] uppercase tracking-wide"
              >
                <Send size={16} /> Telegram
              </a>
            </div>

            {/* Quick Question Shortcuts */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
                <Zap size={12} className="text-amber-400 fill-amber-400" /> {t('quickShortcuts')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: t('depositIssue'), msg: "I have an issue with my deposit. It's not reflecting." },
                  { label: t('withdrawalStatus'), msg: "I want to check my withdrawal status." },
                  { label: t('verificationHelp'), msg: "I need help with my account verification." },
                  { label: t('howToTrade'), msg: "Can you explain how to start trading?" }
                ].map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setView('new');
                      setInputMessage(item.msg);
                      setNewSubject(item.label);
                    }}
                    className="px-3 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-[10px] font-bold rounded-xl border border-gray-100 transition-all active:scale-95"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Past / Ongoing Conversations */}
            <div className="pt-2">
              <h4 className="text-[11px] font-black uppercase tracking-wider text-gray-400 px-1 mb-2">
                Your Support Conversations ({tickets.length})
              </h4>

              {tickets.length === 0 ? (
                <div className="bg-white rounded-2xl p-6 text-center border border-gray-100 text-gray-400">
                  <MessageCircle size={32} className="mx-auto mb-2 opacity-30 text-gray-500" />
                  <p className="text-xs font-bold text-gray-600">No previous support chats</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Click the button above to send a direct message to our team.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {tickets.map((t) => {
                    const isOpen = t.status === 'open' || t.status === 'Open';
                    const isPending = t.status === 'pending' || t.status === 'Pending';
                    const isResolved = t.status === 'resolved' || t.status === 'Resolved';
                    return (
                      <div
                        key={t.id}
                        onClick={() => handleOpenTicket(t)}
                        className="p-4 bg-white rounded-2xl border border-gray-100 hover:border-gray-300 hover:shadow-sm cursor-pointer transition-all"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <h5 className="font-bold text-xs text-gray-900 truncate flex-1">
                            {t.subject || 'Support Conversation'}
                          </h5>
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 ${
                            isOpen ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                            isPending ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                            isResolved ? 'bg-gray-100 text-gray-500' :
                            'bg-amber-50 text-amber-600 border border-amber-200'
                          }`}>
                            {t.status || 'open'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 line-clamp-1 leading-relaxed">
                          {t.lastMessage || 'No messages yet'}
                        </p>
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                          <span className="font-medium">{t.category || 'General'}</span>
                          <span>{new Date(t.updatedAt || t.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* VIEW 2: Start New Conversation Form */}
        {view === 'new' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar bg-white">
            <div>
              <h3 className="text-base font-black text-gray-900 tracking-tight">{t('howCanWeHelp')}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{t('describeQuery')}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1 block">{t('category')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {['Deposit & Payment', 'Withdrawal', 'Account & KYC', 'Trading / General'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setNewCategory(cat)}
                      className={`p-2.5 rounded-xl text-xs font-bold border transition-all text-left truncate ${
                        newCategory === cat
                          ? 'bg-[#181920] text-[#FFE24C] border-[#181920] shadow-sm'
                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1 block">{t('subjectOptional')}</label>
                <input
                  type="text"
                  placeholder="e.g. Deposit confirmation / Payment query"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFE24C] focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider mb-1 block">{t('yourMessage')}</label>
                <textarea
                  rows={4}
                  placeholder="Write your message here in detail..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFE24C] focus:bg-white transition-all font-medium resize-none leading-relaxed"
                />
              </div>

              {/* Attachments preview */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} className="relative group w-16 h-16 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                      <img src={file} alt="attachment" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="image/*" 
                  multiple 
                  className="hidden" 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl flex items-center gap-2 transition-all"
                >
                  <ImageIcon size={16} />
                  {t('attachScreenshot')}
                </button>
              </div>

              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleCreateNewChat}
                  disabled={isSending || (!inputMessage.trim() && attachedFiles.length === 0)}
                  className="w-full py-3.5 bg-[#FFE24C] hover:bg-[#F0D544] disabled:opacity-50 text-black font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Send size={16} />
                  {isSending ? 'Sending...' : t('sendMessage')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 3: Live Chat Box with Admin */}
        {view === 'chat' && activeTicket && (
          <>
            {/* Chat Messages List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#F8F9FB] custom-scrollbar">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-2 shadow-sm text-gray-400">
                    <Headphones size={26} />
                  </div>
                  <p className="text-xs font-bold text-gray-700">Connecting with Support Desk...</p>
                  <p className="text-[11px] text-gray-400 mt-1 max-w-xs">
                    Send your message below. A support representative will respond to you live.
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isStaff = msg.senderType === 'support' || msg.senderType === 'agent' || msg.isAdmin;
                  return (
                    <div 
                      key={`msg-${idx}-${msg.id || idx}`}
                      className={`flex ${isStaff ? 'justify-start' : 'justify-end'}`}
                    >
                      <div className={`max-w-[85%] rounded-2xl p-3.5 shadow-sm ${
                        isStaff 
                          ? 'bg-white text-gray-900 border border-gray-200/80 rounded-tl-none' 
                          : 'bg-[#181920] text-white rounded-tr-none'
                      }`}>
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                            isStaff ? 'text-amber-600' : 'text-[#FFE24C]'
                          }`}>
                            {isStaff && <ShieldCheck size={12} />}
                            {isStaff ? (msg.senderName || 'Support Agent') : 'You'}
                          </span>
                          <span className={`text-[9px] ${isStaff ? 'text-gray-400 font-medium' : 'text-gray-400'}`}>
                            {new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <p className="text-xs leading-relaxed whitespace-pre-wrap font-medium">
                          {msg.text || msg.message}
                        </p>

                        {/* Image Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {msg.attachments.map((att, aIdx) => (
                              <a 
                                key={aIdx} 
                                href={att} 
                                target="_blank" 
                                rel="noreferrer"
                                className="block rounded-xl overflow-hidden border border-black/10 hover:opacity-90 transition-opacity"
                              >
                                <img src={att} alt="attachment" className="w-28 h-28 object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Attachments Preview before send */}
            {attachedFiles.length > 0 && (
              <div className="px-4 py-2 bg-white border-t border-gray-100 flex items-center gap-2 overflow-x-auto">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="relative group w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shrink-0">
                    <img src={file} alt="preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(idx)}
                      className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Chat Input Bar */}
            <div className="p-3.5 bg-white border-t border-gray-200 shadow-sm shrink-0">
              <div className="flex items-center gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="image/*" 
                  multiple 
                  className="hidden" 
                />
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-gray-400 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all"
                  title="Attach Screenshot"
                >
                  <Paperclip size={18} />
                </button>
                <input 
                  type="text" 
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type your message to support..." 
                  className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFE24C] focus:bg-white transition-all font-medium"
                />
                <button 
                  onClick={handleSendMessage} 
                  disabled={isSending || (!inputMessage.trim() && attachedFiles.length === 0)}
                  className="p-2.5 bg-[#FFE24C] hover:bg-[#F0D544] disabled:opacity-40 disabled:grayscale text-black rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center font-bold"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </motion.div>
  );
};
