import React from 'react';
import { useTranslation } from 'react-i18next';

export default function DeleteModal({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isLoading = false,
  onConfirm,
  onClose,
}) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white shadow-lg border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {title || t('common.delete')}
        </h3>
        {description && (
          <p className="text-sm text-gray-600 mb-4">{description}</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
            disabled={isLoading}
          >
            {cancelLabel || t('common.cancel')}
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? t('common.loading') : (confirmLabel || t('common.delete'))}
          </button>
        </div>
      </div>
    </div>
  );
}
