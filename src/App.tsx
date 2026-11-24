import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { VillaDataProvider } from './contexts/VillaDataContext';
import { ToastProvider } from './contexts/ToastContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/AppShell';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { AllBookingsPage } from './pages/AllBookingsPage';
import { EventsPage } from './pages/EventsPage';
import { ShootsPage } from './pages/ShootsPage';
import { RoomsPage } from './pages/RoomsPage';
import { CalendarPage } from './pages/CalendarPage';
import { ArchivedPage } from './pages/ArchivedPage';
import { StaffManagementPage } from './pages/StaffManagementPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { SettingsPage } from './pages/SettingsPage';
import { WhatsAppRemindersPage } from './pages/WhatsAppRemindersPage';

const RequireStaff: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authReady, firebaseAuthenticated } = useAuth();

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F6F2] text-sm text-[#6E6C63]">
        Checking your sign-in...
      </div>
    );
  }

  if (!firebaseAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentStaff } = useAuth();
  return currentStaff?.role === 'ADMIN' ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const OperationsLayout: React.FC = () => (
  <RequireStaff>
    <VillaDataProvider>
      <AppShell />
    </VillaDataProvider>
  </RequireStaff>
);

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route element={<OperationsLayout />}>
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="bookings" element={<AllBookingsPage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="shoots" element={<ShootsPage />} />
                <Route path="rooms" element={<RoomsPage />} />
                <Route path="payments" element={<Navigate to="/bookings" replace />} />
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
                <Route
                  path="whatsapp-reminders"
                  element={
                    <RequireAdmin>
                      <WhatsAppRemindersPage />
                    </RequireAdmin>
                  }
                />
                <Route path="settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
