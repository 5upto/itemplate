import React from 'react';
import { Link } from 'react-router-dom';
import { Package, Boxes } from 'lucide-react';

export default function InventoryCard({ inventory, showItemCount = false }) {
  if (!inventory) return null;
  const { id, name, title, description, itemCount, image, imageUrl, cover, coverImage } = inventory;
  const displayTitle = name || title;
  const coverSrc = image || imageUrl || coverImage || cover || null;

  return (
    <Link
      to={`/inventories/${id}`}
      className="block bg-white dark:bg-gray-800 rounded-xl p-5 shadow hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 h-full"
    >
      <div className="flex items-start gap-4">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={displayTitle}
            className="shrink-0 w-16 h-16 rounded object-cover border border-gray-200 dark:border-gray-700"
          />
        ) : (
          <div className="shrink-0 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            <Package className="h-6 w-6" />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">{displayTitle}</h3>
          {description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{description}</p>
          )}
          {showItemCount && (
            <div className="mt-3 inline-flex items-center text-sm text-gray-700 dark:text-gray-300">
              <Boxes className="h-4 w-4 mr-1" />
              {itemCount ?? 0}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
