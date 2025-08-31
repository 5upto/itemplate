import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { SocketProvider } from './contexts/SocketContext';

import Navbar from './components/Layout/Navbar';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import AuthSuccess from './pages/AuthSuccess';
import ProfilePage from './pages/ProfilePage';
import InventoryListPage from './pages/InventoryListPage';
import InventoryDetailPage from './pages/InventoryDetailPage';
import ItemDetailPage from './pages/ItemDetailPage';
import SearchResultsPage from './pages/SearchResultsPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';
import CreateInventoryPage from './pages/CreateInventoryPage';
import EditInventoryPage from './pages/EditInventoryPage';
import CreateItemPage from './pages/CreateItemPage';

import LoadingSpinner from './components/UI/LoadingSpinner';

import './i18n/config';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// Protected Route Component
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <LoadingSpinner />;
  
  if (!user) return <Navigate to="/login" />;
  
  if (adminOnly && !user.isAdmin) {
    return <Navigate to="/" />;
  }
  
  return children;
};

// Main App Component
function AppContent() {
  const { i18n } = useTranslation();
  
  // Theme system removed; UI defaults to light theme.
  
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  
  return (
    <div className="min-h-screen bg-white dark:bg-gray-50 transition-colors duration-200">
      <Router>
        <Navbar />
        <main className="container mx-auto px-4 py-8 bg-white dark:bg-gray-50 transition-colors duration-200">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/success" element={<AuthSuccess />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="/inventories" element={<InventoryListPage />} />
            <Route 
              path="/inventories/create" 
              element={
                <ProtectedRoute>
                  <CreateInventoryPage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/inventories/:id/edit" 
              element={
                <ProtectedRoute>
                  <EditInventoryPage />
                </ProtectedRoute>
              }
            />
            <Route 
              path="/inventories/:id/items/new" 
              element={
                <ProtectedRoute>
                  <CreateItemPage />
                </ProtectedRoute>
              }
            />
            <Route path="/inventories/:id" element={<InventoryDetailPage />} />
            <Route path="/items/:id" element={<ItemDetailPage />} />
            <Route path="/profile/:id" element={<ProfilePage />} />
            <Route 
              path="/profile" 
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute adminOnly>
                  <AdminPage />
                </ProtectedRoute>
              } 
            />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" />} />
          </Routes>
        </main>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 4000,
            className: 'bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100',
          }}
        />
      </Router>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <SocketProvider>
            <AppContent />
          </SocketProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;