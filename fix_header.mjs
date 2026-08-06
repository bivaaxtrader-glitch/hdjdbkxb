import fs from 'fs';
let code = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf8');

const target = `               <button 
                 onClick={() => setActiveTab('market-state')}
                 title="Market State"
                 className="w-9 h-9 flex items-center justify-center bg-[#2a2c31] border border-[#3b3c41] rounded-[8px] text-[#8e8e93] hover:text-[#FFE24C] transition-colors"
               >
                 <Activity size={18} strokeWidth={2.5} />
               </button>
               <button 
                 onClick={() => setShowAlertDialog(true)}
                 title="Set Price Alert"
                 className="w-9 h-9 flex items-center justify-center bg-[#2a2c31] border border-[#3b3c41] rounded-[8px] text-[#8e8e93] hover:text-[#FFE24C] transition-colors"
               >
                 <Bell size={18} strokeWidth={2.5} />
               </button>`;

if (code.includes(target)) {
  code = code.replace(target, '');
  fs.writeFileSync('src/pages/TradeTerminal.tsx', code);
  console.log("Success!");
} else {
  console.log("Target not found");
}
