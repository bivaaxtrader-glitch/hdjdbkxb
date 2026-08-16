
import os

file_path = 'src/services/tradeService.ts'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    new_lines.append(line)
    if 'await run(`UPDATE users SET ${balanceField} = ? WHERE uid = ?`, [newBalance, trade.user_id], conn);' in line:
        indent = line[:line.find('await')]
        new_lines.append(f"{indent}\n")
        new_lines.append(f"{indent}// Sync to Firestore immediately and notify UI\n")
        new_lines.append(f"{indent}try {{\n")
        new_lines.append(f"{indent}  const {{ syncUserToFirestore }} = await import('../lib/firebase-admin.ts');\n")
        new_lines.append(f"{indent}  const {{ mapUserForFrontend }} = await import('../lib/user-utils.ts');\n")
        new_lines.append(f"{indent}  const updatedUser = await get('SELECT * FROM users WHERE uid = ?', [trade.user_id], conn) as any;\n")
        new_lines.append(f"{indent}  const mapped = mapUserForFrontend(updatedUser);\n")
        new_lines.append(f"{indent}  syncUserToFirestore(trade.user_id, mapped).catch(err => logger.error('Sync user balance failed on payout:', err));\n")
        new_lines.append(f"{indent}\n")
        new_lines.append(f"{indent}  // Emit socket event for real-time UI update\n")
        new_lines.append(f"{indent}  const {{ getIO }} = await import('../lib/socket.ts');\n")
        new_lines.append(f"{indent}  getIO().to(`user_${{trade.user_id}}`).emit('user_profile_update', mapped);\n")
        new_lines.append(f"{indent}}} catch (e) {{\n")
        new_lines.append(f"{indent}  logger.error('Failed to sync/emit balance update:', e);\n")
        new_lines.append(f"{indent}}}\n")

with open(file_path, 'w') as f:
    f.writelines(new_lines)
