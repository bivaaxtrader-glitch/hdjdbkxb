import { adminDb } from "./lib/firebase-admin";

export const seedPromo = async () => {
  try {
    const newsRef = adminDb.collection('news');
    const snap = await newsRef.where('title', '==', '50% Deposit Bonus').get();
    
    const promoContent = `Promo Code: BIVAAXFAST50

Offer Details:
• Get 50% Bonus on your Deposit
• Fast Bonus Credit
• Secure & Trusted Platform
• Instant Deposit Processing
• Limited Time Offer

Trade Smart. Earn Big.`;

    if (snap.empty) {
      await newsRef.add({
        title: "50% Deposit Bonus",
        description: "Boost Your Trading with Every Deposit!",
        content: promoContent,
        imageUrl: "https://i.postimg.cc/FHrDvXtr/file-0000000087d081fabe530d525061bcac.png",
        emoji: "🚀",
        date: new Date().toLocaleDateString(),
        ctaText: "DEPOSIT NOW",
        actionType: "deposit",
        actionValue: "BIVAAXFAST50",
        isPlatformNews: true,
        reactions: 100,
        badReactions: 0
      });
      console.log("News Promo seeded successfully");
    } else {
      const docRef = newsRef.doc(snap.docs[0].id);
      await docRef.update({
        description: "Boost Your Trading with Every Deposit!",
        content: promoContent,
        isPlatformNews: true,
        actionType: "deposit",
        actionValue: "BIVAAXFAST50",
        ctaText: "DEPOSIT NOW",
        imageUrl: "https://i.postimg.cc/FHrDvXtr/file-0000000087d081fabe530d525061bcac.png"
      });
    }

    const promoRef = adminDb.collection('promos');
    const snapPromo = await promoRef.where('code', '==', 'BIVAAXFAST50').get();
    if (snapPromo.empty) {
        await promoRef.add({
           code: 'BIVAAXFAST50',
           bonusPercentage: 50,
           isActive: true,
           isBonusActive: true,
           expiryDate: new Date().getTime() + (1000 * 60 * 60 * 24 * 30) // 30 days
        });
        console.log("Promo code seeded successfully");
    }
  } catch (e) {
    console.error("Error seeding promo:", e);
  }
};

export const seedPages = async () => {
  try {
    const pages = [
      { id: 'about_us', title: 'About Us', content: 'Bivaax Trade is the most trusted binary options platform...' },
      { id: 'regulations', title: 'Regulations', content: 'We are regulated by...' },
      { id: 'client_agreement', title: 'Client Agreement', content: 'By using our platform, you agree to...' }
    ];
    for (const page of pages) {
      try {
        await adminDb.collection('pages').doc(page.id).set(page);
        console.log(`Page ${page.id} seeded successfully to adminDb`);
      } catch (e) {
        console.log(`Page ${page.id} seeding failed:`, e);
      }
    }
  } catch (e) {
    console.error("Error seeding pages:", e);
  }
};
