'use client';

import { useState, useEffect } from 'react';
import { X, Folder, FolderOpen, CornerDownRight, Check, Loader2, Inbox } from 'lucide-react';

export default function MoveToFolderModal({
  isOpen,
  onClose,
  onMove,
  folderTree = [],
  currentFolderId = null,
  assetCount = 1,
}) {
  const [selectedFolderId, setSelectedFolderId] = useState(currentFolderId || 'root');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    try {
      setLoading(true);
      setError('');
      const targetId = selectedFolderId === 'root' ? null : selectedFolderId;
      await onMove(targetId);
      onClose();
    } catch (err) {
      setError(err.message || '移动失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-scrim backdrop-blur-xl animate-in fade-in duration-modal ease-enter"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-overlay p-6 shadow-elevation-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-ink">移动素材至分类</h3>
              <p className="text-xs text-ink-muted">已选择 {assetCount} 项生成素材</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-ink-muted hover:bg-well hover:text-ink active:scale-95 active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
            title="关闭"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-1 pr-1 scrollbar-thin scrollbar-thumb-line">
          {/* 根目录/未分类选项 */}
          <button
            type="button"
            onClick={() => setSelectedFolderId('root')}
            className={`
              w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer
              ${selectedFolderId === 'root' 
                ? 'bg-brand-soft text-brand border border-brand-line font-medium' 
                : 'text-ink-muted hover:bg-well hover:text-ink border border-transparent active:scale-[0.99] active:duration-instant'}
            `}
          >
            <div className="flex items-center gap-2.5">
              <Inbox className="w-4 h-4 text-ink-muted" />
              <span className="text-sm">未分类 (根目录)</span>
            </div>
            {selectedFolderId === 'root' && <Check className="w-4 h-4 text-brand" />}
          </button>

          {/* 文件夹树 */}
          {folderTree.map((folder) => {
            const isSelected = selectedFolderId === folder.id;
            const hasChildren = Array.isArray(folder.children) && folder.children.length > 0;

            return (
              <div key={folder.id} className="space-y-1">
                {/* 一级文件夹 */}
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={`
                    w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-[background-color,color,border-color,transform] duration-fast ease-standard cursor-pointer
                    ${isSelected 
                      ? 'bg-brand-soft text-brand border border-brand-line font-medium' 
                      : 'text-ink hover:bg-well border border-transparent active:scale-[0.99] active:duration-instant'}
                  `}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="w-4 h-4 flex-shrink-0" style={{ color: folder.color || 'var(--brand)' }} />
                    <span className="text-sm truncate">{folder.name}</span>
                    <span className="text-[11px] text-ink-muted px-1.5 py-0.5 rounded bg-well">
                      {folder.asset_count || 0}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-brand" />}
                </button>

                {/* 二级子文件夹 */}
                {hasChildren && (
                  <div className="ml-5 pl-2 border-l border-line-subtle space-y-1">
                    {folder.children.map((sub) => {
                      const isSubSelected = selectedFolderId === sub.id;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedFolderId(sub.id)}
                          className={`
                            w-full flex items-center justify-between px-3 py-2 rounded-lg text-left transition-[background-color,color,border-color,transform] duration-fast ease-standard text-xs cursor-pointer
                            ${isSubSelected 
                              ? 'bg-brand-soft text-brand border border-brand-line font-medium' 
                              : 'text-ink-muted hover:bg-well hover:text-ink border border-transparent active:scale-[0.99] active:duration-instant'}
                          `}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <CornerDownRight className="w-3.5 h-3.5 text-ink-muted/60" />
                            <span className="truncate">{sub.name}</span>
                            <span className="text-[10px] text-ink-muted px-1 py-0.5 rounded bg-well">
                              {sub.asset_count || 0}
                            </span>
                          </div>
                          {isSubSelected && <Check className="w-3.5 h-3.5 text-brand" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {folderTree.length === 0 && (
            <div className="py-6 text-center text-xs text-ink-muted">
              您当前还没有创建任何自定义分类文件夹
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 rounded-xl bg-danger-soft border border-danger-line px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2 text-xs font-medium text-ink-muted hover:bg-well hover:text-ink active:scale-95 active:duration-instant transition-[background-color,color,transform] duration-fast ease-standard cursor-pointer disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover active:bg-brand-active active:scale-[0.98] active:duration-instant px-5 py-2 text-xs font-semibold text-ink-on-accent shadow-elevation-1 transition-[background-color,transform] duration-fast ease-standard disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            确认移动
          </button>
        </div>
      </div>
    </div>
  );
}
