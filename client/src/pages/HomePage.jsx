import React from 'react';
import { useQuery } from 'react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Package, TrendingUp, Clock, Tag } from 'lucide-react';

import axios from 'axios';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import InventoryCard from '../components/Inventory/InventoryCard';
import TagCloud from '../components/UI/TagCloud';
import { useAuth } from '../contexts/AuthContext';

const HomePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const { data: latestInventories, isLoading: loadingLatest } = useQuery(
    'latestInventories',
    () => axios.get('/api/inventories/latest').then(res => res.data),
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: popularInventories, isLoading: loadingPopular } = useQuery(
    'popularInventories',
    () => axios.get('/api/inventories/popular').then(res => res.data),
    { staleTime: 5 * 60 * 1000 }
  );

  const { data: tags, isLoading: loadingTags } = useQuery(
    'tags',
    () => axios.get('/api/tags').then(res => res.data),
    { staleTime: 10 * 60 * 1000 }
  );

  // When logged in, load a small personalized slice for Home
  const {
    data: myInvData,
    isLoading: loadingMyInv,
  } = useQuery(
    ['user:inventories:home', user?.id],
    () => axios.get(`/api/users/${user.id}/inventories`).then((r) => r.data),
    { enabled: !!user?.id, staleTime: 2 * 60 * 1000 }
  );

  // Safety helpers for potentially non-array API results
  const safeArray = (v) => (Array.isArray(v) ? v : []);

  const popularItemTotal = safeArray(popularInventories).reduce(
    (sum, inv) => sum + (inv.itemCount || 0),
    0
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5
      }
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-12"
    >
      {/* Hero Section */}
      <motion.section 
        variants={itemVariants}
        className="text-center py-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl text-white shadow-2xl"
      >
        <div className="max-w-4xl mx-auto px-6">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Package className="h-20 w-20 mx-auto mb-6 text-blue-100" />
          </motion.div>
          <motion.h1 
            variants={itemVariants}
            className="text-5xl md:text-6xl font-bold mb-6 leading-tight"
          >
            {user ? `Welcome back${user.firstName ? ", " + user.firstName : ''}!` : t('home.welcome')}
          </motion.h1>
          <motion.p 
            variants={itemVariants}
            className="text-xl md:text-2xl mb-8 text-blue-100 leading-relaxed"
          >
            {user ? 'Quickly jump back into your inventories or create a new one.' : t('home.subtitle')}
          </motion.p>
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              to="/inventories"
              className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-blue-50 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
            >
              {t('home.exploreInventories')}
            </Link>
            {user ? (
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  to="/inventories/create"
                  className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
                >
                  Create Inventory
                </Link>
                <Link
                  to={user?.id ? `/profile/${user.id}` : '/profile'}
                  className="bg-white/10 border-2 border-white/40 text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
                >
                  Go to Profile
                </Link>
              </div>
            ) : (
              <Link
                to="/login"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold text-lg hover:bg-white hover:text-blue-600 transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
              >
                {t('home.getStarted')}
              </Link>
            )}
          </motion.div>
        </div>
      </motion.section>

      {/* Personalized section for authenticated users */}
      {user && (
        <motion.section variants={itemVariants} className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Your Inventories</h2>
            <Link
              to="/inventories/create"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
            >
              + Create
            </Link>
          </div>

          {loadingMyInv ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            (() => {
              const owned = Array.isArray(myInvData?.owned) ? myInvData.owned : [];
              return owned.length === 0 ? (
                <div className="text-center bg-white dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-700 dark:text-gray-300 mb-4">You don't have any inventories yet.</p>
                  <Link
                    to="/inventories/create"
                    className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md"
                  >
                    Create your first inventory
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {owned.slice(0, 8).map((inv, index) => (
                    <motion.div
                      key={inv.id}
                      variants={itemVariants}
                      custom={index}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <InventoryCard inventory={{ ...inv, itemCount: inv.itemCount ?? 0 }} />
                    </motion.div>
                  ))}
                </div>
              );
            })()
          )}
        </motion.section>
      )}

      {/* Stats Section */}
      <motion.section variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg text-center border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
          <Package className="h-12 w-12 mx-auto mb-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {safeArray(latestInventories).length || 0}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">{t('home.stats.inventories')}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg text-center border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
          <TrendingUp className="h-12 w-12 mx-auto mb-4 text-green-600 dark:text-green-400" />
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{popularItemTotal}</h3>
          <p className="text-gray-600 dark:text-gray-400">{t('home.stats.items')}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg text-center border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow">
          <Tag className="h-12 w-12 mx-auto mb-4 text-purple-600 dark:text-purple-400" />
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {tags?.length || 0}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">{t('home.stats.tags')}</p>
        </div>
      </motion.section>

      {/* Latest Inventories */}
      <motion.section variants={itemVariants}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {t('home.latestInventories')}
            </h2>
          </div>
          <Link
            to="/inventories"
            className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
          >
            {t('home.viewAll')} →
          </Link>
        </div>

        {loadingLatest ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {safeArray(latestInventories).slice(0, 8).map((inventory, index) => (
              <motion.div
                key={inventory.id}
                variants={itemVariants}
                custom={index}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <InventoryCard inventory={inventory} />
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>

      {/* Popular Inventories */}
      <motion.section variants={itemVariants}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-3">
            <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {t('home.popularInventories')}
            </h2>
          </div>
        </div>

        {loadingPopular ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {safeArray(popularInventories).map((inventory, index) => (
              <motion.div
                key={inventory.id}
                variants={itemVariants}
                custom={index}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <InventoryCard inventory={inventory} showItemCount />
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>

      {/* Tag Cloud */}
      <motion.section variants={itemVariants}>
        <div className="flex items-center space-x-3 mb-8">
          <Tag className="h-6 w-6 text-purple-600 dark:text-purple-400" />
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {t('home.tagCloud')}
          </h2>
        </div>

        {loadingTags ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-700">
            <TagCloud tags={tags || []} />
          </div>
        )}
      </motion.section>

      {/* Call to Action */}
      <motion.section 
        variants={itemVariants}
        className="text-center py-16 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
      >
        <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          {t('home.cta.title')}
        </h2>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-2xl mx-auto">
          {t('home.cta.description')}
        </p>
        {user ? (
          <Link
            to="/inventories/create"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
          >
            Create Inventory
          </Link>
        ) : (
          <Link
            to="/login"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors shadow-lg hover:shadow-xl transform hover:scale-105 duration-200"
          >
            {t('home.cta.button')}
          </Link>
        )}
      </motion.section>
    </motion.div>
  );
};

export default HomePage;