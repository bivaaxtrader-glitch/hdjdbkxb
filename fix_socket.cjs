const fs = require('fs');
let content = fs.readFileSync('src/services/socketService.ts', 'utf-8');

const injection = `
      // Clean up previous market rooms
      Array.from(socket.rooms).forEach(room => {
          if (room.startsWith('market_') || room === 'real' || room === 'demo') {
              socket.leave(room);
          }
      });
      socket.join(\`market_\${asset}_\${accountType}\`);
      socket.join(accountType);
`;

content = content.replace('const tf = timeframe || "1 minute";', 'const tf = timeframe || "1 minute";\n' + injection);
fs.writeFileSync('src/services/socketService.ts', content);
console.log('Injected socket rooms');
