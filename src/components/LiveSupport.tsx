import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronDown, Send, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LiveSupportProps {
  onClose: () => void;
  userId: string;
}

interface Message {
  text: string;
  sender: 'user' | 'bot';
  actions?: string[];
}

export const LiveSupport: React.FC<LiveSupportProps> = ({ onClose, userId }) => {
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [messages, setMessages] = useState<Message[]>([
    { text: "Hello! I am your Bivaax Support Agent. How can I assist you today?", sender: 'bot', actions: ["Check my profile", "Deposit history", "Withdrawal status", "Verify my account"] }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    const newUserMessage: Message = { text, sender: 'user' };
    setMessages(prev => [...prev, newUserMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: text, 
          history: messages.map(m => ({ role: m.sender === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })) 
        }),
      });
      
      if (response.status === 401) {
        setMessages(prev => [...prev, { text: "Please log in to your account to use the support agent for account-related queries.", sender: 'bot', actions: ["Go to Login"] }]);
        return;
      }

      const data = await response.json();
      const parsedReply = data.reply;
      
      setMessages(prev => [...prev, { 
        text: parsedReply.reply || "I couldn't process that request properly.", 
        sender: 'bot', 
        actions: parsedReply.actions || [] 
      }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, { text: "দুঃখিত, বর্তমানে এআই সেবাটি পাওয়া যাচ্ছে না। দয়া করে কিছুক্ষণ পর আবার চেষ্টা করুন।", sender: 'bot' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      className="fixed inset-0 z-[1000] bg-white flex flex-col md:w-[450px] md:h-[650px] md:top-auto md:right-4 md:rounded-t-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="bg-[#1C1D22] text-white p-4 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          {view === 'chat' && (
            <button onClick={() => setView('list')} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <ChevronLeft size={24} />
            </button>
          )}
          <div>
            <h2 className="text-lg font-bold tracking-tight">{view === 'list' ? 'Contact Support' : 'Bivaax Agent'}</h2>
            {view === 'chat' && <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-widest">Online & Ready</p>}
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
          <ChevronDown size={24} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-[#F8F9FA] p-4 space-y-4">
        {view === 'list' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 p-5 bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:border-yellow-400 transition-all group" onClick={() => setView('chat')}>
              <div className="w-12 h-12 bg-[#1C1D22] rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg group-hover:scale-105 transition-transform">🤖</div>
              <div className="flex-1">
                <p className="font-bold text-gray-900">Professional AI Agent</p>
                <p className="text-xs text-gray-500">Check balance, transactions, and more.</p>
              </div>
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className={`p-4 rounded-2xl shadow-sm ${m.sender === 'user' ? 'bg-[#1C1D22] text-white ml-auto max-w-[85%]' : 'bg-white text-gray-800 border border-gray-100 max-w-[95%] prose prose-sm prose-slate max-w-none'}`}>
                  {m.sender === 'user' ? (
                    m.text
                  ) : (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
                {m.sender === 'bot' && m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 pb-2">
                    {m.actions.map((action, j) => (
                      <button 
                        key={j} 
                        onClick={() => handleSendMessage(action)} 
                        className="px-4 py-2 bg-white border border-gray-200 rounded-full text-xs font-semibold text-gray-700 hover:bg-yellow-400 hover:border-yellow-400 hover:text-black transition-all shadow-sm"
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 p-3 bg-white/50 rounded-2xl w-fit border border-gray-100 italic text-xs text-gray-400">
                <div className="flex gap-1">
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1 h-1 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
                Agent is thinking...
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {view === 'chat' && (
        <div className="p-4 border-t bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-[#1C1D22] transition-colors"><Paperclip size={20} /></button>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
              placeholder="How can I help with your account?" 
              className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:bg-white transition-all"
            />
            <button 
              onClick={() => handleSendMessage(input)} 
              disabled={!input.trim() || isLoading}
              className="p-3 bg-[#1C1D22] text-white rounded-xl hover:bg-black disabled:opacity-50 transition-all shadow-lg active:scale-95"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .markdown-content table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin: 8px 0;
        }
        .markdown-content th {
          background: #f1f1f1;
          padding: 8px 4px;
          text-align: left;
          border-bottom: 2px solid #ddd;
        }
        .markdown-content td {
          padding: 6px 4px;
          border-bottom: 1px solid #eee;
        }
        .markdown-content p {
          margin-bottom: 8px;
        }
        .markdown-content strong {
          color: #1a1a1a;
        }
      `}} />
    </motion.div>
  );
};
