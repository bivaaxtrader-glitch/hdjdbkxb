import fs from 'fs';
let code = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf8');

const targetStartIndex = code.indexOf('{/* Desktop Actions */}');
const targetEndIndex = code.indexOf('{/* Mobile Header Icons (Right) */}');

if (targetStartIndex !== -1 && targetEndIndex !== -1) {
  const correctDesktopActions = `{/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4 h-full">
               
               <div 
                 onClick={() => setShowAccounts(!showAccounts)}
                 className="flex items-center gap-2 cursor-pointer group px-2 py-1.5 hover:bg-white/5 rounded-lg transition-colors"
               >
                 <div className="flex items-center justify-center">
                   {accountType === 'demo' ? (
                     <Icons.Sparkles size={16} className="text-[#309cf4] fill-[#309cf4]" />
                   ) : accountType === 'tournament' ? (
                     <Icons.Trophy size={16} className="text-indigo-400 fill-indigo-400/20" />
                   ) : (
                     <Icons.ShieldCheck size={16} className="text-[#00c980] fill-[#00c980]/20" />
                   )}
                 </div>
                 <span className="font-sans font-bold text-[15px] text-white tracking-tight">
                    <AnimatedBalance value={balance} currency={userCurrency} accountType={accountType} isHidden={isBalanceHidden} />
                 </span>
                 <ChevronDown size={14} className="text-gray-500 group-hover:text-white transition-colors" />
               </div>
               
               <button 
                 onClick={() => { setShowDeposit(true); setCashierTab("deposits"); bootApp(); }}
                 className="bg-[#FFE24C] hover:bg-[#ffe770] text-black h-[36px] px-5 rounded-[8px] font-bold text-[14px] transition-all active:scale-95 flex items-center justify-center"
               >
                 Deposit
               </button>
               
               <div 
                 onClick={() => { setActiveTab("profile-menu"); }}
                 className="w-9 h-9 bg-[#32343a] rounded-full flex items-center justify-center text-[13px] font-bold text-gray-400 relative cursor-pointer active:scale-90 transition-transform uppercase border border-white/5"
               >
                 {currentUser?.displayName ? String(currentUser.displayName).substring(0, 1) : (currentUser?.email ? String(currentUser.email).substring(0, 1) : "H")}
                 <div className="absolute top-[0px] right-[0px] w-2.5 h-2.5 bg-[#00c980] border-[2px] border-[#1a1b1f] rounded-full shadow-lg"></div>
               </div>
            </div>
            `;
            
  code = code.substring(0, targetStartIndex) + correctDesktopActions + code.substring(targetEndIndex);
  fs.writeFileSync('src/pages/TradeTerminal.tsx', code);
  console.log("Success!");
} else {
  console.log("Target not found", targetStartIndex, targetEndIndex);
}
