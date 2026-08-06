import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db, doc, onAuthStateChanged, onSnapshot, updateDoc } from '../firebase';
import { LanguageCode } from '../lib/translations';

interface I18nContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
}

const I18nContext = createContext<I18nContextType>({
  language: 'en',
  setLanguage: () => {},
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const saved = localStorage.getItem('app_language');
    return (saved as LanguageCode) || 'en';
  });

  useEffect(() => {
    let unsubSnapshot: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (unsubSnapshot) {
        unsubSnapshot();
        unsubSnapshot = undefined;
      }
      if (u) {
        unsubSnapshot = onSnapshot(doc(db, 'users', u.uid), (userDoc) => {
          if (userDoc.exists()) {
            const rawLang = userDoc.data().language || 'en';
            const legacyMap: Record<string, LanguageCode> = {
              'English': 'en',
              'Español': 'es',
              'Deutsch': 'de',
              'Français': 'fr',
              'हिन्दी': 'hi',
              'Português': 'pt',
              'Русский': 'ru',
              '中文': 'zh'
            };
            const normalized = (legacyMap[rawLang] || rawLang) as LanguageCode;
            setLanguageState(normalized);
            localStorage.setItem('app_language', normalized);
          }
        });
      }
    });
    return () => {
      unsubscribeAuth();
      if (unsubSnapshot) unsubSnapshot();
    };
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem('app_language', lang);
    if (auth.currentUser) {
      updateDoc(doc(db, 'users', auth.currentUser.uid), { language: lang }).catch(console.error);
    }
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);

