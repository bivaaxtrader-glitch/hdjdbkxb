const fs = require('fs');
let content = fs.readFileSync('src/api/routes.ts', 'utf-8');

const injection = `
router.post('/security/log-access', (req, res) => {
    res.json({ success: true });
});
`;

if (!content.includes('/security/log-access')) {
    content = content.replace("router.get('/tournaments'", injection + "\nrouter.get('/tournaments'");
    fs.writeFileSync('src/api/routes.ts', content);
    console.log('Injected /security/log-access');
}
