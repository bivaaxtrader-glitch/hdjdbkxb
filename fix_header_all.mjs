import fs from 'fs';
let code = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf8');

const startTag = '{/* HEADER */}';
const endTag = '{/* CHART & TRADING CONTROLS */}';
const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
  const correctHeader = `{/* HEADER */}
        <header className="h-[56px] md:h-[64px] bg-[#1a1b1f] border-b border-white/5 flex items-center justify-between pr-3 md:pr-6 shrink-0 z-[100] relative">
          <div className="flex items-center h-full">
            <div className="md:hidden flex h-full">
              {activeTab !== "trade" ? (
                <button 
                  onClick={() => setActiveTab("trade")} 
                  className="w-[56px] h-full flex items-center justify-center text-gray-400 hover:text-white transition-all z-10"
                >
                  <ArrowLeft size={22} />
                </button>
              ) : (
                <button 
                  onClick={() => setShowSidebar(!showSidebar)} 
                  className="w-[56px] h-full flex items-center justify-center text-gray-400 hover:text-white transition-all z-10"
                >
                  <Menu size={22} />
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-1.5 ml-2 md:ml-4">
              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-1.5 group cursor-pointer" onClick={() => window.location.reload()}>
                  <Logo size={26} className="transition-transform group-hover:scale-110 duration-500" />
                  <span className="font-sans font-black text-[22px] tracking-tighter text-[#ffe24c] lowercase">bivaax</span>
                </div>
                <button 
                  onClick={() => setActiveTab("assets")}
                  className="w-9 h-9 flex items-center justify-center bg-[#2a2c31] border border-[#3b3c41] rounded-[8px] text-[#8e8e93] hover:text-white transition-all ml-4"
                >
                  <Plus size={20} strokeWidth={3} />
                </button>
              </div>
              <div className="md:hidden flex items-center gap-1.5">
                <Logo size={32} />
              </div>
            </div>
            
            {/* Desktop Asset Selector */}
            <div 
              onClick={() => setActiveTab("assets")}
              className="hidden md:flex items-center gap-3 bg-[#2a2c31] px-3 py-1.5 rounded-lg border border-white/5 cursor-pointer hover:bg-[#32343a] transition-all group lg:ml-8"
            >
              <AssetLogo name={activeAsset} />
              <div className="flex flex-col">
                <span className="font-bold text-sm leading-none">{activeAsset}</span>
              </div>
              <span className="text-[#FFE24C] text-[11px] font-black bg-[#FFE24C]/10 px-2 py-0.5 rounded ml-1">
                {markets[activeAsset]?.payout || 83}%
              </span>
              <ChevronDown size={14} className="text-gray-500 group-hover:text-white transition-colors" />
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4 h-full">
            {/* Mobile Header Center Content -> Now on Right */}
            <div className="md:hidden flex items-center gap-2 mr-1">
              <button className="bg-transparent border border-white/10 w-9 h-9 rounded-[10px] flex items-center justify-center text-gray-300 active:scale-95 transition-transform">
                <Icons.RefreshCcw size={16} />
              </button>
              <div 
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex flex-col items-start cursor-pointer group"
              >
                <div className="flex items-center gap-1.5 mb-0.5 opacity-90 group-active:opacity-70 transition-opacity">
                    <span className={\`text-[13px] font-medium leading-none \${accountType === 'demo' ? 'text-cyan-400' : accountType === 'tournament' ? 'text-indigo-400' : 'text-yellow-400'}\`}>
                      {accountType === 'demo' ? 'Demo account' : accountType === 'tournament' ? 'Tournament' : 'Real account'}
                    </span>
                  <Icons.ChevronDown size={14} className="text-[#e0e0e0]" />
                </div>
                <div className="font-sans font-bold text-[15px] leading-none text-white opacity-90 group-active:opacity-70 transition-opacity pt-[1px]">
                  <AnimatedBalance value={balance} currency={userCurrency} accountType={accountType} isHidden={isBalanceHidden} />
                </div>
              </div>
            </div>

            {/* Desktop Actions */}
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

            {/* Mobile Header Icons (Right) */}
            <div className="flex md:hidden items-center gap-2">
              <button 
                onClick={() => { setShowCashierMenu(true); bootApp(); }}
                className="bg-[#FFE24C] w-10 h-10 rounded-[8px] flex items-center justify-center text-black active:scale-90 transition-transform"
              >
                <Icons.Wallet size={20} strokeWidth={2.5} />
              </button>
              
              <div 
                onClick={() => { setActiveTab("profile-menu"); }}
                className="w-10 h-10 bg-[#32343a] rounded-full flex items-center justify-center text-[11px] font-black text-gray-400 relative cursor-pointer active:scale-90 transition-transform uppercase"
              >
                {currentUser?.displayName ? String(currentUser.displayName).substring(0, 2) : (currentUser?.email ? String(currentUser.email).substring(0, 2) : "US")}
                <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-[#1a1b1f] rounded-full"></div>
              </div>
            </div>
          </div>
        </header>

        `;
        
  code = code.substring(0, startIndex) + correctHeader + code.substring(endIndex);
  fs.writeFileSync('src/pages/TradeTerminal.tsx', code);
  console.log("Success!");
} else {
  console.log("Target not found", startIndex, endIndex);
}
