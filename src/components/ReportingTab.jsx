import React from 'react';

const teamMembers = ["Burak", "Özkan", "Yiğit", "Batuhan", "Behlül", "Yunus"];
const hospitals = ["İzmir Şehir Hastanesi", "Yeşilyurt", "Belirtilmedi"];
const hospitalColors = ['#0ea5e9', '#6366f1', '#94a3b8']; // Sky, Indigo, Slate

export default function ReportingTab({ donors = [] }) {
  // 1. TAMAMLANAN SAĞLIK KONTROLLERİ HESAPLAMASI
  let hcTotal = 0;
  const hcHospitalCounts = [0, 0, 0];

  donors.forEach((d) => {
    let hIndex = hospitals.indexOf(d.hospital);
    if (hIndex === -1) hIndex = 2; // Belirtilmedi
    if (d.healthCheck && d.healthCheck.completed) {
      hcTotal++;
      hcHospitalCounts[hIndex]++;
    }
  });

  // 2. TAMAMLANAN NAKİLLER (10. Dozu Bitenler) HESAPLAMASI
  let transplantTotal = 0;
  const transplantHospitalCounts = [0, 0, 0];

  donors.forEach((d) => {
    let hIndex = hospitals.indexOf(d.hospital);
    if (hIndex === -1) hIndex = 2;
    if (d.vaccineDates && !d.vaccinePostponed) {
      const dose10 = d.vaccineDates.find((v) => v.label && v.label.includes('10. Doz'));
      if (dose10 && dose10.completed) {
        transplantTotal++;
        transplantHospitalCounts[hIndex]++;
      }
    }
  });

  // 3. PERSONEL BAZLI ADIM DAĞILIMLARI
  const getCountsForField = (fieldKey) => {
    const counts = {};
    teamMembers.forEach((m) => (counts[m] = 0));
    donors.forEach((d) => {
      const step = d[fieldKey];
      if (step && step.completed && step.completedBy) {
        if (counts[step.completedBy] !== undefined) {
          counts[step.completedBy]++;
        }
      }
    });
    return teamMembers.map((m) => ({ name: m, count: counts[m] || 0 }));
  };

  // 4. PERSONEL BAZLI TOPLAM AŞI DOZU DAĞILIMI
  const getVaccineCounts = () => {
    const counts = {};
    teamMembers.forEach((m) => (counts[m] = 0));
    donors.forEach((d) => {
      if (d.vaccineDates) {
        d.vaccineDates.forEach((v) => {
          if (v.completed && v.completedBy) {
            if (counts[v.completedBy] !== undefined) {
              counts[v.completedBy]++;
            }
          }
        });
      }
    });
    return teamMembers.map((m) => ({ name: m, count: counts[m] || 0 }));
  };

  const performanceReports = [
    { title: 'Sağlık Kontrolü Dağılımı', data: getCountsForField('healthCheck'), color: '#6366f1' },
    { title: 'Halk Sağlığı Dağılımı', data: getCountsForField('publicHealth'), color: '#0ea5e9' },
    { title: 'Nakil Merkezi Tüpü Dağılımı', data: getCountsForField('transplantTube'), color: '#10b981' },
    { title: 'IDM Dağılımı', data: getCountsForField('idm'), color: '#f59e0b' },
    { title: 'Nakil Sonrası Sağlık Kontrolü Dağılımı', data: getCountsForField('postTransplantCheck'), color: '#8b5cf6' },
    { title: 'Aşı Dozları Dağılımı (Toplam)', data: getVaccineCounts(), color: '#ec4899' },
  ];

  return (
    <div className="space-y-6">
      {/* 1. BÖLÜM: ÜST 2 BÜYÜK HASTANE ÖZET KARTI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sağlık Kontrolleri Kartı */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-indigo-100 space-y-4">
          <h2 className="text-sm font-bold text-slate-700 text-center">
            🏥 Tamamlanan Sağlık Kontrolleri
          </h2>
          <div className="text-center border-b border-slate-100 pb-3">
            <span className="text-5xl font-black text-indigo-600 tracking-tight block">
              {hcTotal}
            </span>
            <span className="text-[11px] font-medium text-slate-500 block mt-1 uppercase tracking-wider">
              Toplam Bağışçı Sayısı
            </span>
          </div>

          <DoughnutSummary
            labels={hospitals}
            values={hcHospitalCounts}
            colors={hospitalColors}
            total={hcTotal}
          />
        </div>

        {/* Nakiller (10. Doz Bitenler) Kartı */}
        <div className="bg-white p-5 rounded-2xl shadow-xs border border-emerald-100 space-y-4">
          <h2 className="text-sm font-bold text-slate-700 text-center">
            💉 Tamamlanan Nakiller (10. Doz Bitenler)
          </h2>
          <div className="text-center border-b border-slate-100 pb-3">
            <span className="text-5xl font-black text-emerald-600 tracking-tight block">
              {transplantTotal}
            </span>
            <span className="text-[11px] font-medium text-slate-500 block mt-1 uppercase tracking-wider">
              Toplam Bağışçı Sayısı
            </span>
          </div>

          <DoughnutSummary
            labels={hospitals}
            values={transplantHospitalCounts}
            colors={hospitalColors}
            total={transplantTotal}
          />
        </div>
      </div>

      {/* 2. BÖLÜM: PERSONEL PERFORMANS RAPORLARI */}
      <div className="bg-white p-6 rounded-2xl shadow-xs border border-slate-200 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <span>📊</span> Personel Performans Raporları
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ekip üyelerinin tamamladığı operasyonel süreçlerin kişi bazlı dökümü
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {performanceReports.map((report, idx) => (
            <div
              key={idx}
              className="bg-slate-50/70 p-4 rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between"
            >
              <h3 className="text-xs font-bold text-slate-700 text-center border-b border-slate-200 pb-2">
                {report.title}
              </h3>

              {/* Dikey Çubuk Grafik (Bar Chart) */}
              <VerticalBarChart data={report.data} barColor={report.color} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// HASTANE DAĞILIM DOUGHNUT (HALKA) BİLEŞENİ
function DoughnutSummary({ labels, values, colors, total }) {
  const sum = values.reduce((a, b) => a + b, 0);

  // SVG Çember Çevresi Hesaplaması: 2 * PI * r (r=36 -> ~226.2)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
      {/* SVG Halka */}
      <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          {/* Arka plan çemberi */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            className="stroke-slate-100"
            strokeWidth="14"
            fill="transparent"
          />

          {sum > 0 &&
            values.map((val, idx) => {
              if (val === 0) return null;
              const percent = val / sum;
              const strokeDasharray = `${circumference * percent} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += percent;

              return (
                <circle
                  key={idx}
                  cx="50"
                  cy="50"
                  r={radius}
                  stroke={colors[idx]}
                  strokeWidth="14"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  fill="transparent"
                  className="transition-all duration-500"
                />
              );
            })}
        </svg>
        <div className="absolute text-center">
          <span className="text-xs font-black text-slate-700 block">{sum}</span>
          <span className="text-[9px] text-slate-400 font-medium block">Kayıt</span>
        </div>
      </div>

      {/* Lejant (Etiketler ve Sayılar) */}
      <div className="space-y-1.5 w-full sm:w-auto text-xs">
        {labels.map((hospital, idx) => {
          const count = values[idx] || 0;
          const pct = sum > 0 ? Math.round((count / sum) * 100) : 0;
          return (
            <div key={hospital} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: colors[idx] }}
                />
                <span className="text-slate-600 text-[11px] font-medium">{hospital}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-800 text-[11px]">{count}</span>
                <span className="text-slate-400 text-[10px]">({pct}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// PERSONEL PERFORMANS DİKEY ÇUBUK GRAFİĞİ BİLEŞENİ
function VerticalBarChart({ data, barColor }) {
  const maxVal = Math.max(...data.map((d) => d.count), 4); // Ölçeğin boş durmaması için min tepe değeri 4

  return (
    <div className="h-44 pt-3 flex items-end justify-between gap-1.5 px-2">
      {data.map((item) => {
        const heightPercent = maxVal > 0 ? (item.count / maxVal) * 100 : 0;

        return (
          <div
            key={item.name}
            className="flex-1 flex flex-col items-center justify-end h-full group"
          >
            {/* Sayı Rozeti */}
            <span
              className={`text-[10px] font-bold mb-1 transition ${
                item.count > 0 ? 'text-slate-800 font-black' : 'text-slate-300'
              }`}
            >
              {item.count}
            </span>

            {/* Dikey Çubuk */}
            <div className="w-full bg-slate-200/60 rounded-t-lg flex items-end h-28 overflow-hidden">
              <div
                className="w-full rounded-t-lg transition-all duration-500 group-hover:brightness-90"
                style={{
                  height: `${heightPercent}%`,
                  minHeight: item.count > 0 ? '6px' : '0px',
                  backgroundColor: barColor,
                }}
              />
            </div>

            {/* Personel İsmi */}
            <span className="text-[10px] font-semibold text-slate-500 mt-1.5 truncate max-w-[42px] text-center">
              {item.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}