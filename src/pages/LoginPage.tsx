import React, { useEffect } from 'react';
import { Lock, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const LoginPage: React.FC = () => {
  const {
    firebaseUser,
    firebaseAuthenticated,
    authReady,
    signingIn,
    accessError,
    signInWithGoogle,
    logout,
  } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authReady && firebaseAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [authReady, firebaseAuthenticated, navigate]);

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#F7F6F2]">
      {/* Left Architectural Editorial Column */}
      <div className="relative lg:col-span-7 min-h-[260px] lg:min-h-screen overflow-hidden bg-[#0E241B]">
        <img
          src="/src/assets/images/villa_hero_courtyard_1795247324664.jpg"
          alt="Urban Escape Villa courtyard and infinity pool"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0E241B]/90 via-[#0E241B]/45 to-[#0E241B]/30" />
        <div className="relative z-10 h-full flex flex-col justify-between p-8 sm:p-12 text-white">
          <div>
            <p className="text-xs tracking-wider text-white/80 font-medium">
              Internal Estate Operations
            </p>
            <h1
              className="text-3xl sm:text-5xl font-semibold tracking-tight mt-2 text-balance max-w-xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Urban Escape Villa
            </h1>
          </div>

          <div className="max-w-lg hidden sm:block">
            <p className="text-sm text-white/85 leading-relaxed">
              Private operations console for authorized villa management staff. Coordinates
              estate events, photoshoots, suite reservations, and centralized financial ledgers.
            </p>
            <div className="flex items-center gap-3 text-xs text-white/70 mt-4 font-mono">
              <span>Asia/Colombo (UTC+05:30)</span>
              <span aria-hidden="true">·</span>
              <span>Max 4 Staff Accounts</span>
              <span aria-hidden="true">·</span>
              <span>Audited Access</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Authentication Panel */}
      <div className="lg:col-span-5 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md bg-white border border-[#E2DFD5] rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-2.5 text-[#183D2D] mb-2">
            <Lock className="w-4 h-4" />
            <span className="text-xs font-semibold tracking-wide">
              Authorized Staff Access Only
            </span>
          </div>

          <h2 className="text-2xl font-semibold text-[#1C2420] tracking-tight">
            Sign in to Operations
          </h2>
          <p className="text-sm text-[#6E6C63] mt-1.5 leading-relaxed">
            Public registration is disabled. Sign in with one of the 4 staff Google accounts
            authorized by the villa administrator.
          </p>

          {accessError && (
            <div className="mt-5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] p-4 text-xs text-[#B91C1C] leading-relaxed">
              {accessError}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {firebaseAuthenticated && firebaseUser ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-[#E2DFD5] bg-[#F7F6F2] p-3.5 text-xs">
                  <p className="text-[#6E6C63]">Signed in as</p>
                  <p className="font-mono font-medium text-[#1C2420] mt-0.5 truncate">
                    {firebaseUser.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => signInWithGoogle()}
                  disabled={signingIn}
                  className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{signingIn ? 'Verifying...' : 'Switch Google Account'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => logout('manual')}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-[#3D3F3A] bg-[#F7F6F2] hover:bg-[#EFEDE6] border border-[#E2DFD5] rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 text-sm font-medium text-white bg-[#183D2D] hover:bg-[#112D21] rounded-lg transition-colors disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81"
                  />
                </svg>
                <span>{signingIn ? 'Authenticating...' : 'Continue with Google'}</span>
              </button>
            )}
          </div>

          <div className="mt-8 pt-5 border-t border-[#E2DFD5] text-xs text-[#6E6C63] space-y-1">
            <p>Security controls active:</p>
            <p className="font-mono text-[11px] text-[#3D3F3A]">
              Role-based access · Automatic inactivity timeout · Immutable audit trail
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
