import React from 'react';
import { Link } from 'react-router-dom';
import { Package, Boxes } from 'lucide-react';

export default function InventoryCard({ inventory, showItemCount = false }) {
  if (!inventory) return null;
  const { id, name, title, description, itemCount, image, imageUrl, cover, coverImage } = inventory;
  const displayTitle = name || title;
  // Handle different possible image source fields and ensure the URL is complete
  const getImageUrl = (img) => {
    if (!img) return null;
    // If it's already a full URL or data URL, return as is
    if (typeof img === 'string' && (img.startsWith('http') || img.startsWith('data:'))) {
      return img;
    }
    // If it's an object with a URL property (common in some API responses)
    if (img && typeof img === 'object' && img.url) {
      return img.url.startsWith('http') ? img.url : `${process.env.REACT_APP_API_URL || ''}${img.url}`;
    }
    // If it's just a path, prepend the API URL if needed
    return img.startsWith('/') ? `${process.env.REACT_APP_API_URL || ''}${img}` : img;
  };

  const coverSrc = getImageUrl(image) || getImageUrl(imageUrl) || getImageUrl(coverImage) || getImageUrl(cover) || null;

  return (
    <Link
      to={`/inventories/${id}`}
      className="block bg-white dark:bg-gray-800 rounded-xl p-5 shadow hover:shadow-lg transition-shadow border border-gray-200 dark:border-gray-700 h-full"
    >
      <div className="flex items-start gap-4">
        {coverSrc ? (
          <div className="relative shrink-0 w-16 h-16 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
            <img
              src={coverSrc}
              alt={displayTitle}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = `
                  <div class="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-700">
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                `;
              }}
            />
          </div>
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
