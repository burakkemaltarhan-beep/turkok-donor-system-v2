import React from 'react';

export default function StatsBar({ donors }) {
  const total = donors.length;
  
  // Metrik hesaplamaları
  const pendingHealthCheck = donors.filter(
    (d) => !d.healthCheck?.done
  ).length;

  const pendingIdm = donors.filter(
    (d) => (d.idmStatus || 'Bekliyor') === 'Bekliyor'
  ).length;

  const activeVaccines = donors.filter(
    (d) => d.vaccineSchedule?.startDate && !(d.vaccineSchedule?.day1 && d.vaccineSchedule?.day2 && d.vaccineSchedule?.day3 && d.vaccineSchedule?.day4)
  ).length;

  const completedApheresis = donors.filter(
    (d) => d.apheresis?.completed
  ).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {/* Toplam Bağışçı */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Toplam Kayıt</span>
          <span className="text-xl font-bold text-slate-900">{total}</span>
        </div>
        <span className="text-2xl p-2 bg-slate-50 rounded-xl">📋</span>
      </div>

      {/* Sağlık Kontrolü Bekleyen */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Kontrol Bekleyen</span>
          <span className="text-xl font-bold text-amber-600">{pendingHealthCheck}</span>
        </div>
        <span className="text-2xl p-2 bg-amber-50 rounded-xl">🩺</span>
      </div>

      {/* Tetkik / IDM Bekleyen */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">IDM Bekleyen</span>
          <span className="text-xl font-bold text-sky-600">{pendingIdm}</span>
        </div>
        <span className="text-2xl p-2 bg-sky-50 rounded-xl">🧪</span>
      </div>

      {/* Aşı Sürecinde */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Aktif Aşı Takibi</span>
          <span className="text-xl font-bold text-indigo-600">{activeVaccines}</span>
        </div>
        <span className="text-2xl p-2 bg-indigo-50 rounded-xl">💉</span>
      </div>

      {/* Aferez Tamamlanan */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between col-span-2 lg:col-span-1">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Aferez Tamam</span>
          <span className="text-xl font-bold text-emerald-600">{completedApheresis}</span>
        </div>
        <span className="text-2xl p-2 bg-emerald-50 rounded-xl">🩸</span>
      </div>
    </div>
  );
}