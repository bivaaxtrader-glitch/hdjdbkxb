const fs = require('fs');
let content = fs.readFileSync('src/api/routes.ts', 'utf-8');

const injection = `
router.get('/tournaments', async (req, res) => {
    res.json([]);
});
`;

if (!content.includes('/tournaments')) {
    content = content.replace("router.get('/app_config/settings'", injection + "\nrouter.get('/app_config/settings'");
    fs.writeFileSync('src/api/routes.ts', content);
    console.log('Injected /tournaments');
}
