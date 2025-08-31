import React from 'react';
import { Link } from 'react-router-dom';

export default function TagCloud({ tags = [] }) {
  // Ensure tags is an array and filter out any invalid entries
  const validTags = Array.isArray(tags) 
    ? tags.filter(tag => tag && (tag.id || tag.name))
    : [];

  if (validTags.length === 0) {
    return <p className="text-gray-600 text-sm">No tags available.</p>;
  }

  // Compute sizes based on frequency or count
  const getCount = (tag) => {
    if (tag === null || typeof tag !== 'object') return 1;
    return Number(tag.inventoryCount ?? tag.count ?? 1) || 1;
  };

  const counts = validTags.map(getCount);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const range = Math.max(1, maxCount - minCount);

  const sizeFor = (count) => {
    const norm = range > 0 ? (count - minCount) / range : 0.5;
    const minSize = 0.85, maxSize = 1.35;
    return (minSize + norm * (maxSize - minSize)).toFixed(2);
  };

  return (
    <div className="flex flex-wrap gap-2" role="list" aria-label="Tag cloud">
      {validTags.map((tag) => {
        const tagName = tag?.name?.trim() || 'tag';
        const count = getCount(tag);
        const size = sizeFor(count);
        
        return (
          <Link
            key={tag.id || tagName}
            to={`/search?q=${encodeURIComponent('#' + tagName)}`}
            className={`
              px-3 py-1 rounded-full
              bg-blue-50 dark:bg-blue-900
              text-blue-700 dark:text-blue-200
              border border-blue-200 dark:border-blue-700
              hover:bg-blue-100 dark:hover:bg-blue-800
              transition-colors
              whitespace-nowrap
              text-sm
            `}
            style={{ fontSize: `${size}rem` }}
            aria-label={`Tag: ${tagName} (${count} items)`}
            title={`${tagName} (${count} items)`}
          >
            #{tagName}
          </Link>
        );
      })}
    </div>
  );
}
