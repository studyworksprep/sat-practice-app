'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const TestTypeContext = createContext({ testType: 'sat', setTestType: () => {} });

const STORAGE_KEY = 'studyworks_test_type';

export function TestTypeProvider({ children }) {
  const [testType, setTestTypeRaw] = useState('sat');

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'act') setTestTypeRaw('act');
  }, []);

  function setTestType(val) {
    const v = val === 'act' ? 'act' : 'sat';
    setTestTypeRaw(v);
    localStorage.setItem(STORAGE_KEY, v);
  }

  return (
    <TestTypeContext.Provider value={{ testType, setTestType }}>
      {children}
    </TestTypeContext.Provider>
  );
}

export function useTestType() {
  return useContext(TestTypeContext);
}
