import React, { useState } from 'react';

export default function DonorForm({ onAddDonor }) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [hospital, setHospital] = useState('İzmir Şehir Hastanesi');
  const [phone, setPhone] = useState('');
  const [healthCheckDate, setHealthCheckDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newDonor = {
      id: Date.now().toString(),
      name: name.trim(),
      hospital,
      phone: phone.trim(),
      assignedTo: assignedTo || 'Atanmadı',
      idmStatus: 'Bekliyor',
      isOpen: true,
      healthCheck: {
        date: healthCheckDate || '',
        done: false
      },
      auditLogs: [
        {
          date: new Date().toISOString(),
          action: 'Bağışçı sisteme kaydedildi.'
        }
      ]
    };

    onAddDonor(newDonor);

    // Formu sıfırla ve kapat
    setName('');
    setPhone('');
    setHealthCheckDate('');
    setAssignedTo('');
    setIsOpen(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition select-none"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 font-bold text-sm">
            ➕
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Yeni Bağışçı Ekle</h2>
            <p className="text-[11px] text-slate-500">Sisteme manuel yeni bağışçı ve ilk süreç kaydı açın</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
          {isOpen ? 'Formu Kapat' : 'Formu Aç'}
        </span>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="p-4 pt-2 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Bağışçı Adı Soyadı *</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn: Ahmet Yılmaz"
              className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">Hastane</label>
            <select 
              value={hospital}
              onChange={(e) => setHospital(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 cursor-pointer"
            >
              <option value="İzmir Şehir Hastanesi">İzmir Şehir Hastanesi</option>
              <option value="İzmir Atatürk EAH">İzmir Atatürk EAH</option>
              <option value="İzmir Medical Point Hastanesi">İzmir Medical Point Hastanesi</option>
              <option value="Ege Üniversitesi Hastanesi">Ege Üniversitesi Hastanesi</option>
              <option value="Dokuz Eylül Üniversitesi Hastanesi">Dokuz Eylül Üniversitesi Hastanesi</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">İletişim Numarası</label>
            <input 
              type="tel" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XXX XX XX"
              className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">Sağlık Kontrolü Tarihi</label>
            <input 
              type="date" 
              value={healthCheckDate}
              onChange={(e) => setHealthCheckDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">Sorumlu Koordinatör</label>
            <select 
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full border border-slate-300 rounded-lg p-2 bg-slate-50 focus:bg-white focus:outline-indigo-500 cursor-pointer"
            >
              <option value="">Personel Seçiniz...</option>
              <option value="Batuhan">Batuhan</option>
              <option value="Yiğit">Yiğit</option>
              <option value="Behlül">Behlül</option>
              <option value="Yunus">Yunus</option>
              <option value="Özkan">Özkan</option>
              <option value="Burak">Burak</option>
            </select>
          </div>

          <div className="flex items-end">
            <button 
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition shadow-xs cursor-pointer"
            >
              Bağışçıyı Kaydet
            </button>
          </div>
        </form>
      )}
    </div>
  );
}