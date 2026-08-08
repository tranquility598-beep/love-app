import { createContext } from 'react';

export const AdminSocketContext = createContext({ socket: null, connected: false, connectionError: '' });
