import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, Users, Clock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { auth, db, onSnapshot, doc } from '../firebase';
import { formatWithCurrency, convertToBase } from '../lib/currencies';

interface TournamentDetail {
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
  isJoined: boolean;
}

interface Participant {
  user_id: string;
  score: number;
  rank: number;
  display_name: string;
  email?: string;
  photo_url: string;
}

interface Prize {
  rank_from: number;
  rank_to: number;
  prize_amount: number;
  prize_type: string;
}

export const TournamentDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [leaderboard, setLeaderboard] = useState<Participant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
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
    fetchTournamentDetails();
  }, [id]);

  const fetchTournamentDetails = async () => {
    try {
      setLoading(true);
      const uidQuery = auth.currentUser ? `?uid=${auth.currentUser.uid}` : '';
      const res = await fetch(`/api/tournaments/${id}${uidQuery}`);
      const data = await res.json();
      if (data.success) {
        setTournament(data.tournament);
        setLeaderboard(data.leaderboard || []);
        setPrizes(data.prizes || []);
      } else {
        toast.error(data.error || 'Failed to load tournament details');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error while loading tournament');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    try {
      if (!auth.currentUser) {
        toast.error('You must be logged in to join');
        return;
      }
      setJoining(true);
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`/api/tournaments/${id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Successfully joined tournament!');
        setTournament(prev => prev ? { ...prev, isJoined: true } : prev);
        fetchTournamentDetails(); // Refresh participants
      } else {
        toast.error(data.error || 'Failed to join tournament');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error joining tournament');
    } finally {
      setJoining(false);
    }
  };

  const formatTimeLeft = (targetTime: number) => {
    const diff = targetTime - currentTime;
    if (diff <= 0) return '00s';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1F2025] flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-[#1F2025] flex flex-col items-center justify-center text-white px-4">
        <AlertCircle size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold mb-2">Tournament Not Found</h2>
        <button onClick={() => navigate('/tournaments')} className="px-6 py-2 bg-yellow-500 text-black font-bold rounded-lg mt-4">Go Back</button>
      </div>
    );
  }

  const hasStarted = currentTime >= tournament.start_time;
  const isEnded = currentTime >= tournament.end_time;
  
  return (
    <div className="min-h-screen bg-[#1F2025] text-white font-sans overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#2A2C33] p-4 flex items-center justify-between border-b border-white/5 shadow-md">
         <div className="flex items-center gap-3">
           <button onClick={() => navigate('/tournaments')} className="p-2 hover:bg-white/5 rounded-full transition-colors">
             <ArrowLeft size={20} />
           </button>
           <h1 className="text-lg font-bold">{tournament.title}</h1>
         </div>
      </div>

      {/* Banner & Primary Info */}
      <div className="relative w-full h-64 md:h-80 bg-gray-900">
         <img src={tournament.banner_url} alt={tournament.title} className="w-full h-full object-cover opacity-60" />
         <div className="absolute inset-0 bg-gradient-to-t from-[#1F2025] via-[#1F2025]/50 to-transparent" />
         
         <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col md:flex-row justify-between items-end gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded text-xs font-bold uppercase tracking-wider mb-2 border border-yellow-500/30">
                 {tournament.type}
              </div>
              <h2 className="text-3xl font-black mb-1">{tournament.title}</h2>
              <div className="flex items-center gap-4 text-gray-300 text-sm">
                <span className="flex items-center gap-1.5"><Clock size={16} /> {hasStarted ? (isEnded ? 'Ended' : `Ends in ${formatTimeLeft(tournament.end_time)}`) : `Starts in ${formatTimeLeft(tournament.start_time)}`}</span>
                <span className="flex items-center gap-1.5"><Users size={16} /> {leaderboard.length}{tournament.max_players ? ` / ${tournament.max_players}` : ''} Players</span>
              </div>
            </div>
         </div>
      </div>

      {/* Main Content Grid */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Details & Action */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[#2A2C33] rounded-2xl p-6 border border-white/5 shadow-lg">
             <h3 className="text-gray-400 text-sm uppercase tracking-wider font-semibold mb-1">Prize Fund</h3>
             <div className="text-4xl font-black text-yellow-500 mb-6">
               {formatWithCurrency(convertToBase(tournament.prize_pool, 'BDT'), userCurrency)}
             </div>

             <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <div className="flex flex-col">
                    <span className="text-gray-400">Entry fee</span>
                    <span className="text-[10px] text-yellow-500/70 font-bold uppercase tracking-tight">Live Balance Required</span>
                  </div>
                  <span className="font-bold">{tournament.entry_fee > 0 ? formatWithCurrency(convertToBase(tournament.entry_fee, 'BDT'), userCurrency) : 'Free'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400">Status</span>
                  <span className="font-bold capitalize">{tournament.status}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-gray-400">Start Time</span>
                  <span className="font-bold">{new Date(tournament.start_time).toLocaleString()}</span>
                </div>
             </div>

             {tournament.isJoined ? (
               <div className="w-full py-4 bg-green-500/10 border border-green-500/20 text-green-500 font-bold rounded-xl flex items-center justify-center gap-2">
                 <CheckCircle2 size={20} />
                 Registered
               </div>
             ) : (
               <button 
                 onClick={handleJoin}
                 disabled={joining || isEnded || tournament.status !== 'scheduled'}
                 className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl text-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
               >
                 {joining ? <Loader2 className="animate-spin" size={20} /> : 'Join Tournament'}
               </button>
             )}
          </div>

          <div className="bg-[#2A2C33] rounded-2xl p-6 border border-white/5 shadow-lg">
             <h3 className="text-lg font-bold mb-4">About Tournament</h3>
             <p className="text-gray-300 leading-relaxed text-sm">
               {tournament.description}
             </p>
          </div>
        </div>

        {/* Right Column: Leaderboard & Prizes */}
        <div className="lg:col-span-2 space-y-6">
           <div className="bg-[#2A2C33] rounded-2xl p-6 border border-white/5 shadow-lg">
              <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
                <Trophy size={24} className="text-yellow-500" /> Leaderboard
              </h3>

              {leaderboard.length === 0 ? (
                <div className="text-center py-10 text-gray-500">
                  <Users size={48} className="mx-auto mb-3 opacity-20" />
                  <p>No participants yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-gray-400 text-sm border-b border-white/5">
                        <th className="pb-3 px-4 font-medium">Rank</th>
                        <th className="pb-3 px-4 font-medium">Trader</th>
                        <th className="pb-3 px-4 font-medium text-right">Score</th>
                        <th className="pb-3 px-4 font-medium text-right">Prize</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((p, idx) => {
                        const rank = idx + 1;
                        const prize = prizes.find(pz => rank >= pz.rank_from && rank <= pz.rank_to);
                        
                        return (
                        <tr key={p.user_id} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                          <td className="py-4 px-4">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm ${
                              idx === 0 ? 'bg-yellow-500 text-black' : 
                              idx === 1 ? 'bg-gray-300 text-black' : 
                              idx === 2 ? 'bg-[#CD7F32] text-black' : 
                              'bg-white/10 text-gray-400'
                            }`}>
                              {rank}
                            </span>
                          </td>
                          <td className="py-4 px-4 font-medium">
                             {p.display_name || p.email || p.user_id.substring(0, 8).toUpperCase()}
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-yellow-500">
                             {p.score.toLocaleString()}
                          </td>
                          <td className="py-4 px-4 text-right font-bold text-green-500">
                             {prize ? formatWithCurrency(convertToBase(prize.prize_amount, 'BDT'), userCurrency) : '-'}
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              )}
           </div>

           {prizes.length > 0 && (
             <div className="bg-[#2A2C33] rounded-2xl p-6 border border-white/5 shadow-lg">
                <h3 className="text-lg font-bold mb-4">Prizes</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {prizes.map((p, idx) => (
                    <div key={idx} className="bg-[#1F2025] p-4 rounded-xl border border-white/5 text-center">
                      <div className="text-gray-400 text-sm mb-1">
                        {p.rank_from === p.rank_to ? `Place ${p.rank_from}` : `Places ${p.rank_from} - ${p.rank_to}`}
                      </div>
                      <div className="text-xl font-bold text-yellow-500">
                        {formatWithCurrency(convertToBase(p.prize_amount, 'BDT'), userCurrency)}
                      </div>
                    </div>
                  ))}
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
