import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SearchBar from '../components/Search/SearchBar';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="max-w-xl mx-auto p-10 bg-white rounded-lg shadow">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2 text-gray-100 dark:text-gray-100">404</h1>
        <p className="text-gray-700 dark:text-gray-300 mb-6">{t('common.notFound') || 'The page you are looking for does not exist.'}</p>
      </div>

      <div className="mb-6">
        <SearchBar placeholder={t('search.placeholder')} />
      </div>

      <div className="text-center space-x-4">
        <Link to="/" className="text-blue-600 dark:text-blue-400 hover:underline">{t('nav.home') || 'Home'}</Link>
        <Link to="/inventories" className="text-blue-600 dark:text-blue-400 hover:underline">{t('nav.inventories')}</Link>
      </div>
    </div>
  );
}
