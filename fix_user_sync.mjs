import fs from 'fs';
let code = fs.readFileSync('src/api/routes.ts', 'utf8');

const target = `      await run(
        \`INSERT INTO users (uid, email, display_name, photo_url, referral_code, real_balance, demo_balance, country) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
        [uid, email || '', displayName || '', photoURL || '', affiliateId, '0.00', '10000.00', countryName]
      );`;

const replacement = `      await run(
        \`INSERT OR IGNORE INTO users (uid, email, display_name, photo_url, referral_code, real_balance, demo_balance, country) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)\`,
        [uid, email || '', displayName || '', photoURL || '', affiliateId, '0.00', '10000.00', countryName]
      );`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('src/api/routes.ts', code);
  console.log("Success");
} else {
  console.log("Target not found!");
  // Try another approach if exact formatting differs
}
