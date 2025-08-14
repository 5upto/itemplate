import React from 'react';
import { useTranslation } from 'react-i18next';

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
    try {
      localStorage.setItem('language', lng);
    } catch {}
  };

  return (
    <div className="inline-flex items-center space-x-2">
      <label className="text-sm text-gray-700 dark:text-gray-300 hidden sm:block">
        {t('nav.language')}
      </label>
      <select
        value={i18n.language}
        onChange={(e) => changeLanguage(e.target.value)}
        className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 text-sm rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={t('nav.language')}
      >
        <option value="en">EN</option>
        <option value="es">ES</option>
      </select>
    </div>
  );
}
