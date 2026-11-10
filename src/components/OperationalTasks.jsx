import React, { useState } from 'react';
import { doc, setDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function OperationalTasks({ donors = [], currentUser = 'Koordinatör', onSelectDonor }) {
  const [loadingId, setLoadingId] = useState(null);

  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = todayDate.getDay();

  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

  const parseToDate = (dateStr) => {
    if (!dateStr) return null;
    const clean = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
      const [y, m, d] = clean.slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    const parts = clean.split(/[./-]/);
    if (parts.length === 3) {
      if (parts[2].length === 4) {
        return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      }
      if (parts[0].length === 4) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    }
    const d = new Date(clean);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const getDayNameTR = (dateString) => {
    const d = parseToDate(dateString);
    if (!d) return '';
    return d.toLocaleDateString('tr-TR', { weekday: 'long' });
  };

  const getDayDiff = (dateStr) => {
    const target = parseToDate(dateStr);
    if (!target) return null;
    return Math.round((target.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
  };

  const overdueList = [];
  const upcomingTasks = [];
  const todayDonorsMap = {};

  donors.forEach((donor) => {
    const dStatus = donor.status || 'Aktif';
    if (dStatus === 'Beklemede' || dStatus === 'İptal') return;

    const donorDisplayName = (donor.name || donor.donorName || 'İsimsiz Bağışçı').trim();
    const donorGroupKey = donorDisplayName.toLowerCase();

    const checkStep = (title, step, fieldKey, doseIndex = null) => {
      if (!step || !step.date) return;
      const diff = getDayDiff(step.date);
      if (diff === null) return;

      const taskItem = {
        id: `${donor.id}_${fieldKey}_${doseIndex !== null ? doseIndex : ''}`,
        donorId: donor.id,
        donorName: donorDisplayName,
        title: title || 'Belirtilmemiş Süreç',
        fieldKey,
        doseIndex,
        date: step.date,
        completed: Boolean(step.completed),
        completedBy: step.completedBy || '',
      };

      if (diff < 0 && !step.completed) {
        overdueList.push(taskItem);
      } else if (diff === 0 || (step.completed && step.date === todayStr)) {
        if (!todayDonorsMap[donorGroupKey]) {
          todayDonorsMap[donorGroupKey] = {
            donorId: donor.id,
            donorName: donorDisplayName,
            hospital: donor.hospital || '',
            tasks: [],
          };
        }
        todayDonorsMap[donorGroupKey].tasks.push(taskItem);
      } else if (!step.completed) {
        let isUpcoming = false;
        if (dayOfWeek === 5 && diff >= 1 && diff <= 3) isUpcoming = true;
        else if (dayOfWeek === 6 && diff >= 1 && diff <= 2) isUpcoming = true;
        else if (diff === 1) isUpcoming = true;

        if (isUpcoming) {
          const target = parseToDate(step.date);
          upcomingTasks.push({
            ...taskItem,
            dateObj: target,
            dayName: getDayNameTR(step.date),
          });
        }
      }
    };

    checkStep('Sağlık Kontrolü', donor.healthCheck, 'healthCheck');
    checkStep('Halk Sağlığı', donor.publicHealth, 'publicHealth');
    checkStep('Nakil Merkezi Tüpü', donor.transplantTube, 'transplantTube');
    checkStep('IDM', donor.idm, 'idm');
    checkStep('Nakil Sonrası Sağlık', donor.postTransplantCheck, 'postTransplantCheck');

    if (!donor.vaccinePostponed && donor.vaccineDates) {
      donor.vaccineDates.forEach((v, idx) => {
        const doseLabel = v.label ? v.label : `Aşı Doz #${idx + 1}`;
        checkStep(doseLabel, v, 'vaccineDates', idx);
      });
    }
  });

  upcomingTasks.sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());

  const todayDonorGroups = Object.values(todayDonorsMap).sort((a, b) => {
    const aPending = a.tasks.filter((t) => !t.completed).length;
    const bPending = b.tasks.filter((t) => !t.completed).length;
    if (aPending !== bPending) return bPending - aPending;
    return a.donorName.localeCompare(b.donorName, 'tr');
  });

  let totalTodayPending = 0;
  let totalTodayDone = 0;
  todayDonorGroups.forEach((g) => {
    g.tasks.forEach((t) => {
      if (t.completed) totalTodayDone++;
      else totalTodayPending++;
    });
  });

  const handleQuickComplete = async (task) => {
    const onay = window.confirm(
      `${task.donorName} kişisinin "${task.title}" işlemini kendi adınıza (${currentUser}) tamamlandı olarak işaretlemek istediğinize emin misiniz?`
    );
    if (!onay) return;

    setLoadingId(task.id);
    const donor = donors.find((d) => d.id === task.donorId);
    if (!donor) {
      setLoadingId(null);
      return;
    }

    let updatedDonor = { ...donor };

    if (task.fieldKey === 'vaccineDates' && task.doseIndex !== null) {
      const newDoses = [...(donor.vaccineDates || [])];
      newDoses[task.doseIndex] = {
        ...newDoses[task.doseIndex],
        completed: true,
        completedBy: currentUser,
      };
      updatedDonor.vaccineDates = newDoses;
    } else {
      const currentStep = donor[task.fieldKey] || { date: '', note: '' };
      updatedDonor[task.fieldKey] = {
        ...currentStep,
        completed: true,
        completedBy: currentUser,
      };
    }

    const newLog = {
      date: new Date().toISOString(),
      user: currentUser,
      action: `${task.title} hızlı panelden 'Tamamlandı' işaretlendi.`,
    };
    updatedDonor.auditLogs = [newLog, ...(updatedDonor.auditLogs || [])];

    try {
      const donorRef = doc(db, 'donors', donor.id);
      const { id, ...dataToSave } = updatedDonor;
      await setDoc(donorRef, dataToSave, { merge: true });

      // Sağlık Kontrolü veya Aşı tamamlandığında Burak'a bildirim oluştur
      if (
        (task.fieldKey === 'healthCheck' || task.fieldKey === 'vaccineDates') &&
        currentUser.toLowerCase() !== 'burak'
      ) {
        await addDoc(collection(db, 'notifications'), {
          toUser: 'Burak',
          fromUser: currentUser,
          donorId: donor.id,
          donorName: donor.name,
          title: 'Görev Tamamlandı ✅',
          message: `${currentUser}, ${donor.name} bağışçısının "${task.title}" görevini tamamladı.`,
          triggerAt: new Date().toISOString(),
          read: false,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error(err);
      alert('Kayıt güncellenirken hata oluştu.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 mb-5 font-sans">
      {/* 1. KUTU: YAKLAŞAN SÜREÇLER */}
      <div
        className={`bg-amber-50/80 border border-amber-200/90 rounded-2xl p-3.5 shadow-xs space-y-2 ${
          upcomingTasks.length === 0 ? 'hidden' : 'block'
        }`}
      >
        <div className="flex items-center gap-1.5 border-b border-amber-200/60 pb-1.5">
          <span className="text-amber-600 text-sm">⏳</span>
          <h2 className="font-bold text-[11px] text-amber-950 uppercase tracking-wider">
            Yaklaşan Süreçler
          </h2>
        </div>

        <div className="space-y-1.5 text-[11px] text-amber-900 max-h-56 overflow-y-auto pr-1 leading-snug">
          {upcomingTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 bg-white/70 px-2 py-1 rounded-lg border border-amber-200/50">
              <span className="text-amber-700 font-bold shrink-0">{t.dayName}:</span>
              <span
                onClick={() => onSelectDonor && onSelectDonor(t.donorId)}
                className="cursor-pointer text-indigo-700 hover:text-indigo-900 hover:underline font-bold truncate max-w-[130px]"
                title={t.donorName}
              >
                {t.donorName}
              </span>
              <span className="text-amber-300 shrink-0">•</span>
              <span className="font-medium text-slate-700 truncate" title={t.title}>
                {t.title}
              </span>
              <span className="text-[10px] text-amber-800/80 shrink-0 ml-auto font-mono">
                {t.date}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. KUTU: BUGÜNÜN İŞLERİ */}
      <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3.5 shadow-xs space-y-2">
        <div className="flex items-center justify-between border-b border-emerald-200/60 pb-1.5">
          <div className="flex items-center gap-1.5">
            <span className="text-emerald-600 text-sm">✅</span>
            <h2 className="font-bold text-[11px] text-emerald-950 uppercase tracking-wider">
              Bugünün İşleri
            </h2>
          </div>
          {(totalTodayPending > 0 || totalTodayDone > 0) && (
            <span className="text-[9px] font-bold text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-full">
              {totalTodayPending} Bekleyen / {totalTodayDone} Biten
            </span>
          )}
        </div>

        <div className="space-y-2 text-[11px] max-h-56 overflow-y-auto pr-1">
          {todayDonorGroups.length === 0 ? (
            <div className="text-emerald-700 font-medium py-2 text-center text-[11px]">
              Bugün için planlanmış herhangi bir işlem bulunmuyor.
            </div>
          ) : (
            todayDonorGroups.map((group) => {
              const pendingCount = group.tasks.filter((t) => !t.completed).length;
              const completedCount = group.tasks.filter((t) => t.completed).length;

              return (
                <div
                  key={group.donorName}
                  className="bg-white p-2.5 rounded-xl border border-emerald-200/70 shadow-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <span
                      onClick={() => onSelectDonor && onSelectDonor(group.donorId)}
                      className="cursor-pointer text-indigo-700 hover:text-indigo-900 hover:underline font-bold text-xs truncate max-w-[190px]"
                      title={group.donorName}
                    >
                      👤 {group.donorName}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {pendingCount > 0 && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                          {pendingCount} Bekleyen
                        </span>
                      )}
                      {completedCount > 0 && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                          {completedCount} Bitti
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1 pt-0.5">
                    {group.tasks.map((t) => (
                      <div
                        key={t.id}
                        className="flex items-center justify-between gap-2 pl-1 py-0.5 hover:bg-slate-50/80 rounded transition"
                      >
                        {!t.completed ? (
                          <>
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-emerald-500 text-[10px] shrink-0 font-bold">↳</span>
                              <span className="font-semibold text-slate-800 text-[11px] truncate" title={t.title}>
                                {t.title}
                              </span>
                            </div>

                            <button
                              type="button"
                              disabled={loadingId === t.id}
                              onClick={() => handleQuickComplete(t)}
                              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white px-2 py-0.5 rounded-md shadow-xs text-[9px] font-bold transition whitespace-nowrap cursor-pointer shrink-0"
                            >
                              {loadingId === t.id ? '...' : '✅ Tamamla'}
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center justify-between w-full text-slate-500 text-[10px]">
                            <span className="truncate pr-1 line-through text-slate-400">
                              ✓ {t.title}
                            </span>
                            <span className="text-emerald-700 font-semibold text-[9px] shrink-0 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-100">
                              Bitti ({t.completedBy || 'Personel'})
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. KUTU: GECİKEN SÜREÇLER */}
      <div
        className={`bg-red-50/80 border border-red-200/90 rounded-2xl p-3.5 shadow-xs space-y-2 ${
          overdueList.length === 0 ? 'hidden' : 'block'
        }`}
      >
        <div className="flex items-center gap-1.5 border-b border-red-200/60 pb-1.5">
          <span className="text-red-600 text-sm">⚠️</span>
          <h2 className="font-bold text-[11px] text-red-950 uppercase tracking-wider">
            Geciken Süreçler (Acil)
          </h2>
        </div>

        <div className="space-y-1.5 text-[11px] text-red-950 max-h-56 overflow-y-auto pr-1 leading-snug">
          {overdueList.map((t) => (
            <div key={t.id} className="flex items-center gap-1.5 bg-white/70 px-2 py-1 rounded-lg border border-red-200/50">
              <span className="text-red-500 font-bold shrink-0">•</span>
              <span
                onClick={() => onSelectDonor && onSelectDonor(t.donorId)}
                className="cursor-pointer text-indigo-700 hover:text-indigo-900 hover:underline font-bold truncate max-w-[130px]"
                title={t.donorName}
              >
                {t.donorName}
              </span>
              <span className="text-red-300 shrink-0">-</span>
              <span className="font-semibold text-slate-800 truncate" title={t.title}>
                {t.title}
              </span>
              <span className="text-[10px] text-red-700/80 shrink-0 ml-auto font-mono">
                {t.date}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}