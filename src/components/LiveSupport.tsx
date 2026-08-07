import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, X, Bot, Send, User } from 'lucide-react';

interface Message {
    id: string;
    text: string;
    sender: 'user' | 'bot';
    timestamp: Date;
}

const AGENTIC_SHORTCUTS = [
  "💰 Check my balance",
  "💳 Recent deposits",
  "📉 My trade history",
  "✅ Verification status",
  "🆘 Speak with human"
];

export const LiveSupport: React.FC<{ onClose: () => void, userId: string }> = ({ onClose, userId }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: "Hello! I am your Bivaax Agentic AI Specialist. I can check your balance, trades, and help with support. How can I assist you today?", sender: 'bot', timestamp: new Date() }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [supportMode, setSupportMode] = useState<'standard' | 'agentic'>('agentic');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    
    const newUserMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, newUserMsg]);
    setInputValue('');
    setIsTyping(true);

    // Call AI API
    try {
        const response = await fetch('/api/support/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                userId, 
                message: text,
                mode: supportMode
            })
        });
        
        const data = await response.json();
        
        const botResponse: Message = { 
            id: (Date.now() + 1).toString(), 
            text: data.reply || data.response || "Sorry, I am having trouble connecting right now.", 
            sender: 'bot', 
            timestamp: new Date() 
        };
        setMessages(prev => [...prev, botResponse]);

        if (data.transferToAgent) {
            const systemMsg: Message = {
                id: (Date.now() + 2).toString(),
                text: "Escalating to a senior human agent... 🎧",
                sender: 'bot',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, systemMsg]);
        }
    } catch (err) {
        console.error(err);
    } finally {
        setIsTyping(false);
    }
  };

  return (
    <div className="fixed inset-0 sm:inset-4 md:inset-10 z-[500] bg-[#121316] rounded-2xl flex flex-col shadow-2xl border border-[#3b3b3f] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#3b3b3f] bg-[#1e1e24]">
            <div className="flex items-center gap-3">
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white">
                    <ArrowLeft size={20} />
                </button>
                <div className="w-10 h-10 bg-[#FFD700] rounded-full flex items-center justify-center relative">
                    <Bot size={20} className="text-[#121316]" />
                    {supportMode === 'agentic' && (
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#1e1e24]"></div>
                    )}
                </div>
                <div className="flex flex-col">
                    <span className="font-bold text-white text-sm">Live Support</span>
                    <span className="text-[10px] text-gray-500 uppercase font-black tracking-widest">
                        {supportMode === 'agentic' ? 'Agentic Mode' : 'Standard Chat'}
                    </span>
                </div>
            </div>

            {/* Mode Toggle */}
            <div className="flex items-center gap-2 bg-[#121316] p-1 rounded-lg border border-white/5">
                <button 
                    onClick={() => setSupportMode('standard')}
                    className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${supportMode === 'standard' ? 'bg-[#3b3b3f] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    BASIC
                </button>
                <button 
                    onClick={() => setSupportMode('agentic')}
                    className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${supportMode === 'agentic' ? 'bg-[#f45c5c] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    AGENTIC
                </button>
            </div>

            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full text-white">
                <X size={20} />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map(msg => (
                <div key={msg.id} className={`flex items-start gap-2 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                    {msg.sender === 'bot' && (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${supportMode === 'agentic' ? 'bg-[#f45c5c]' : 'bg-[#3b3b3f]'}`}>
                            <Bot size={16} />
                        </div>
                    )}
                    <div className={`p-3 rounded-2xl max-w-[80%] ${msg.sender === 'user' ? 'bg-[#0091ff] text-white' : 'bg-[#2a2b30] text-gray-200 shadow-lg border border-white/5'}`}>
                        {msg.text}
                    </div>
                    {msg.sender === 'user' && <div className="w-8 h-8 rounded-full bg-[#3b3b3f] flex items-center justify-center text-white"><User size={16} /></div>}
                </div>
            ))}
            {isTyping && (
                <div className="flex items-start gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white animate-pulse ${supportMode === 'agentic' ? 'bg-[#f45c5c]' : 'bg-[#3b3b3f]'}`}>
                        <Bot size={16} />
                    </div>
                    <div className="p-3 rounded-2xl bg-[#2a2b30] text-gray-400 italic text-sm">
                        {supportMode === 'agentic' ? 'Agentic AI is reasoning...' : 'AI is typing...'}
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {/* Shortcuts */}
        <div className="p-4 flex gap-2 overflow-x-auto border-t border-[#3b3b3f] scrollbar-hide">
            {AGENTIC_SHORTCUTS.map(s => (
                <button 
                    key={s} 
                    onClick={() => handleSend(s)}
                    className="whitespace-nowrap px-4 py-2 border border-[#3b3b3f] rounded-full text-sm text-gray-300 hover:bg-[#3b3b3f] hover:text-[#FFD700] transition-colors bg-[#1e1e24]"
                >
                    {s}
                </button>
            ))}
        </div>

        {/* Input */}
        <div className="p-4 bg-[#1e1e24] border-t border-[#3b3b3f]">
            <div className="flex items-center gap-2 bg-[#2a2b30] rounded-full p-2">
                <input 
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend(inputValue)}
                    placeholder="Type a message..."
                    className="flex-1 bg-transparent px-4 py-2 text-white outline-none"
                />
                <button onClick={() => handleSend(inputValue)} className="p-2 bg-[#0091ff] text-white rounded-full">
                    <Send size={18} />
                </button>
            </div>
        </div>
    </div>
  );
};
