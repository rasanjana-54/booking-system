import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { VillaDataProvider } from './contexts/VillaDataContext';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AllBookingsPage } from './pages/AllBookingsPage';
import { EventsPage } from './pages/EventsPage';
import { ShootsPage } from './pages/ShootsPage';
import { RoomsPage } from './pages/RoomsPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CalendarPage } from './pages/CalendarPage';
import { ArchivedPage } from './pages/ArchivedPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';

const RequireStaff: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authReady, currentStaff } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-7 h-7 border-2 border-[#183D2D] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-[#6E6C63]">Verifying staff authorization...</p>
        </div>
      </div>
    );
  }

  if (!currentStaff || !currentStaff.isActive) {
    return <LoginPage />;
  }

  return <>{children}</>;
};

const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentStaff } = useAuth();
  if (currentStaff?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <VillaDataProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route
                  path="/"
                  element={
                    <RequireStaff>
                      <AppShell />
                    </RequireStaff>
                  }
                >
                  <Route index element={<DashboardPage />} />
                  <Route path="bookings" element={<AllBookingsPage />} />
                  <Route path="events" element={<EventsPage />} />
                  <Route path="shoots" element={<ShootsPage />} />
                  <Route path="rooms" element={<RoomsPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="calendar" element={<CalendarPage />} />
                  <Route path="archived" element={<ArchivedPage />} />
                  <Route
                    path="staff"
                    element={
                      <RequireAdmin>
                        <StaffManagementPage />
                      </RequireAdmin>
                    }
                  />
                  <Route
                    path="audit-logs"
                    element={
                      <RequireAdmin>
                        <AuditLogsPage />
                      </RequireAdmin>
                    }
                  />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </VillaDataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
