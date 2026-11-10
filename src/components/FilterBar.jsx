import React from 'react';

export default function FilterBar({
  searchTerm,
  setSearchTerm,
  selectedHospital,
  setSelectedHospital,
  selectedStaff,
  setSelectedStaff,
  selectedStatus,
  setSelectedStatus,
  onResetFilters,
  totalCount,
  filteredCount
}) {
  const hasActiveFilter = searchTerm || selectedHospital || selectedStaff || selectedStatus;

  return (
    <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 space-y-3">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-indigo-600 font-bold text-base">🔍</span>
          <h3 className="text-xs font-bold text-slate-800">Arama ve Operasyonel Filtreler</h3>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500">
            Gösterilen: <strong className="text-indigo-600 font-bold">{filteredCount}</strong> / {totalCount}
          </span>
          {hasActiveFilter && (
            <button
              onClick={onResetFilters}
              className="text-[11px] text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer"
            >
              Filtreleri Sıfırla
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        {/* İsim / Tel Arama */}
        <div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Bağışçı adı veya tel ara..."
            className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500"
          />
        </div>

        {/* Hastane Filtresi */}
        <div>
          <select
            value={selectedHospital}
            onChange={(e) => setSelectedHospital(e.target.value)}
            className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 cursor-pointer text-slate-700"
          >
            <option value="">Tüm Hastaneler</option>
            <option value="İzmir Şehir Hastanesi">İzmir Şehir Hastanesi</option>
            <option value="İzmir Atatürk EAH">İzmir Atatürk EAH</option>
            <option value="İzmir Medical Point Hastanesi">İzmir Medical Point Hastanesi</option>
            <option value="Ege Üniversitesi Hastanesi">Ege Üniversitesi Hastanesi</option>
            <option value="Dokuz Eylül Üniversitesi Hastanesi">Dokuz Eylül Üniversitesi Hastanesi</option>
          </select>
        </div>

        {/* Sorumlu Personel Filtresi */}
        <div>
          <select
            value={selectedStaff}
            onChange={(e) => setSelectedStaff(e.target.value)}
            className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 cursor-pointer text-slate-700"
          >
            <option value="">Tüm Koordinatörler</option>
            <option value="Batuhan">Batuhan</option>
            <option value="Yiğit">Yiğit</option>
            <option value="Behlül">Behlül</option>
            <option value="Yunus">Yunus</option>
            <option value="Özkan">Özkan</option>
            <option value="Burak">Burak</option>
          </select>
        </div>

        {/* IDM Durum Filtresi */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-full border border-slate-300 rounded-xl p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 cursor-pointer text-slate-700"
          >
            <option value="">Tüm Tetkik Durumları</option>
            <option value="Bekliyor">⏳ Sonuç Bekliyor</option>
            <option value="Uygun">✅ Uygun (Negatif)</option>
            <option value="Sorunlu">❌ Sorunlu / Ertelendi</option>
          </select>
        </div>
      </div>
    </div>
  );
}