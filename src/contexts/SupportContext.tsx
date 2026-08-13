import React, { createContext, useContext, useState } from 'react';

interface SupportContextType {
  isSupportOpen: boolean;
  openSupport: () => void;
  closeSupport: () => void;
}

const SupportContext = createContext<SupportContextType | undefined>(undefined);

export const SupportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const openSupport = () => setIsSupportOpen(true);
  const closeSupport = () => setIsSupportOpen(false);

  return (
    <SupportContext.Provider value={{ isSupportOpen, openSupport, closeSupport }}>
      {children}
    </SupportContext.Provider>
  );
};

export const useSupport = () => {
  const context = useContext(SupportContext);
  if (!context) throw new Error('useSupport must be used within a SupportProvider');
  return context;
};
