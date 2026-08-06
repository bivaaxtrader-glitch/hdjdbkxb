import sys

file_path = 'src/pages/AdminDashboard.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """                    <div className="flex gap-4 p-2 bg-[#0a0a0f] border border-[#1a1a24] rounded-full w-fit">
                        <button 
                            onClick={() => setFinanceSubTab('deposits')}
                            className={`px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest transition-all ${financeSubTab === 'deposits' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-gray-500 hover:text-white'}`}
                        >
                            Deposit Requests
                        </button>
                        <button 
                            onClick={() => setFinanceSubTab('withdrawals')}
                            className={`px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest transition-all ${financeSubTab === 'withdrawals' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-gray-500 hover:text-white'}`}
                        >
                            Withdrawal Requests
                        </button>
                    </div>"""

new_block = """                    <div className="flex gap-4 p-2 bg-[#0a0a0f] border border-[#1a1a24] rounded-full w-fit">
                        {canManageDeposits && (
                            <button 
                                onClick={() => setFinanceSubTab('deposits')}
                                className={`px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest transition-all ${financeSubTab === 'deposits' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-gray-500 hover:text-white'}`}
                            >
                                Deposit Requests
                            </button>
                        )}
                        {canManageWithdrawals && (
                            <button 
                                onClick={() => setFinanceSubTab('withdrawals')}
                                className={`px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest transition-all ${financeSubTab === 'withdrawals' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'text-gray-500 hover:text-white'}`}
                            >
                                Withdrawal Requests
                            </button>
                        )}
                    </div>"""

if old_block in content:
    new_content = content.replace(old_block, new_block)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully updated finance subtabs.")
else:
    # Try with regex
    import re
    pattern = r'<div className="flex gap-4 p-2 bg-\[#0a0a0f\].*?Deposit Requests.*?</button>.*?Withdrawal Requests.*?</button>.*?</div>'
    if re.search(pattern, content, re.DOTALL):
        new_content = re.sub(pattern, new_block.strip(), content, flags=re.DOTALL)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully updated finance subtabs using regex.")
    else:
        print("Could not find the target block.")
        sys.exit(1)
