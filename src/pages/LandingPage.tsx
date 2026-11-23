import React from 'react';
import { LockKeyhole } from 'lucide-react';
import { Link } from 'react-router-dom';
import courtyardImage from '../assets/images/villa_hero_courtyard_1795247324664.jpg';

export const LandingPage: React.FC = () => (
  <main className="relative h-screen min-h-[620px] overflow-hidden bg-[#0E241B] text-white">
    <img
      src={courtyardImage}
      alt="Urban Escape Villa surrounded by tropical greenery"
      className="absolute inset-0 h-full w-full object-cover"
    />
    <div className="absolute inset-0 bg-gradient-to-r from-[#07130F]/80 via-[#07130F]/38 to-transparent" />
    <div className="absolute inset-0 bg-gradient-to-t from-[#07130F]/65 via-transparent to-[#07130F]/25" />

    <header className="absolute inset-x-0 top-0 z-20">
      <nav
        aria-label="Main navigation"
        className="flex items-center justify-between px-3 py-3 sm:px-5 sm:py-5"
      >
        <a
          href="#"
          className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Urban Escape Villa
        </a>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur-md transition hover:bg-white/20"
        >
          <LockKeyhole className="h-4 w-4" />
          Staff sign in
        </Link>
      </nav>
    </header>

    <div className="absolute bottom-[36px] left-3 z-10 sm:bottom-[44px] sm:left-3 lg:left-3">
      <p className="mb-5 text-sm font-medium uppercase tracking-[0.32em] text-white/90">
        A private villa retreat
      </p>
      <h1
        className="text-[68px] leading-[0.82] tracking-[-0.035em] sm:text-[82px] lg:text-[96px]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Make room
        <br />
        for <span className="italic">slow days.</span>
      </h1>
    </div>
  </main>
);
