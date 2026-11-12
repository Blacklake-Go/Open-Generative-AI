'use client';
import { createContext, useContext } from 'react';

const CommunityModeContext = createContext(false);

// The server serializes this runtime flag into the same React tree used for
// hydration. Changing the rollout flag never requires rebuilding browser code.
export function CommunityModeProvider({ enabled, children }) {
  return <CommunityModeContext.Provider value={enabled === true}>{children}</CommunityModeContext.Provider>;
}

export function useCommunityMode() {
  return useContext(CommunityModeContext);
}
