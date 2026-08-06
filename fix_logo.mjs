import fs from 'fs';
let code = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf8');

const target = `            <div className="flex items-center gap-1.5 ml-2 md:ml-4">
              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-1.5 group cursor-pointer">
                  <Logo size={26} className="transition-transform group-hover:scale-110 duration-500" />
                </div>
                <button 
                  onClick={() => setActiveTab("assets")}
                  className="w-9 h-9 flex items-center justify-center bg-[#2a2c31] border border-[#3b3c41] rounded-[8px] text-[#8e8e93] hover:text-white transition-all ml-1"
                >
                  <Plus size={20} strokeWidth={3} />
                </button>`;

const replacement = `            <div className="flex items-center gap-1.5 ml-2 md:ml-4">
              <div className="hidden md:flex items-center gap-3">
                <div className="flex items-center gap-1.5 group cursor-pointer">
                  <Logo size={26} className="transition-transform group-hover:scale-110 duration-500" />
                  <span className="font-black text-[22px] tracking-tighter text-[#ffe24c] lowercase">bivaax</span>
                </div>
                <button 
                  onClick={() => setActiveTab("assets")}
                  className="w-9 h-9 flex items-center justify-center bg-[#2a2c31] border border-[#3b3c41] rounded-[8px] text-[#8e8e93] hover:text-white transition-all ml-4"
                >
                  <Plus size={20} strokeWidth={3} />
                </button>`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/pages/TradeTerminal.tsx', code);
  console.log("Success");
} else {
  console.log("Target not found");
}
