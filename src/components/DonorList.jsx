import React, { useState } from 'react';
import AuditLogModal from './AuditLogModal';

export default function DonorList({ 
  donors, 
  monthState, 
  onToggleMonth, 
  onToggleDonor, 
  onDeleteDonor, 
  onUpdateDonorField 
}) {
  const [selectedDonorForLog, setSelectedDonorForLog] = useState(null);

  if (!donors || donors.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-xs border border-slate-200 text-center">
        <span className="text-3xl block mb-2">📋</span>
        <p className="text-sm font-semibold text-slate-700">Filtreye Uygun Bağışçı Bulunamadı</p>
        <p className="text-xs text-slate-400 mt-1">Arama kriterlerinizi değiştirebilir veya yeni bağışçı ekleyebilirsiniz.</p>
      </div>
    );
  }

  const monthNames = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", 
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
  ];
  
  const groupedDonors = {};

  donors.forEach((d) => {
    let sortKey = "9999-12"; 
    let displayKey = "Tarihi Belirsiz (Sağlık Kontrolü Bekleniyor)";
    
    const referenceDate = d.apheresis?.date || d.healthCheck?.date;

    if (referenceDate) {
      const parts = referenceDate.split('-');
      if (parts.length >= 2) {
        sortKey = `${parts[0]}-${parts[1]}`; 
        const mIndex = parseInt(parts[1], 10) - 1;
        displayKey = `${monthNames[mIndex]} ${parts[0]}`; 
      }
    }
    
    if (!groupedDonors[sortKey]) {
      groupedDonors[sortKey] = { display: displayKey, list: [] };
    }
    groupedDonors[sortKey].list.push(d);
  });

  const sortedKeys = Object.keys(groupedDonors).sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-4">
      {/* Audit Log Modalı */}
      {selectedDonorForLog && (
        <AuditLogModal 
          donor={selectedDonorForLog} 
          onClose={() => setSelectedDonorForLog(null)} 
        />
      )}

      {sortedKeys.map((key) => {
        const group = groupedDonors[key];
        const isMonthOpen = monthState[key] !== undefined ? monthState[key] : true;

        return (
          <div key={key} className="space-y-2">
            {/* Ay Akordeon Başlığı */}
            <div 
              onClick={() => onToggleMonth(key)}
              className="bg-slate-100 hover:bg-slate-200/80 border-l-4 border-indigo-600 py-2.5 px-4 rounded-r-xl flex justify-between items-center cursor-pointer transition select-none shadow-xs"
            >
              <div className="flex items-center gap-2">
                <span className={`text-xs text-slate-600 transition-transform duration-200 ${isMonthOpen ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                <span className="text-sm font-bold text-slate-800">📅 {group.display}</span>
              </div>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-100/70 px-2.5 py-0.5 rounded-full">
                {group.list.length} Bağışçı
              </span>
            </div>

            {/* Bağışçı Kartları */}
            {isMonthOpen && (
              <div className="space-y-2.5 pl-2">
                {group.list.map((d) => (
                  <div key={d.id} className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden transition">
                    {/* Kart Başlığı */}
                    <div 
                      onClick={() => onToggleDonor(d.id)}
                      className="flex justify-between items-center p-3.5 hover:bg-slate-50 cursor-pointer select-none gap-2 flex-wrap"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-xs text-indigo-600 transition-transform duration-200 ${d.isOpen ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span className="font-bold text-sm text-slate-900">{d.name}</span>
                        <span className="text-[11px] bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-md font-medium">
                          🏥 {d.hospital || "Hastane Belirtilmedi"}
                        </span>
                        <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                          📞 {d.phone || "Telefon Yok"}
                        </span>
                        {d.apheresis?.date && (
                          <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md font-medium">
                            🩸 Aferez: {d.apheresis.date}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-medium">
                          Sorumlu: <strong className="text-slate-900">{d.assignedTo || "Atanmadı"}</strong>
                        </span>
                        <button
                          onClick={() => setSelectedDonorForLog(d)}
                          className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer flex items-center gap-1"
                        >
                          📜 Geçmiş
                        </button>
                        <button 
                          onClick={() => onDeleteDonor(d.id)}
                          className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer"
                        >
                          Sil
                        </button>
                      </div>
                    </div>

                    {/* Detay & Süreç Yönetim Paneli */}
                    {d.isOpen && (
                      <div className="p-4 bg-slate-50/70 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        
                        {/* 1. Sağlık Kontrolü & IDM */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                          <span className="font-bold text-slate-800 block">🩺 Sağlık Kontrolü & IDM</span>
                          <div>
                            <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Kontrol Tarihi</label>
                            <input 
                              type="date" 
                              value={d.healthCheck?.date || ''}
                              onChange={(e) => onUpdateDonorField(d.id, 'healthCheck', { ...d.healthCheck, date: e.target.value })}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                            />
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                            <input 
                              type="checkbox" 
                              checked={d.healthCheck?.done || false}
                              onChange={(e) => onUpdateDonorField(d.id, 'healthCheck', { ...d.healthCheck, done: e.target.checked })}
                              className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
                            />
                            <span className="font-medium text-slate-700">Sağlık Kontrolü Tamam</span>
                          </label>

                          <div className="pt-1 border-t border-slate-100">
                            <label className="text-[10px] text-slate-500 font-medium block mb-0.5">IDM Tetkik Sonucu</label>
                            <select 
                              value={d.idmStatus || 'Bekliyor'}
                              onChange={(e) => onUpdateDonorField(d.id, 'idmStatus', e.target.value)}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs cursor-pointer"
                            >
                              <option value="Bekliyor">⏳ Tetkik Bekliyor</option>
                              <option value="Uygun">✅ Uygun (Negatif)</option>
                              <option value="Sorunlu">❌ Uygun Değil / Ertelendi</option>
                            </select>
                          </div>
                        </div>

                        {/* 2. G-CSF Mobilizasyon Aşı Takvimi */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                          <span className="font-bold text-slate-800 block">💉 G-CSF Aşı Takibi</span>
                          <div>
                            <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Aşı Başlangıç Tarihi</label>
                            <input 
                              type="date" 
                              value={d.vaccineSchedule?.startDate || ''}
                              onChange={(e) => onUpdateDonorField(d.id, 'vaccineSchedule', { 
                                ...d.vaccineSchedule, 
                                startDate: e.target.value 
                              })}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                            />
                          </div>

                          <div className="space-y-1.5 pt-1">
                            <label className="text-[10px] text-slate-500 font-medium block">Doz Uygulama Günleri</label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[1, 2, 3, 4].map((day) => (
                                <label key={day} className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-md border border-slate-200 cursor-pointer">
                                  <input 
                                    type="checkbox"
                                    checked={d.vaccineSchedule?.[`day${day}`] || false}
                                    onChange={(e) => onUpdateDonorField(d.id, 'vaccineSchedule', {
                                      ...d.vaccineSchedule,
                                      [`day${day}`]: e.target.checked
                                    })}
                                    className="rounded text-indigo-600 w-3.5 h-3.5"
                                  />
                                  <span className="text-[11px] font-medium text-slate-700">{day}. Gün</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 3. Aferez / Kök Hücre Toplama */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                          <span className="font-bold text-slate-800 block">🩸 Aferez & Toplama</span>
                          <div>
                            <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Aferez Tarihi</label>
                            <input 
                              type="date" 
                              value={d.apheresis?.date || ''}
                              onChange={(e) => onUpdateDonorField(d.id, 'apheresis', { 
                                ...d.apheresis, 
                                date: e.target.value 
                              })}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Aferez Merkezi</label>
                            <select 
                              value={d.apheresis?.center || d.hospital || 'İzmir Şehir Hastanesi'}
                              onChange={(e) => onUpdateDonorField(d.id, 'apheresis', { 
                                ...d.apheresis, 
                                center: e.target.value 
                              })}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs cursor-pointer"
                            >
                              <option value="İzmir Şehir Hastanesi">İzmir Şehir Hastanesi</option>
                              <option value="İzmir Atatürk EAH">İzmir Atatürk EAH</option>
                              <option value="İzmir Medical Point Hastanesi">İzmir Medical Point Hastanesi</option>
                              <option value="Ege Üniversitesi Hastanesi">Ege Üniversitesi Hastanesi</option>
                              <option value="Dokuz Eylül Üniversitesi Hastanesi">Dokuz Eylül Üniversitesi Hastanesi</option>
                            </select>
                          </div>

                          <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                            <input 
                              type="checkbox" 
                              checked={d.apheresis?.completed || false}
                              onChange={(e) => onUpdateDonorField(d.id, 'apheresis', { 
                                ...d.apheresis, 
                                completed: e.target.checked 
                              })}
                              className="rounded text-emerald-600 w-4 h-4 cursor-pointer"
                            />
                            <span className="font-medium text-slate-700">Toplama Başarıyla Tamamlandı</span>
                          </label>
                        </div>

                        {/* 4. Koordinasyon & Operasyonel Not */}
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2">
                          <span className="font-bold text-slate-800 block">👤 Koordinasyon & Notlar</span>
                          <div>
                            <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Sorumlu Personel</label>
                            <select 
                              value={d.assignedTo || ''}
                              onChange={(e) => onUpdateDonorField(d.id, 'assignedTo', e.target.value)}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs cursor-pointer"
                            >
                              <option value="">Seçiniz...</option>
                              <option value="Batuhan">Batuhan</option>
                              <option value="Yiğit">Yiğit</option>
                              <option value="Behlül">Behlül</option>
                              <option value="Yunus">Yunus</option>
                              <option value="Özkan">Özkan</option>
                              <option value="Burak">Burak</option>
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500 font-medium block mb-0.5">Süreç Notu / Kurye / Lojistik</label>
                            <textarea 
                              rows={2}
                              value={d.notes || ''}
                              placeholder="Hücre ürünü teslimat saati, refakatçi durumu vb..."
                              onChange={(e) => onUpdateDonorField(d.id, 'notes', e.target.value)}
                              className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs resize-none"
                            />
                          </div>
                        </div>

                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}