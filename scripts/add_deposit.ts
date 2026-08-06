import { adminDb } from '../src/lib/firebase-admin';

async function addDepositMethod() {
  try {
    const colRef = adminDb.collection('depositMethods');
    await colRef.add({
      name: 'USDT (Ethereum/BTC)',
      address: '0x8e01631855cf57fa2da27ff30c181cca137aefb5',
      logo: 'https://i.postimg.cc/rzXYSxxx/1.png',
      qrCode: 'https://i.postimg.cc/GpKwd7Gr/IMG-20260804-235328.png',
      minDeposit: 50,
      processingTime: '5 minutes',
      isActive: true,
      createdAt: Date.now()
    });
    console.log('Deposit method added successfully');
  } catch (error) {
    console.error('Error adding deposit method:', error);
  }
}

addDepositMethod();
