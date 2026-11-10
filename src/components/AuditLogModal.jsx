import React from 'react';

export default function AuditLogModal({ donor, onClose }) {
  if (!donor) return null;

  const logs = donor.auditLogs || [];

  const formatDate = (isoString) => {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-100 max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Modal Başlığı */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>📜</span> İşlem Geçmişi (Audit Log)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Bağışçı: <strong className="text-indigo-600">{donor.name}</strong> • {donor.hospital}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition cursor-pointer text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Log Listesi */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
          {logs.length === 0 ? (
            <p className="text-slate-400 text-center py-6">Kayıtlı işlem geçmişi bulunmuyor.</p>
          ) : (
            logs.map((log, index) => (
              <div 
                key={index} 
                className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col gap-1"
              >
                <div className="flex justify-between items-center text-[10px] text-slate-500">
                  <span className="font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                    👤 {log.user || 'Sistem'}
                  </span>
                  <span className="text-slate-400">🕒 {formatDate(log.date)}</span>
                </div>
                <p className="text-slate-800 font-medium text-xs mt-0.5">{log.action}</p>
              </div>
            ))
          )}
        </div>

        {/* Modal Alt Kapat Butonu */}
        <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}