const fs = require('fs');
let content = fs.readFileSync('src/api/routes.ts', 'utf-8');

const injection = `
router.get('/admins/:id', async (req, res) => {
    try {
        const admin = await get('SELECT * FROM users WHERE uid = ? AND is_admin = 1', [req.params.id]);
        if (admin) {
            res.json({ id: admin.uid, role: 'admin' });
        } else {
            res.json({ error: 'Not found' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
`;

if (!content.includes('/admins/:id')) {
    content = content.replace("router.get('/user/profile'", injection + "\nrouter.get('/user/profile'");
    fs.writeFileSync('src/api/routes.ts', content);
    console.log('Injected /admins/:id');
}
