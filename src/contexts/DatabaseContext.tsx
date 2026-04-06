import React, { createContext, useContext } from 'react';
import database from '../database';

// The context holds the single WatermelonDB instance.
// Every screen reads from this — never from Supabase directly.
const DatabaseContext = createContext(database);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const db = useContext(DatabaseContext);
  if (!db) {
    throw new Error('useDatabase must be used inside <DatabaseProvider>');
  }
  return db;
}