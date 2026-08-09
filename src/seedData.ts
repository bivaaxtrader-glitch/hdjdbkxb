import { collection, addDoc, getDocs, query, where, updateDoc, doc } from "./firebase";
import { db } from "./firebase";

export const seedPromo = async () => {
  try {
    const q = query(collection(db, 'news'), where('title', '==', '50% Deposit Bonus'));
    const snap = await getDocs(q);
    
    const promoContent = `Promo Code: BIVAAXFAST50

Offer Details:
• Get 50% Bonus on your Deposit
• Fast Bonus Credit
• Secure & Trusted Platform
• Instant Deposit Processing
• Limited Time Offer

Trade Smart. Earn Big.`;

    if (snap.empty) {
      await addDoc(collection(db, 'news'), {
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
      const docRef = doc(db, 'news', snap.docs[0].id);
      await updateDoc(docRef, {
        description: "Boost Your Trading with Every Deposit!",
        content: promoContent,
        isPlatformNews: true,
        actionType: "deposit",
        actionValue: "BIVAAXFAST50",
        ctaText: "DEPOSIT NOW",
        imageUrl: "https://i.postimg.cc/FHrDvXtr/file-0000000087d081fabe530d525061bcac.png"
      });
    }

    const qPromo = query(collection(db, 'promos'), where('code', '==', 'BIVAAXFAST50'));
    const snapPromo = await getDocs(qPromo);
    if (snapPromo.empty) {
        await addDoc(collection(db, 'promos'), {
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
