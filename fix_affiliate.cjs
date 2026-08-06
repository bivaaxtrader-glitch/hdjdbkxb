const fs = require('fs');
let content = fs.readFileSync('src/api/routes.ts', 'utf-8');

const injection = `
router.post('/affiliate/next-id', async (req, res) => {
    try {
        let nextId = 10001;
        const row = await get('SELECT MAX(CAST(affiliate_id AS UNSIGNED)) as maxId FROM users');
        if (row && row.maxId && row.maxId >= 10000) {
            nextId = parseInt(row.maxId) + 1;
        }
        res.json({ nextId });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
`;

if (!content.includes('/affiliate/next-id')) {
    content = content.replace('const router = express.Router();', 'const router = express.Router();\n' + injection);
    fs.writeFileSync('src/api/routes.ts', content);
    console.log('Injected /affiliate/next-id');
}
