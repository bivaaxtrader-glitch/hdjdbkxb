const fs = require('fs');
let content = fs.readFileSync('src/services/tradeService.ts', 'utf-8');

const target = `      // Update user balance if payout > 0
      if (payoutAmount.gt(0)) {
        const balanceField = isDemo ? 'demo_balance' : 'real_balance';
        // Lock user record
        const user = await get('SELECT ' + balanceField + ' FROM users WHERE uid = ?', [trade.user_id], conn) as any;
        const currentBalance = new Big(user[balanceField] || 0);
        const newBalance = currentBalance.plus(payoutAmount).toFixed(2);
        await run(\`UPDATE users SET \${balanceField} = ? WHERE uid = ?\`, [newBalance, trade.user_id], conn);
        
        if (!isDemo) {
          await createAuditLog(trade.user_id, 'trade_payout', 'trade', tradeId.toString(), { payoutAmount: payoutAmount.toNumber(), newBalance });
        }
      }

      if (!isDemo) {
        const profit = payoutAmount.minus(tradeAmount).toNumber();
        await updateLeaderboardStats(trade.user_id, newStatus as any, profit, tradeAmount.toNumber(), conn);
      }`;

const replacement = `      // Update user balance if payout > 0
      if (payoutAmount.gt(0)) {
        if (trade.account_type === 'tournament' && trade.tournament_id) {
           const participant = await get('SELECT score FROM tournament_participants WHERE tournament_id = ? AND user_id = ?', [trade.tournament_id, trade.user_id], conn) as any;
           if (participant) {
             const currentBalance = new Big(participant.score || 0);
             const newBalance = currentBalance.plus(payoutAmount).toFixed(2);
             await run(\`UPDATE tournament_participants SET score = ? WHERE tournament_id = ? AND user_id = ?\`, [newBalance, trade.tournament_id, trade.user_id], conn);
           }
        } else {
           const balanceField = (trade.is_demo || trade.account_type === 'demo') ? 'demo_balance' : 'real_balance';
           // Lock user record
           const user = await get('SELECT ' + balanceField + ' FROM users WHERE uid = ?', [trade.user_id], conn) as any;
           if (user) {
               const currentBalance = new Big(user[balanceField] || 0);
               const newBalance = currentBalance.plus(payoutAmount).toFixed(2);
               await run(\`UPDATE users SET \${balanceField} = ? WHERE uid = ?\`, [newBalance, trade.user_id], conn);
               
               if (!trade.is_demo && trade.account_type !== 'demo' && trade.account_type !== 'tournament') {
                 await createAuditLog(trade.user_id, 'trade_payout', 'trade', tradeId.toString(), { payoutAmount: payoutAmount.toNumber(), newBalance });
               }
           }
        }
      }

      if (!trade.is_demo && trade.account_type !== 'demo' && trade.account_type !== 'tournament') {
        const profit = payoutAmount.minus(tradeAmount).toNumber();
        await updateLeaderboardStats(trade.user_id, newStatus as any, profit, tradeAmount.toNumber(), conn);
      }`;

if (!content.includes('if (trade.account_type === \'tournament\' && trade.tournament_id)')) {
  content = content.replace(target, replacement);
  fs.writeFileSync('src/services/tradeService.ts', content);
  console.log("Patched tradeService");
} else {
  console.log("Already patched");
}
