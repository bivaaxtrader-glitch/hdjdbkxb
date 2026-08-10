const fs = require('fs');
let content = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf-8');

// 1. Patch `handleRegisterTournament`
const registerRegex = /const handleRegisterTournament = async \(tournament: any\) => \{.*?toast\.error\("Registration failed\. Please try again\."\);\s*\}\s*\};/s;
const registerNewBlock = `const handleRegisterTournament = async (tournament: any) => {
    if (!auth.currentUser) return;
    
    try {
        const token = await auth.currentUser.getIdToken();
        const res = await fetch(\`/api/tournaments/\${tournament.id}/join\`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${token}\`
            }
        });
        
        const data = await res.json();
        
        if (data.success) {
            setUserRegistrations(prev => [...prev, tournament.id]);
            setActiveTournamentId(tournament.id);
            setAccountType("tournament");
            setTournamentBalance(10000.0);
            toast.success(\`Registered successfully! Switched to "\${tournament.title}" Tournament Trading.\`);
            
            // Re-sync user to update real balance
            const syncRes = await fetch('/api/user/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: auth.currentUser?.uid })
            });
            if (syncRes.ok) {
                const syncData = await syncRes.json();
                if (syncData.user) {
                    setRealBalance(syncData.user.real_balance);
                }
            }
        } else {
            toast.error(data.error || "Registration failed. Please try again.");
        }
    } catch (error) {
        console.error("Registration failed:", error);
        toast.error("Registration failed. Please try again.");
    }
  };`;

content = content.replace(registerRegex, registerNewBlock);

// 2. Patch `fetchRegistrations`
const syncRegex = /const \[activeTournamentId.*?fetchRegistrations\(\);\s*\}, \[currentUser\?\.uid, tournamentsData\]\);/s;
const syncNewBlock = `const [activeTournamentId, setActiveTournamentId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('bivax_active_tournament_id') || null;
    } catch(e) { return null; }
  });
  useEffect(() => {
    try {
      if (activeTournamentId) {
        localStorage.setItem('bivax_active_tournament_id', activeTournamentId);
      } else {
        localStorage.removeItem('bivax_active_tournament_id');
      }
    } catch(e) {}
  }, [activeTournamentId]);

  const [tournamentBalance, setTournamentBalance] = useState(10000.0);
  useEffect(() => {
    userRegistrationsRef.current = userRegistrations;
  }, [userRegistrations]);

  useEffect(() => {
    if (!currentUser?.uid || tournamentsData.length === 0) {
      setUserRegistrations(prev => prev.length === 0 ? prev : []);
      return;
    }
    
    const fetchRegistrations = async () => {
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch('/api/tournaments/user/active', {
          headers: { 'Authorization': \`Bearer \${token}\` }
        });
        const data = await res.json();
        
        if (data.success && data.tournaments) {
          const registeredIds = data.tournaments.map((t: any) => t.tournament_id);
          setUserRegistrations(prev => {
            if (prev.length === registeredIds.length && prev.every((id, idx) => id === registeredIds[idx])) {
              return prev;
            }
            return registeredIds;
          });
          
          const activeTournamentIdStr = localStorage.getItem('bivax_active_tournament_id') || null;
          if (activeTournamentIdStr) {
            const currentT = data.tournaments.find((t: any) => t.tournament_id === activeTournamentIdStr);
            if (currentT && currentT.score !== undefined) {
               setTournamentBalance(currentT.score);
            }
          }
        }
      } catch (err) {
        console.warn("Participant fetch error:", err);
      }
    };
    
    fetchRegistrations();
  }, [currentUser?.uid, tournamentsData]);`;

content = content.replace(syncRegex, syncNewBlock);

// 3. Patch `fetchBalance` duplicate
const duplicateFetchBalance = /useEffect\(\(\) => \{\s*if \(\!currentUser\?\.uid \|\| \!activeTournamentId\) return;\s*const fetchBalance = async \(\) => \{\s*try \{\s*const participantRef = doc\(db, 'tournaments', activeTournamentId, 'participants', currentUser\.uid\);\s*const snap = await getDoc\(participantRef\);\s*if \(snap\.exists\(\)\) \{\s*setTournamentBalance\(snap\.data\(\)\.score \|\| 1000\.0\);\s*\}\s*\} catch \(err\) \{\s*console\.warn\("Error fetching tournament balance:", err\);\s*\}\s*\};\s*fetchBalance\(\);\s*\}, \[currentUser\?\.uid, activeTournamentId\]\);/s;

content = content.replace(duplicateFetchBalance, '');

// 4. Patch Rebuy button logic
const rebuyRegex = /onClick=\{async \(e\) => \{.*?e\.stopPropagation\(\);.*?const rebuyFee = 200;.*?if \(realBalance < rebuyFee\) \{.*?toast\.error\("Insufficient real balance for a tournament Rebuy!"\);.*?return;.*?\}\s*try \{\s*import\('\.\.\/firebase'\)\.then\(async \(\{ doc, updateDoc, increment \}\) => \{.*?const userDocRef = doc\(db, 'users', auth\.currentUser!\.uid\);.*?const participantDocRef = doc\(db, 'tournaments', activeTournamentId, 'participants', auth\.currentUser!\.uid\);.*?await updateDoc\(userDocRef, \{ balance: increment\(-rebuyFee\) \}\);.*?await updateDoc\(participantDocRef, \{ score: 1000 \}\);.*?setRealBalance\(prev => prev - rebuyFee\);.*?setTournamentBalance\(1000\.0\);.*?toast\.success\("Tournament Rebuy successful! Balance reset to \\$1,000\."\);.*?\}\);\s*\} catch \(err\) \{.*?console\.error\("Rebuy failed:", err\);.*?toast\.error\("Rebuy failed\. Please try again\."\);.*?\}\s*\}\}/s;

const rebuyNewBlock = `onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const token = await auth.currentUser?.getIdToken();
                          const res = await fetch(\`/api/tournaments/\${activeTournamentId}/rebuy\`, {
                            method: 'POST',
                            headers: { 'Authorization': \`Bearer \${token}\` }
                          });
                          const data = await res.json();
                          if (data.success) {
                            // Re-fetch balances or deduct manually
                            setTournamentBalance(10000.0);
                            toast.success("Tournament Rebuy successful! Balance reset to $10,000.");
                            
                            // Re-sync user to update real balance
                            const syncRes = await fetch('/api/user/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ uid: auth.currentUser?.uid })
                            });
                            if (syncRes.ok) {
                              const syncData = await syncRes.json();
                              if (syncData.user) {
                                setRealBalance(syncData.user.real_balance);
                              }
                            }
                          } else {
                            toast.error(data.error || "Rebuy failed");
                          }
                        } catch (err) {
                          console.error("Rebuy failed:", err);
                          toast.error("Rebuy failed. Please try again.");
                        }
                      }}`;

content = content.replace(rebuyRegex, rebuyNewBlock);

fs.writeFileSync('src/pages/TradeTerminal.tsx', content);
