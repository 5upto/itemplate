import React from 'react';
import { Link } from 'react-router-dom';

export default function TagCloud({ tags }) {
  const list = Array.isArray(tags) ? tags : [];
  if (list.length === 0) {
    return <p className="text-gray-600">No tags available.</p>;
  }

  // Compute sizes based on frequency
  // Server returns inventoryCount; fall back to count; default 1
  const getCount = (t) => Number(t?.inventoryCount ?? t?.count ?? 1) || 1;
  const counts = list.map(getCount);
  const maxCount = Math.max(...counts);
  const minCount = Math.min(...counts);
  const range = Math.max(1, maxCount - minCount);

  const sizeFor = (count) => {
    const norm = (count - minCount) / range; // 0..1
    const min = 0.85, max = 1.35;
    return (min + norm * (max - min)).toFixed(2);
  };

  return (
    <div className="flex flex-wrap gap-3">
      {list.map((tag) => (
        <Link
          key={tag?.id || tag?.name}
          to={`/search?q=${encodeURIComponent('#' + (tag?.name ?? ''))}`}
          className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
          style={{ fontSize: `${sizeFor(getCount(tag))}rem` }}
          title={`${tag?.name ?? ''} (${getCount(tag)})`}
        >
          #{tag?.name}
        </Link>
      ))}
    </div>
  );
}
