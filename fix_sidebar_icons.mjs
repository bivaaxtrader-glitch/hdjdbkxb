import fs from 'fs';
let code = fs.readFileSync('src/pages/TradeTerminal.tsx', 'utf8');

const target = `          {[
            { icon: Icons.Package, label: "Activities", tab: "activities" },
            { icon: Clock, label: "Trades", tab: "history" },
            { icon: Icons.Briefcase, label: "Market", tab: "market" },
            { icon: Icons.Users, label: "Copy trading", onClick: () => navigate('/copytrading') },
            { icon: Icons.Trophy, label: "Ball Rush", tab: "ball-rush" },
          ].map((item, idx) => {`;

const replacement = `          {[
            { icon: Icons.LayoutGrid, label: "Activities", tab: "activities" },
            { icon: Clock, label: "Trades", tab: "history" },
            { icon: Icons.ShoppingBag, label: "Market", tab: "market" },
            { icon: Icons.Users, label: "Copy trading", onClick: () => navigate('/copytrading') },
            { icon: Icons.Trophy, label: "Ball Rush", tab: "ball-rush" },
          ].map((item, idx) => {`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/pages/TradeTerminal.tsx', code);
  console.log("Success");
} else {
  console.log("Target not found!");
}
