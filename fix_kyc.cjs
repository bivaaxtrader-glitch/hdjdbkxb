const fs = require('fs');
let content = fs.readFileSync('src/api/routes.ts', 'utf-8');

const injection = `
router.get('/kyc', (req, res) => {
    res.json([]);
});
router.post('/kyc', (req, res) => {
    res.json({ success: true });
});
`;

if (!content.includes("router.get('/kyc'")) {
    content = content.replace("router.get('/tournaments'", injection + "\nrouter.get('/tournaments'");
    fs.writeFileSync('src/api/routes.ts', content);
    console.log('Injected /kyc');
}
