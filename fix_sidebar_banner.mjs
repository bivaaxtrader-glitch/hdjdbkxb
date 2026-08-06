import fs from 'fs';
let code = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf8');

const target = `        <div className="flex-1 flex flex-col pt-3 pb-2 gap-[18px] px-1 overflow-y-auto scrollbar-hide items-center">
          {[
            { icon: Icons.LayoutGrid, label: "Activities", tab: "activities" },`;

const replacement = `        <div className="flex-1 flex flex-col pt-3 pb-2 gap-[18px] px-1 overflow-y-auto scrollbar-hide items-center">
          <div className="w-[44px] h-[44px] bg-[#2a2c31] rounded-xl overflow-hidden cursor-pointer border-[1.5px] border-[#ffe24c] group shrink-0 relative mt-1" onClick={() => setActiveTab('tournaments')}>
            <img src="https://i.postimg.cc/yYSDXHm2/IMG-20260421-WA0036(2).jpg" alt="Tournaments" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 opacity-90" />
          </div>
          {[
            { icon: Icons.LayoutGrid, label: "Activities", tab: "activities" },`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/pages/TradeTerminal.tsx', code);
  console.log("Success");
} else {
  console.log("Target not found!");
}
