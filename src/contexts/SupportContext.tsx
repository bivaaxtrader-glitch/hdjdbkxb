import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SupportContextType {
  isSupportOpen: boolean;
  openSupport: () => void;
  closeSupport: () => void;
  toggleSupport: () => void;
}

const SupportContext = createContext<SupportContextType | undefined>(undefined);

export const SupportProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const openSupport = () => {
    setIsSupportOpen(true);
  };

  const closeSupport = () => setIsSupportOpen(false);
  const toggleSupport = () => setIsSupportOpen(prev => !prev);

  return (
    <SupportContext.Provider value={{ isSupportOpen, openSupport, closeSupport, toggleSupport }}>
      {children}
    </SupportContext.Provider>
  );
};

export const useSupport = () => {
  const context = useContext(SupportContext);
  if (context === undefined) {
    throw new Error('useSupport must be used within a SupportProvider');
  }
  return context;
};
