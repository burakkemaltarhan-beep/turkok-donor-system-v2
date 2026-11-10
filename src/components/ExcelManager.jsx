import React, { useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function ExcelManager({ donors = [] }) {
  const [pasteText, setPasteText] = useState('');
  const [pendingDonors, setPendingDonors] = useState([]);
  const [showHospitalModal, setShowHospitalModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  // SheetJS kütüphanesini dinamik ve güvenli yükleme
  const getXLSX = () => {
    return new Promise((resolve, reject) => {
      if (window.XLSX) return resolve(window.XLSX);
      const existingScript = document.getElementById('xlsx-cdn-script');
      if (existingScript) {
        existingScript.onload = () => resolve(window.XLSX);
        return;
      }
      const script = document.createElement('script');
      script.id = 'xlsx-cdn-script';
      script.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
      script.onload = () => resolve(window.XLSX);
      script.onerror = () => reject(new Error('Excel kütüphanesi yüklenemedi.'));
      document.head.appendChild(script);
    });
  };

  // Excel Tarih Ayrıştırıcı (YYYY-MM-DD veya GG.AA.YYYY)
  const parseExcelDate = (dateStr) => {
    if (!dateStr) return '';
    const trimmed = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parts = trimmed.split(/[./-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        let year = parts[2];
        if (year.length === 2) year = '20' + year;
        return `${year}-${month}-${day}`;
      }
    }
    return trimmed;
  };

  // 1. EXCEL VERİSİNİ İŞLEME VE HAZIRLAMA (İÇE AKTARMA)
  const handleProcessExcel = () => {
    if (!pasteText.trim()) {
      alert("Lütfen Excel'den kopyaladığınız satırları yapıştırın.");
      return;
    }

    const rows = pasteText.split('\n');
    const parsedDonors = [];

    rows.forEach((row) => {
      const cols = row.split('\t');
      if (cols.length >= 2 && !cols[0].toLowerCase().includes('sıra')) {
        const donorName = cols[1] ? cols[1].trim() : '';
        const healthCheckRaw = cols[4] ? cols[4].trim() : '';
        const collectionRaw = cols[6] ? cols[6].trim() : '';
        if (!donorName) return;

        const healthDateStr = parseExcelDate(healthCheckRaw);
        const collectionDateStr = parseExcelDate(collectionRaw);
        let postTransplantDateStr = '';
        const vaccineDatesArray = [];

        if (collectionDateStr) {
          const colDateObj = new Date(collectionDateStr);
          if (!isNaN(colDateObj.getTime())) {
            const postTransplantObj = new Date(colDateObj);
            postTransplantObj.setDate(colDateObj.getDate() + 20);
            postTransplantDateStr = postTransplantObj.toISOString().split('T')[0];

            const startDateObj = new Date(colDateObj);
            startDateObj.setDate(colDateObj.getDate() - 5);
            const d1Str = startDateObj.toISOString().split('T')[0];
            vaccineDatesArray.push({
              label: '1. Doz (1. Gün Akşam)',
              date: d1Str,
              completed: false,
              completedBy: '',
            });

            for (let i = 1; i <= 4; i++) {
              const currentDay = new Date(startDateObj);
              currentDay.setDate(startDateObj.getDate() + i);
              const dayStr = currentDay.toISOString().split('T')[0];
              vaccineDatesArray.push({
                label: `${i + 1}. Gün Sabah Dozu`,
                date: dayStr,
                completed: false,
                completedBy: '',
              });
              vaccineDatesArray.push({
                label: `${i + 1}. Gün Akşam Dozu`,
                date: dayStr,
                completed: false,
                completedBy: '',
              });
            }
            vaccineDatesArray.push({
              label: '10. Doz (Ürün Toplama Günü)',
              date: collectionDateStr,
              completed: false,
              completedBy: '',
            });
          }
        }

        parsedDonors.push({
          id: Date.now().toString() + Math.random().toString().substring(2, 7),
          name: donorName,
          hospital: '',
          status: 'Aktif',
          statusNote: '',
          isOpen: true,
          healthCheck: { date: healthDateStr, completed: false, completedBy: '' },
          publicHealth: { date: '', completed: false, completedBy: '' },
          transplantTube: { date: '', completed: false, completedBy: '' },
          idm: { date: '', completed: false, completedBy: '', note: '' },
          postTransplantCheck: { date: postTransplantDateStr, completed: false, completedBy: '' },
          vaccineDates: vaccineDatesArray,
          vaccinePostponed: false,
          auditLogs: [
            {
              user: 'Sistem',
              action: 'Excel ile sisteme eklendi.',
              date: new Date().toISOString(),
            },
          ],
        });
      }
    });

    if (parsedDonors.length > 0) {
      setPendingDonors(parsedDonors);
      setShowHospitalModal(true);
    } else {
      alert('Uygun formatta veri bulunamadı. Lütfen kopyalama sütunlarını kontrol edin.');
    }
  };

  // 2. HASTANE SEÇİLİP FIRESTORE'A BATCH WRITE İLE KAYDETME
  const handleFinalizeImport = async (hospitalName) => {
    setIsImporting(true);
    const batch = writeBatch(db);

    pendingDonors.forEach((donor) => {
      const donorToSave = {
        ...donor,
        hospital: hospitalName,
      };
      const { id, ...data } = donorToSave;
      const docRef = doc(db, 'donors', id);
      batch.set(docRef, data);
    });

    try {
      await batch.commit();
      setPasteText('');
      setShowHospitalModal(false);
      const hospMsg = hospitalName || 'Belirtilmedi';
      alert(`${pendingDonors.length} bağışçı başarıyla eklendi!\nHastaneleri '${hospMsg}' olarak ayarlandı.`);
      setPendingDonors([]);
    } catch (err) {
      console.error('Batch aktarım hatası:', err);
      alert('Veriler kaydedilirken bir hata oluştu: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  // 3. EXCEL YEDEĞİ İNDİRME (.XLSX EXPORT)
  const handleExportToExcel = async () => {
    if (!donors || donors.length === 0) {
      alert('Dışa aktarılacak kayıt bulunmuyor.');
      return;
    }

    setIsExporting(true);
    try {
      const XLSX = await getXLSX();

      const exportData = donors.map((d) => {
        const completedVaccines = d.vaccineDates ? d.vaccineDates.filter((v) => v.completed).length : 0;
        const vaccineStatus = d.vaccinePostponed ? 'Ertelendi' : `${completedVaccines}/10 Tamamlandı`;

        return {
          'Bağışçı Adı': d.name || '',
          'Süreç Durumu': d.status || 'Aktif',
          'Durum Açıklaması': d.statusNote || '',
          'Hastane': d.hospital || 'Belirtilmedi',
          'Sağlık Kontrolü Tarihi': d.healthCheck?.date || '',
          'Sağlık Kontrolü Yapan': d.healthCheck?.completedBy || '',
          'Halk Sağlığı Tarihi': d.publicHealth?.date || '',
          'Nakil Tüpü Tarihi': d.transplantTube?.date || '',
          'IDM Tarihi': d.idm?.date || '',
          'IDM Açıklama': d.idm?.note || '',
          'Aşı Durumu': vaccineStatus,
          'Nakil Sonrası Tarih': d.postTransplantCheck?.date || '',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Bağışçı Listesi');

      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(workbook, `Bagisci_Yedek_${today}.xlsx`);
    } catch (err) {
      console.error('Export hatası:', err);
      alert('Excel yedeği oluşturulurken hata oluştu: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 space-y-2.5">
      <div className="flex justify-between items-center">
        <h2 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
          <span>📊</span> Excel İşlemleri
        </h2>
        <span className="text-[11px] text-slate-400">Veri aktarımı & anlık yedekleme</span>
      </div>

      <textarea
        rows={1}
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder="Sıra No - Adı... formatında Excel'den kopyalayıp yapıştırın"
        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-emerald-500 bg-slate-50 resize-none transition"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleProcessExcel}
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-xl text-xs transition cursor-pointer shadow-xs"
        >
          İçe Aktar
        </button>

        <button
          type="button"
          disabled={isExporting}
          onClick={handleExportToExcel}
          className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold py-2 rounded-xl text-xs transition cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
        >
          {isExporting ? 'Hazırlanıyor...' : '⬇️ Yedeği İndir (.xlsx)'}
        </button>
      </div>

      {/* HASTANE SEÇİM MODALI */}
      {showHospitalModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center border border-slate-100">
            <div className="text-3xl">🏥</div>
            <h3 className="font-bold text-slate-800 text-base">Hastane Seçimi</h3>
            <p className="text-xs text-slate-500">
              Excel'den aktarılan <strong>{pendingDonors.length}</strong> bağışçı hangi hastaneye kaydedilsin?
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={isImporting}
                onClick={() => handleFinalizeImport('İzmir Şehir Hastanesi')}
                className="w-full bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold py-2.5 rounded-xl text-xs transition border border-sky-200 cursor-pointer"
              >
                İzmir Şehir Hastanesi
              </button>

              <button
                type="button"
                disabled={isImporting}
                onClick={() => handleFinalizeImport('Yeşilyurt')}
                className="w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-800 font-bold py-2.5 rounded-xl text-xs transition border border-indigo-200 cursor-pointer"
              >
                Yeşilyurt
              </button>

              <button
                type="button"
                disabled={isImporting}
                onClick={() => handleFinalizeImport('')}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs transition border border-slate-200 cursor-pointer"
              >
                Belirtme (Sonra Seçerim)
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowHospitalModal(false);
                  setPendingDonors([]);
                }}
                className="text-xs font-bold text-rose-500 hover:text-rose-700 transition cursor-pointer"
              >
                İşlemi İptal Et
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}