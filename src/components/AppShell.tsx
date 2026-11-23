import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Archive,
  BedDouble,
  CalendarDays,
  Camera,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PartyPopper,
  Settings,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useVillaData } from '../contexts/VillaDataContext';
import { getColomboDateStr, getColomboTimeStr } from '../utils/colomboTime';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/bookings': 'All Bookings',
  '/events': 'Events',
  '/shoots': 'Photoshoots',
  '/rooms': 'Rooms & Suites',
  '/payments': 'Payments',
  '/calendar': 'Calendar',
  '/archived': 'Archived Records',
  '/staff': 'Staff Management',
  '/audit-logs': 'Audit Logs',
  '/settings': 'Settings',
};

export const AppShell: React.FC = () => {
  const { currentStaff, logout, inactivityWarningSeconds, extendSession } = useAuth();
  const { notify } = useToast();
  const { settings, dataError } = useVillaData();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const handleLogout = async (reason: 'manual' | 'timeout' = 'manual') => {
    try {
      await logout(reason);
    } catch (error) {
      notify(
        'Logout failed',
        'error',
        error instanceof Error ? error.message : 'Please try again.'
      );
    }
  };

  const isAdmin = currentStaff?.role === 'ADMIN';
  const villaName = settings?.villaName || 'Urban Escape Villa';
  const pageTitle = PAGE_TITLES[location.pathname] || 'Operations';

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
    { to: '/bookings', label: 'All Bookings', icon: ListChecks, adminOnly: false },
    { to: '/events', label: 'Events', icon: PartyPopper, adminOnly: false },
    { to: '/shoots', label: 'Photoshoots', icon: Camera, adminOnly: false },
    { to: '/rooms', label: 'Rooms', icon: BedDouble, adminOnly: false },
    { to: '/payments', label: 'Payments', icon: CreditCard, adminOnly: false },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays, adminOnly: false },
    { to: '/archived', label: 'Archived Records', icon: Archive, adminOnly: false },
    { to: '/staff', label: 'Staff Management', icon: Users, adminOnly: true },
    { to: '/audit-logs', label: 'Audit Logs', icon: ClipboardList, adminOnly: true },
    { to: '/settings', label: 'Settings', icon: Settings, adminOnly: false },
  ].filter((item) => !item.adminOnly || isAdmin);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#183D2D] text-white">
      <div className="px-5 py-6 border-b border-white/10">
        <span
          className="block text-xl font-semibold tracking-tight text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {villaName}
        </span>
        <p className="text-xs text-white/65 mt-1">Private Staff Operations</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-white/15 text-white'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 space-y-2">
        {currentStaff && (
          <div className="px-3 py-2 rounded-lg bg-white/5">
            <p className="text-xs font-medium text-white truncate">{currentStaff.name}</p>
            <p className="text-[11px] text-white/65 truncate">
              {currentStaff.role} · Slot {currentStaff.slotNumber}/4
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleLogout('manual')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F6F2] text-[#1C2420]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-3 text-white/80 hover:text-white p-1"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#E2DFD5] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#3D3F3A] hover:bg-[#F7F6F2]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-[#6E6C63] hidden sm:inline whitespace-nowrap">
                Operations
              </span>
              <span className="text-[#CDC9BC] hidden sm:inline">/</span>
              <h1 className="font-semibold text-[#1C2420] truncate">{pageTitle}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-[#6E6C63] shrink-0">
            <span className="hidden sm:inline font-mono tabular-nums whitespace-nowrap">
              {getColomboDateStr()} · {getColomboTimeStr()} (Asia/Colombo)
            </span>
          </div>
        </header>

        {dataError && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-xs text-[#B91C1C]">
            {dataError}
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Inactivity Session Expiry Warning */}
      {inactivityWarningSeconds !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="bg-white border border-[#E2DFD5] rounded-xl max-w-sm w-full p-6 shadow-xl">
            <div className="flex items-center gap-2.5 text-[#B45309] mb-2">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-semibold text-[#1C2420]">
                Session Expiring Soon
              </h3>
            </div>
            <p className="text-sm text-[#6E6C63] mb-4">
              For villa security, your session will automatically sign out in{' '}
              <span className="font-mono font-semibold text-[#1C2420] tabular-nums">
                {inactivityWarningSeconds}s
              </span>{' '}
              due to inactivity.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void handleLogout('manual')}
                className="px-3.5 py-2 text-xs font-medium text-[#3D3F3A] bg-[#F7F6F2] border border-[#E2DFD5] rounded-lg"
              >
                Logout Now
              </button>
              <button
                type="button"
                onClick={extendSession}
                className="px-4 py-2 text-xs font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg"
              >
                Stay Signed In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
