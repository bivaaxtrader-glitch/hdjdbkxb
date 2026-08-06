export function mapUserForFrontend(user: any) {
  if (!user) return null;
  const uid = user.uid || user.id || 'user_' + Math.random().toString(36).substring(2, 9);
  const realBal = parseFloat(user.real_balance ?? user.realBalance ?? user.balance ?? 0);
  const demoBal = parseFloat(user.demo_balance ?? user.demoBalance ?? 10000);
  return {
    id: uid,
    uid: uid,
    email: user.email || '',
    displayName: user.display_name || user.displayName || user.first_name || user.email?.split('@')[0] || 'User',
    firstName: user.first_name || user.firstName,
    lastName: user.last_name || user.lastName,
    gender: user.gender,
    dob: (() => {
      if (!user.dob) return null;
      try {
        return typeof user.dob === 'string' ? JSON.parse(user.dob) : user.dob;
      } catch (e) {
        return user.dob;
      }
    })(),
    nickname: user.nickname || user.displayName,
    photoURL: user.photo_url || user.photoURL || '',
    balance: realBal,
    realBalance: realBal,
    demoBalance: demoBal,
    currency: user.currency || 'USD',
    isVerified: !!user.is_verified || !!user.isVerified || !!user.emailVerified,
    isAdmin: !!user.is_admin || !!user.isAdmin,
    kycStatus: user.kyc_status || user.kycStatus || 'unverified',
    affiliateId: user.affiliate_id || user.affiliateId || user.referral_code || user.referralCode,
    referralCode: user.referral_code || user.referralCode,
    referralCount: user.referral_count || user.referralCount || 0,
    totalLiveVolume: parseFloat(user.total_live_volume || user.totalLiveVolume || 0),
    status: user.status || 'Standard',
    phone: user.phone,
    country: user.country,
    countryCode: user.country_code || user.countryCode,
    referredBy: user.referred_by_uid || user.referredBy || user.referredByUid,
    referredByUid: user.referred_by_uid || user.referredBy || user.referredByUid,
    smart_mode_enabled: user.smart_mode_enabled || user.smartModeEnabled ? 1 : 0,
    smart_mode_strategy: user.smart_mode_strategy || user.smartModeStrategy || 'balanced',
    createdAt: user.created_at || user.createdAt || Date.now(),
    created_at: user.created_at || user.createdAt || Date.now(),
    updated_at: user.updated_at || user.updatedAt || Date.now()
  };
}
