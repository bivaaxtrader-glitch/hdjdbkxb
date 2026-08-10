const fs = require('fs');
let content = fs.readFileSync('src/api/tournament.ts', 'utf-8');

const target = `export default router;`;

const newRoutes = `
// Register for tournament
router.post('/tournaments/:id/join', requireAuth, async (req: AuthRequest, res) => {
    try {
        const uid = req.user!.uid;
        const tournamentId = req.params.id;
        
        await transaction(async (conn) => {
            const tournament = await get('SELECT * FROM tournaments WHERE id = ?', [tournamentId], conn) as any;
            if (!tournament) throw new Error('Tournament not found');
            
            const existing = await get('SELECT * FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [tournamentId, uid], conn);
            if (existing) throw new Error('Already registered');
            
            const fee = parseFloat(tournament.entry_fee || '0');
            if (fee > 0) {
                const user = await get('SELECT real_balance FROM users WHERE uid = ?', [uid], conn) as any;
                const currentBalance = new Big(user.real_balance || 0);
                if (currentBalance.lt(fee)) {
                    throw new Error('Insufficient real balance for entry fee');
                }
                const newBalance = currentBalance.minus(fee).toFixed(2);
                await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, uid], conn);
            }
            
            await run('INSERT INTO tournament_participants (tournament_id, user_id, score, trades_count) VALUES (?, ?, ?, ?)', [tournamentId, uid, 10000.0, 0], conn);
            await run('UPDATE tournaments SET participants_count = participants_count + 1 WHERE id = ?', [tournamentId], conn);
        });
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// Get user active tournaments
router.get('/tournaments/user/active', requireAuth, async (req: AuthRequest, res) => {
    try {
        const uid = req.user!.uid;
        const active = await query('SELECT tp.* FROM tournament_participants tp JOIN tournaments t ON tp.tournament_id = t.id WHERE tp.user_id = ? AND t.status = ?', [uid, 'active']);
        res.json({ success: true, tournaments: active });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Tournament rebuy
router.post('/tournaments/:id/rebuy', requireAuth, async (req: AuthRequest, res) => {
    try {
        const uid = req.user!.uid;
        const tournamentId = req.params.id;
        
        await transaction(async (conn) => {
            const participant = await get('SELECT * FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [tournamentId, uid], conn) as any;
            if (!participant) throw new Error('Not registered in tournament');
            
            const fee = 200; // Fixed rebuy fee
            const user = await get('SELECT real_balance FROM users WHERE uid = ?', [uid], conn) as any;
            const currentBalance = new Big(user.real_balance || 0);
            if (currentBalance.lt(fee)) {
                throw new Error('Insufficient real balance for rebuy');
            }
            const newBalance = currentBalance.minus(fee).toFixed(2);
            await run('UPDATE users SET real_balance = ? WHERE uid = ?', [newBalance, uid], conn);
            
            await run('UPDATE tournament_participants SET score = 10000.0 WHERE tournament_id = ? AND user_id = ?', [tournamentId, uid], conn);
        });
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

export default router;`;

if (!content.includes('/tournaments/user/active')) {
  content = content.replace(target, newRoutes);
  fs.writeFileSync('src/api/tournament.ts', content);
  console.log("Patched tournament routes");
}
