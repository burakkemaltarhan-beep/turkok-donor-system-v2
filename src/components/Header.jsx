import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';

export default function Header({ currentUser }) {
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Çıkış yapma hatası:", err);
    }
  };

  return (
    <header className="bg-slate-900 text-white shadow-md py-3 px-6 mb-6 border-b border-slate-800">
      <div className="max-w-6xl mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <span className="text-xl">🩸</span>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-white">TÜRKÖK Kök Hücre Koordinasyon</h1>
            <p className="text-[10px] text-slate-400">Bağışçı ve Süreç Takip Sistemi V2.0</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs bg-slate-800 border border-slate-700 text-slate-200 py-1.5 px-3 rounded-full font-medium">
            👤 {currentUser || "Giriş Yapılmadı"}
          </span>
          <button 
            onClick={handleLogout}
            className="text-xs bg-red-600/90 hover:bg-red-600 text-white py-1.5 px-3 rounded-full font-medium transition cursor-pointer"
          >
            Çıkış Yap
          </button>
        </div>
      </div>
    </header>
  );
}