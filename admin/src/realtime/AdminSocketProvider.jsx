import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { api, API_ORIGIN } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { AdminSocketContext } from './adminSocketContext.js';

export default function AdminSocketProvider({ children }) {
  const { user, refreshSession } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');

  useEffect(() => {
    if (!user?.adminTotpEnabled || (user.adminPolicyRequiredVersion && user.adminPolicyAcceptedVersion !== user.adminPolicyRequiredVersion)) {
      setSocket(null);
      setConnected(false);
      setConnectionError('');
      return undefined;
    }

    let cancelled = false;
    let activeSocket = null;
    let retryTimer = null;

    const retry = () => {
      if (cancelled || retryTimer) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        connect();
      }, 2500);
    };

    const connect = async () => {
      try {
        const { data } = await api.post('/auth/socket-token');
        if (cancelled) return;
        activeSocket?.close();
        activeSocket = io(API_ORIGIN, {
          auth: { token: data.token },
          transports: ['polling', 'websocket'],
          upgrade: true,
          rememberUpgrade: true,
          timeout: 10_000,
          reconnection: false,
          withCredentials: true
        });
        setSocket(activeSocket);
        activeSocket.on('connect', () => {
          setConnected(true);
          setConnectionError('');
        });
        activeSocket.on('disconnect', reason => {
          setConnected(false);
          setConnectionError(reason || 'disconnected');
          if (!cancelled && reason !== 'io client disconnect') retry();
        });
        activeSocket.on('connect_error', error => {
          setConnected(false);
          setConnectionError(error?.message || 'connection_error');
          retry();
        });
        activeSocket.on('staff:session-expired', async () => {
          setConnected(false);
          await refreshSession();
        });
      } catch (error) {
        setConnectionError(error?.response?.data?.message || error?.message || 'connection_error');
        if ([401, 403].includes(error?.response?.status)) await refreshSession();
        retry();
      }
    };

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
      activeSocket?.close();
      setSocket(null);
      setConnected(false);
      setConnectionError('');
    };
  }, [refreshSession, user?._id, user?.adminTotpEnabled, user?.adminPolicyAcceptedVersion, user?.adminPolicyRequiredVersion]);

  const value = useMemo(() => ({ socket, connected, connectionError }), [socket, connected, connectionError]);
  return <AdminSocketContext.Provider value={value}>{children}</AdminSocketContext.Provider>;
}
