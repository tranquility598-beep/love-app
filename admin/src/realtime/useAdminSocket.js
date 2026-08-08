import { useContext } from 'react';
import { AdminSocketContext } from './adminSocketContext.js';

export function useAdminSocket() {
  return useContext(AdminSocketContext);
}
