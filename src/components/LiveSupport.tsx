import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronDown, Send, Paperclip } from 'lucide-react';

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
    { text: "Hello! How can I help you today?", sender: 'bot', actions: ["Where to begin? 🤔", "Help with my payment", "Get a promocode 💰"] }
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
      const data = await response.json();
      // Parse the reply if it's a JSON string, which gemini might return
      let parsedReply;
      try {
        parsedReply = typeof data.reply === 'string' ? JSON.parse(data.reply) : data.reply;
      } catch (e) {
        parsedReply = { reply: data.reply, actions: [] };
      }
      
      setMessages(prev => [...prev, { text: parsedReply.reply, sender: 'bot', actions: parsedReply.actions }]);
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
      className="fixed inset-0 z-[1000] bg-white flex flex-col md:w-[400px] md:h-[600px] md:top-auto md:right-4 md:rounded-t-2xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="bg-[#1C1D22] text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {view === 'chat' && (
            <button onClick={() => setView('list')} className="p-1 hover:bg-white/10 rounded-full">
              <ChevronLeft size={24} />
            </button>
          )}
          <div>
            <h2 className="text-lg font-semibold">{view === 'list' ? 'Contact us' : 'Support Chat'}</h2>
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full">
          <ChevronDown size={24} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4 space-y-4">
        {view === 'list' ? (
          <div className="flex items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer" onClick={() => setView('chat')}>
            <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center text-white font-bold text-xl">🤖</div>
            <div className="flex-1">
              <p className="font-semibold text-gray-900">Support Bot</p>
              <p className="text-sm text-gray-500">Feel free to ask anything.</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className="space-y-2">
                <div className={`p-4 rounded-2xl max-w-[80%] ${m.sender === 'user' ? 'bg-[#1C1D22] text-white ml-auto' : 'bg-white text-gray-800 shadow-sm border'}`}>
                  {m.text}
                </div>
                {m.sender === 'bot' && m.actions && m.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {m.actions.map((action, j) => (
                      <button key={j} onClick={() => handleSendMessage(action)} className="px-4 py-2 bg-white border border-gray-300 rounded-full text-sm hover:bg-gray-100 transition-colors">
                        {action}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && <div className="p-4 bg-white rounded-2xl shadow-sm border max-w-[80%] text-gray-500">Bot is typing...</div>}
[diff_block_end]
          </>
        )}
      </div>

      {/* Footer */}
      {view === 'chat' && (
        <div className="p-4 border-t bg-white">
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-gray-600"><Paperclip size={24} /></button>
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(input)}
              placeholder="Type a message..." 
              className="flex-1 p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button onClick={() => handleSendMessage(input)} className="p-2 bg-[#1C1D22] text-white rounded-full hover:bg-black"><Send size={20} /></button>
          </div>
        </div>
      )}
    </motion.div>
  );
};
