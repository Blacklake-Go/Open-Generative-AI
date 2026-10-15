'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Clapperboard,
  Cpu,
  Megaphone,
  Plug2,
  Wallet,
  Shield,
  ChevronDown,
} from 'lucide-react';
import { hasPermission } from '@/lib/admin/permissions';
import { ADMIN_NAV_GROUPS, isItemActive } from '@/lib/admin/navigation';

const NAV_ICONS = {
  LayoutDashboard,
  Users,
  CreditCard,
  Clapperboard,
  Cpu,
  Megaphone,
  Plug2,
  Wallet,
  Shield,
};

export default function AdminNav({ user, onItemClick }) {
  const pathname = usePathname();
  const role = user?.role || 'user';
  const active = (item) => isItemActive(item, pathname);

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    if (!pathname) return initial;
    for (const group of ADMIN_NAV_GROUPS) {
      if (group.items.some((item) => hasPermission(role, item.permission) && active(item))) {
        initial[group.id] = true;
      }
    }
    return initial;
  });

  useEffect(() => {
    if (!pathname) return;
    const next = {};
    for (const group of ADMIN_NAV_GROUPS) {
      if (group.items.some((item) => hasPermission(role, item.permission) && active(item))) next[group.id] = true;
    }
    if (Object.keys(next).length) setOpenGroups((prev) => ({ ...prev, ...next }));
  }, [pathname, role]);

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  return (
    <nav aria-label="管理后台导航" className="space-y-1.5">
      {ADMIN_NAV_GROUPS.map((group) => {
        const IconComponent = NAV_ICONS[group.icon] || LayoutDashboard;
        const visibleItems = group.items.filter((item) => hasPermission(role, item.permission));
        if (!visibleItems.length) return null;

        const hasChildren = visibleItems.length > 1;
        const singleItem = !hasChildren ? visibleItems[0] : null;
        const hasActiveChild = visibleItems.some(active);
        const isOpen = !!openGroups[group.id];
        const defaultHref = visibleItems[0].href;

        if (singleItem) {
          return (
            <div key={group.id}>
              <Link
                href={singleItem.href}
                prefetch={false}
                onClick={onItemClick}
                className={`group relative flex h-[38px] items-center justify-between rounded-lg px-3 text-xs font-medium tracking-[-0.005em] transition-all duration-200 active:scale-[0.98] ${
                  active(singleItem)
                    ? 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 font-semibold'
                    : 'border border-transparent text-gray-400 hover:bg-white/[0.05] hover:text-white hover:border-white/[0.06]'
                }`}
              >
                {active(singleItem) && (
                  <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-cyan-400" />
                )}
                <div className="flex items-center gap-2.5 truncate">
                  <IconComponent
                    className={`size-4 transition-colors ${
                      active(singleItem) ? 'text-cyan-400' : 'text-gray-400 group-hover:text-white'
                    }`}
                  />
                  <span className="truncate">{group.label}</span>
                </div>
              </Link>
            </div>
          );
        }

        return (
          <div key={group.id} className="rounded-lg transition-colors">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              className={`group relative flex h-[38px] w-full items-center justify-between rounded-lg pl-3 pr-2.5 text-xs font-medium tracking-[-0.005em] transition-all duration-200 cursor-pointer ${
                hasActiveChild
                  ? 'bg-white/[0.04] text-white'
                  : 'text-gray-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <div className="flex flex-1 h-full items-center gap-2.5 truncate py-2 text-left">
                <IconComponent
                  className={`size-4 shrink-0 transition-colors ${
                    hasActiveChild ? 'text-cyan-400' : 'text-gray-400 group-hover:text-gray-200'
                  }`}
                />
                <span className={`truncate ${hasActiveChild ? 'font-semibold text-white' : ''}`}>
                  {group.label}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                {hasActiveChild && !isOpen && (
                  <span className="size-1.5 rounded-full bg-cyan-400" />
                )}
                <ChevronDown
                  className={`size-3.5 transition-transform duration-200 ease-out text-gray-400 ${
                    isOpen ? 'rotate-180 text-cyan-300' : 'group-hover:text-gray-200'
                  }`}
                />
              </div>
            </button>

            <div
              className={`grid transition-[grid-template-rows,opacity,visibility] duration-200 ease-out ${
                isOpen ? 'grid-rows-[1fr] opacity-100 visible' : 'grid-rows-[0fr] opacity-0 invisible pointer-events-none'
              }`}
            >
              <div className="overflow-hidden">
                <div className="relative mt-1 ml-4 space-y-1 pl-3 border-l border-white/[0.08] pb-1">
                  {visibleItems.map((item) => {
                    const itemActive = active(item);

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        prefetch={false}
                        onClick={onItemClick}
                        className={`group relative flex h-8 items-center rounded-lg px-2.5 text-xs tracking-[-0.005em] transition-all duration-200 active:scale-[0.98] ${
                          itemActive
                            ? 'border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 font-semibold'
                            : 'border border-transparent text-gray-400 hover:bg-white/[0.05] hover:text-white'
                        }`}
                      >
                        {itemActive && (
                          <span className="absolute -left-[13px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        )}
                        <span
                          className={`mr-2 size-1 rounded-full transition-all duration-200 ${
                            itemActive
                              ? 'bg-cyan-400'
                              : 'bg-white/20 group-hover:bg-white/50'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

