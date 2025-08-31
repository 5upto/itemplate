import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const { user, updatePreferences } = useAuth();
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    // fallback to system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const userTheme = user?.theme;
    if (user && (userTheme === 'light' || userTheme === 'dark') && userTheme !== theme) {
      setTheme(userTheme);
    }
  }, [user]);

  // Apply theme to the document root so CSS (and Tailwind dark: classes if present) take effect
  useEffect(() => {
    const root = document.documentElement;
    if (!root) return;
    
    // Always set both class and data-theme attribute
    root.classList.toggle('dark', theme === 'dark');
    root.setAttribute('data-theme', theme);
    document.body && (document.body.style.colorScheme = theme);
    
    // Ensure background colors are set correctly
    if (theme === 'light') {
      document.body.style.backgroundColor = '#f9fafb'; // bg-gray-50
      document.body.classList.remove('dark');
    } else {
      document.body.style.backgroundColor = '#111827'; // gray-900
      document.body.classList.add('dark');
    }
  }, [theme]);

  // Keep html.dark in sync if something else changes data-theme externally
  useEffect(() => {
    const root = document.documentElement;
    if (!root) return;
    const observer = new MutationObserver(() => {
      const attrTheme = root.getAttribute('data-theme');
      if (attrTheme === 'light' && root.classList.contains('dark')) {
        root.classList.remove('dark');
        document.body && (document.body.style.colorScheme = 'light');
      } else if (attrTheme === 'dark' && !root.classList.contains('dark')) {
        root.classList.add('dark');
        document.body && (document.body.style.colorScheme = 'dark');
      }
    });
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = async () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    
    if (user) {
      try {
        await updatePreferences({ theme: newTheme });
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    }
  };

  const setThemeExplicit = async (value) => {
    const newTheme = value === 'dark' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    if (user) {
      try {
        await updatePreferences({ theme: newTheme });
      } catch (error) {
        console.error('Failed to save theme preference:', error);
      }
    }
  };

  const value = {
    theme,
    toggleTheme,
    setTheme: setThemeExplicit,
    isDark: theme === 'dark'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};