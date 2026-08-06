import fs from 'fs';
let code = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf8');

const targetStartIndex = code.indexOf('{/* Desktop Actions */}');
const targetEndIndex = code.indexOf('{/* Mobile Header Icons (Right) */}');

if (targetStartIndex !== -1 && targetEndIndex !== -1) {
  const correctDesktopActions = `{/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4 h-full">
               <button 
                 onClick={handleRefreshBalance}
                 disabled={isRefreshing}
                 className="w-9 h-9 flex items-center justify-center bg-[#2a2c31] border border-[#3b3c41] rounded-[8px] text-[#8e8e93] hover:text-gray-300 transition-colors"
               >
                 <RefreshCw size={18} strokeWidth={2.5} className={isRefreshing ? "animate-spin" : ""} />
               </button>
               
               <div 
                 onClick={() => setShowAccounts(!showAccounts)}
                 className="flex flex-col items-start cursor-pointer group px-1"
               >
                 <div className="flex items-center gap-1.5 mb-0.5">
                   {accountType === 'demo' ? (
                     <Icons.Sparkles size={14} className="text-cyan-400 fill-cyan-400" />
                   ) : accountType === 'tournament' ? (
                     <Icons.Trophy size={14} className="text-indigo-400 fill-indigo-400/20" />
                   ) : (
                     <Icons.ShieldCheck size={14} className="text-yellow-400 fill-yellow-400" />
                   )}
                   <span className={\`text-[12px] font-medium leading-none \${accountType === 'demo' ? 'text-cyan-400' : accountType === 'tournament' ? 'text-indigo-400' : 'text-yellow-400'}\`}>
                     {accountType === 'demo' ? 'Demo account' : accountType === 'tournament' ? 'Tournament' : 'Real account'}
                   </span>
                   <ChevronDown size={14} className="text-gray-500 group-hover:text-white transition-colors" />
                 </div>
                 <span className="font-sans font-bold text-base text-white leading-none">
                    <AnimatedBalance value={balance} currency={userCurrency} accountType={accountType} isHidden={isBalanceHidden} />
                 </span>
               </div>
               <button 
                 onClick={() => { setShowDeposit(true); setCashierTab("deposits"); bootApp(); }}
                 className="bg-[#FFE24C] hover:bg-[#ffe770] text-black h-9 px-4 rounded-[8px] font-bold text-[14px] transition-all active:scale-95 flex items-center gap-2"
               >
                 <Icons.Wallet size={16} strokeWidth={2.5} />
                 Deposit
               </button>
               <button 
                 onClick={() => { setShowDeposit(true); setCashierTab("withdrawals"); bootApp(); }}
                 className="bg-[#3e404a] hover:bg-[#4a4c57] text-white h-9 px-4 rounded-[8px] font-bold text-[14px] transition-all active:scale-95 flex items-center gap-2 border border-white/5"
               >
                 <Icons.ArrowUpRight size={18} strokeWidth={2.5} />
                 Withdraw
               </button>
               <div 
                 onClick={() => { setActiveTab("profile-menu"); }}
                 className="w-10 h-10 bg-[#32343a] rounded-full flex items-center justify-center text-[13px] font-bold text-gray-400 relative cursor-pointer active:scale-90 transition-transform uppercase border border-white/5"
               >
                 {currentUser?.displayName ? String(currentUser.displayName).substring(0, 1) : (currentUser?.email ? String(currentUser.email).substring(0, 1) : "H")}
                 <div className="absolute top-[1px] right-[1px] w-3 h-3 bg-[#ff4b5c] border-[2px] border-[#1a1b1f] rounded-full shadow-lg"></div>
               </div>
            </div>
            `;
            
  code = code.substring(0, targetStartIndex) + correctDesktopActions + code.substring(targetEndIndex);
  fs.writeFileSync('src/pages/TradeTerminal.tsx', code);
  console.log("Success!");
} else {
  console.log("Target not found", targetStartIndex, targetEndIndex);
}
