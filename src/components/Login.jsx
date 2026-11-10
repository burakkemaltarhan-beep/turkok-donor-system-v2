import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const fullEmail = email.includes('@') ? email : `${email.toLowerCase().trim()}@kizilay.org.tr`;
      await signInWithEmailAndPassword(auth, fullEmail, password);
    } catch (err) {
      console.error("Giriş hatası:", err);
      setError("Giriş başarısız. Kullanıcı adı veya şifre hatalı.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-sm w-full p-6 space-y-5">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-50 text-red-600 text-2xl font-bold mb-2">
            🩸
          </div>
          <h2 className="text-lg font-bold text-slate-800">TÜRKÖK Giriş Paneli</h2>
          <p className="text-xs text-slate-500">Bağışçı ve Süreç Takip Sistemi V2.0</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded-lg text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Yetkili Kullanıcı / E-posta</label>
            <input 
              type="text" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="batuhan, yigit, behlul..."
              className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">Şifre</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 focus:bg-white focus:outline-indigo-500"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition shadow-sm disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'Doğrulanıyor...' : 'Güvenli Giriş Yap'}
          </button>
        </form>

        <p className="text-[11px] text-center text-slate-400">
          Yetkili erişimi sınırlıdır. Tüm oturum hareketleri kayıt altına alınır.
        </p>
      </div>
    </div>
  );
}