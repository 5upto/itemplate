import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function AuthSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get('token');
    if (!token) {
      setError('Missing token in URL.');
      return;
    }
    try {
      login(token);
      const to = params.get('to') || '/';
      navigate(to, { replace: true });
    } catch (e) {
      setError('Failed to complete sign-in.');
    }
  }, [location.search, login, navigate]);

  return (
    <div className="max-w-lg mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow text-center">
      {!error ? (
        <>
          <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100">Signing you in…</h1>
          <p className="text-gray-700 dark:text-gray-300 mb-4">Please wait while we complete authentication.</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold mb-2 text-red-700 dark:text-red-400">Authentication Error</h1>
          <p className="text-gray-700 dark:text-gray-300 mb-4">{error}</p>
          <Link to="/login" className="text-blue-600 dark:text-blue-400 hover:underline">Back to Login</Link>
        </>
      )}
    </div>
  );
}
