import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
  const { login } = useAuth();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleOAuth = (provider) => {
    const url = `${serverUrl}/api/auth/${provider}`;
    window.location.href = url;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        const { data } = await axios.post('/api/auth/login', {
          email: form.email,
          password: form.password,
        });
        if (data?.token) {
          login(data.token);
          toast.success('Logged in successfully');
        } else {
          toast.error('Login succeeded but no token returned');
        }
      } else {
        const { data } = await axios.post('/api/auth/register', {
          username: form.username,
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
        });
        if (data?.token) {
          login(data.token);
          toast.success('Account created and logged in');
        } else {
          toast.success('Account created');
        }
      }
    } catch (err) {
      const msg = err.response?.data?.message || (mode === 'login' ? 'Login failed' : 'Signup failed');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white dark:bg-gray-800 rounded-lg shadow">
      <h1 className="text-2xl font-semibold mb-2 text-gray-900 dark:text-gray-100">
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </h1>
      <p className="text-sm mb-6 text-gray-600 dark:text-gray-400">
        {mode === 'login' ? (
          <>
            Don't have an account?{' '}
            <Link to="/login" type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setMode('signup')}>
              Create one
            </Link>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <Link to="/login" type="button" className="text-blue-600 dark:text-blue-400 hover:underline" onClick={() => setMode('login')}>
              Sign in
            </Link>
          </>
        )}
      </p>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === 'signup' && (
          <>
            <div>
              <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={onChange}
                required
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">First name</label>
                <input
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={onChange}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Last name</label>
                <input
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={onChange}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          </>
        )}
        <div>
          <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            required
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-700 dark:text-gray-300 mb-1">Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={onChange}
            required
            className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? (mode==='login' ? 'Signing in...' : 'Creating account...') : (mode==='login' ? 'Sign in' : 'Create account')}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs text-gray-500">Or continue with</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
      </div>

      {/* OAuth Buttons */}
      <div className="space-y-3">
        <button
          onClick={() => handleOAuth('google')}
          className="w-full inline-flex items-center justify-center rounded-md bg-red-600 text-white px-4 py-2 font-medium hover:bg-red-700"
        >
          <svg className="mr-2 h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.2 31.9 29 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.4 1 7.4 2.9l5.7-5.7C33.7 6.1 29.1 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 19-7.3 19-20 0-1.3-.1-2.7-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.9 16.2 19 13 24 13c2.8 0 5.4 1 7.4 2.9l5.7-5.7C33.7 6.1 29.1 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5 0 9.6-1.9 13-5l-6-4.9C29.1 35 26.7 36 24 36c-5 0-9.2-3.2-10.7-7.6l-6.6 5C9.6 39.7 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.3 3.9-4.9 7-9.3 7-5 0-9.2-3.2-10.7-7.6l-6.6 5C9.6 39.7 16.3 44 24 44c10 0 19-7.3 19-20 0-1.3-.1-2.7-.4-3.5z"/>
          </svg>
          Continue with Google
        </button>
        <button
          onClick={() => handleOAuth('github')}
          className="w-full inline-flex items-center justify-center rounded-md bg-gray-900 text-white px-4 py-2 font-medium hover:bg-black"
        >
          <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.58 2 12.26c0 4.51 2.87 8.33 6.84 9.68.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.03-2.74-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.76 1.04a9.24 9.24 0 0 1 5.02 0c1.92-1.31 2.76-1.04 2.76-1.04.55 1.4.2 2.44.1 2.7.64.71 1.03 1.62 1.03 2.74 0 3.95-2.34 4.82-4.57 5.07.36.32.68.95.68 1.92 0 1.38-.01 2.48-.01 2.82 0 .26.18.58.69.48A10.06 10.06 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/>
          </svg>
          Continue with GitHub
        </button>
      </div>

      <div className="mt-6 text-sm text-gray-600 dark:text-gray-400">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">Go back home</Link>
      </div>
    </div>
  );
}
