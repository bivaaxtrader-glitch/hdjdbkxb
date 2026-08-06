const fs = require('fs');
let content = fs.readFileSync('src/api/routes.ts', 'utf-8');

const injection = `
// Generic collections to avoid HTML parsing errors
const genericCollections = ['depositMethods', 'deposits', 'education', 'masterTraders', 'news', 'promotions', 'tickets', 'withdrawals'];
genericCollections.forEach(col => {
    router.get('/' + col, (req, res) => {
        res.json([]);
    });
});
`;

if (!content.includes('genericCollections')) {
    content = content.replace("router.get('/tournaments'", injection + "\nrouter.get('/tournaments'");
    fs.writeFileSync('src/api/routes.ts', content);
    console.log('Injected generic routes');
}
