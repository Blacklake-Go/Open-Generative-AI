'use client';

import React, { useState } from 'react';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { getMegaNavCategories, getMegaNavCopy } from '../../config/mega-navigation';
import MegaMenuPanel from './MegaMenuPanel';
import NavBadge from './NavBadge';
import {
  FOCUS_RING,
  PILL_SEGMENT_ACTIVE,
  PILL_SEGMENT_IDLE,
  PILL_SEGMENT_TRACK,
  withoutRadiusUtilities,
} from 'studio/ui/tokens';

/**
 * 顶栏水平导航与双栏 Mega Menu 组件 (严格遵循 UI_DESIGN_SYSTEM.md 规范)
 *
 * @param {Object} props
 * @param {string} props.activeTab 当前激活的工作室 Tab ID (如 'image', 'video' 等)
 * @param {string} props.locale 语言代码 ('zh' | 'en')
 * @param {Function} props.onSelectTab 切换 Tab 时的回调
 * @param {string} props.className 外部额外类名
 */
export default function TopMegaNavigation({
  activeTab = 'image',
  locale = 'zh',
  onSelectTab,
  className = '',
}) {
  const categories = getMegaNavCategories(locale);
  const copy = getMegaNavCopy(locale);
  const [currentOpenValue, setCurrentOpenValue] = useState('');

  // 处理菜单项点击
  const handleItemClick = (e, item, cat) => {
    setCurrentOpenValue('');
    const targetTabId = item.tabId || cat?.tabId || (item.modelKey ? 'image' : null);
    if (targetTabId && onSelectTab) {
      onSelectTab(e, targetTabId, item.modelKey);
    }
  };

  return (
    <NavigationMenu.Root
      value={currentOpenValue}
      onValueChange={setCurrentOpenValue}
      delayDuration={120}
      skipDelayDuration={300}
      className={`${PILL_SEGMENT_TRACK} relative z-header min-w-0 ${withoutRadiusUtilities(className)}`}
    >
      <NavigationMenu.List className="m-0 flex list-none items-center gap-1 overflow-x-auto p-0 scrollbar-rail">

        {/* 首页/探索入口 (纯链接) */}
        <NavigationMenu.Item>
          <NavigationMenu.Link
            href="/studio"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-sm font-medium text-ink-muted transition-[background-color,color,box-shadow] duration-fast ${PILL_SEGMENT_IDLE} ${FOCUS_RING}`}
          >
            {copy.explore}
          </NavigationMenu.Link>
        </NavigationMenu.Item>

        {/* 各主分类 Mega Menu (图像、视频、音频、智能体、社区) */}
        {categories.map((cat) => {
          const label = cat.label;
          const isCategoryActive = cat.features?.some((f) => f.tabId === activeTab);

          return (
            <NavigationMenu.Item key={cat.id} value={cat.id}>
              <NavigationMenu.Trigger
                className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-body-sm font-medium transition-[background-color,color,box-shadow] duration-fast select-none ${FOCUS_RING} ${
                  isCategoryActive
                    ? `font-semibold ${PILL_SEGMENT_ACTIVE}`
                    : `${PILL_SEGMENT_IDLE} data-[state=open]:bg-wash-strong data-[state=open]:text-ink`
                }`}
              >
                <span>{label}</span>
                {cat.badge && <NavBadge badge={cat.badge} />}
                <svg
                  className="size-3 text-ink-muted transition-transform duration-fast ease-in-out group-data-[state=open]:rotate-180 group-hover:text-ink"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </NavigationMenu.Trigger>

              <NavigationMenu.Content className="animate-fade-in duration-fast">
                <MegaMenuPanel
                  category={cat}
                  locale={locale}
                  onItemClick={handleItemClick}
                />
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          );
        })}

      </NavigationMenu.List>

      {/* 浮层视口容器 (Radix Viewport) */}
      <div className="absolute left-0 top-full mt-2 flex justify-start">
        <NavigationMenu.Viewport className="relative overflow-hidden rounded-2xl shadow-elevation-3 transition-[width,height] duration-fast ease-standard" />
      </div>
    </NavigationMenu.Root>
  );
}
