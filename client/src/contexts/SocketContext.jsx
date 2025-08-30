import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      const serverUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SERVER_URL) || 'https://itemplate.onrender.com';
      const newSocket = io(serverUrl, {
        transports: ['websocket', 'polling']
      });

      newSocket.on('connect', () => {
        setIsConnected(true);
        console.log('Connected to server');
      });

      newSocket.on('disconnect', () => {
        setIsConnected(false);
        console.log('Disconnected from server');
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
        setSocket(null);
        setIsConnected(false);
      };
    } else {
      if (socket) {
        socket.close();
        setSocket(null);
        setIsConnected(false);
      }
    }
  }, [isAuthenticated]);

  const joinInventory = (inventoryId) => {
    if (socket) {
      socket.emit('join-inventory', inventoryId);
    }
  };

  const leaveInventory = (inventoryId) => {
    if (socket) {
      socket.emit('leave-inventory', inventoryId);
    }
  };

  const value = {
    socket,
    isConnected,
    joinInventory,
    leaveInventory
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};