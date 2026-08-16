import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Loader2, Trophy } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db, onSnapshot, doc } from '../firebase';
import { formatWithCurrency, convertToBase } from '../lib/currencies';

interface Tournament {
  id: string;
  type: string;
  title: string;
  description: string;
  banner_url: string;
  prize_pool: number;
  entry_fee: number;
  min_players: number;
  max_players: number;
  start_time: number;
  end_time: number;
  status: string;
  is_locked: number;
  requirements: any;
  created_at: number;
  participantsCount: number;
  isJoined: boolean;
}

export const Tournaments: React.FC = () => {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [userCurrency, setUserCurrency] = useState(() => {
    try {
      return localStorage.getItem('user_display_currency') || 'BDT';
    } catch (e) {
      return 'BDT';
    }
  });

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        const userSub = onSnapshot(doc(db, 'users', user.uid), (userDoc) => {
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.currency) {
              setUserCurrency(data.currency);
              try {
                localStorage.setItem('user_display_currency', data.currency);
              } catch (e) {}
            }
          }
        });
        return () => userSub();
      }
    });
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      setLoading(true);
      const uidQuery = auth.currentUser ? `?uid=${auth.currentUser.uid}` : '';
      const res = await fetch(`/api/tournaments${uidQuery}`);
      const data = await res.json();
      if (data.success) {
        setTournaments(data.tournaments);
      } else {
        toast.error('Failed to load tournaments');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error while loading tournaments');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeLeft = (targetTime: number) => {
    const diff = targetTime - currentTime;
    if (diff <= 0) return '00s';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) return `${days.toString().padStart(2, '0')}d ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`;
    if (hours > 0) return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    return `${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="min-h-screen bg-[#2A2B31] text-white flex flex-col font-sans">
      {/* Header */}
      <div className="flex items-center px-4 py-4 bg-[#32343A] sticky top-0 z-20 shadow-md">
        <button onClick={() => navigate('/')} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors mr-2">
          <ArrowLeft size={20} className="text-gray-300" />
        </button>
        <h1 className="text-xl font-bold text-white tracking-wide">Tournaments</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-6">
        {loading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center text-gray-400 mt-10">
            <Trophy size={48} className="mx-auto mb-4 opacity-50" />
            <p>No tournaments available at the moment.</p>
          </div>
        ) : (
          tournaments.map((t) => {
            const hasStarted = currentTime >= t.start_time;
            const timeLabel = hasStarted ? 'Until end' : 'Until start';
            const targetTime = hasStarted ? t.end_time : t.start_time;
            const isLocked = t.is_locked === 1;

            return (
              <div key={t.id} className="bg-[#32343A] rounded-xl overflow-hidden shadow-lg border border-white/5 cursor-pointer hover:border-yellow-500/30 transition-colors" onClick={() => navigate(`/tournaments/${t.id}`)}>
                {/* Image Section */}
                <div className="relative h-40 w-full bg-gray-800">
                  <img src={t.banner_url} alt={t.title} className="w-full h-full object-cover opacity-80" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#32343A] via-transparent to-black/40"></div>
                  
                  {/* Top Header inside Image */}
                  <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                    <div>
                      <h2 className="text-2xl font-black text-white drop-shadow-md">{t.title}</h2>
                      <div className="mt-2 inline-flex bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded text-xs font-medium text-gray-200 border border-white/10">
                        {timeLabel}: {formatTimeLeft(targetTime)}
                      </div>
                    </div>
                    {isLocked && (
                      <div className="bg-black/50 p-2 rounded-full border border-white/10 backdrop-blur-sm">
                        <Lock size={16} className="text-white" />
                      </div>
                    )}
                  </div>
                  
                  {/* Progress Bar (if active) */}
                  {hasStarted && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
                       <div 
                         className="h-full bg-white transition-all duration-1000" 
                         style={{ width: `${Math.min(100, ((currentTime - t.start_time) / (t.end_time - t.start_time)) * 100)}%` }}
                       ></div>
                    </div>
                  )}
                </div>

                {/* Details Section */}
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Prize fund</p>
                    <div className="flex items-center gap-2">
                      <p className="text-yellow-500 font-bold text-xl">{formatWithCurrency(convertToBase(t.prize_pool, 'BDT'), userCurrency)}</p>
                      <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/20 font-black uppercase tracking-tighter">Live Only</span>
                    </div>
                  </div>
                  <button className="bg-[#FFDD33] hover:bg-[#F0C800] text-black font-bold py-2 px-5 rounded text-sm transition-colors shadow-sm">
                    Read more
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
