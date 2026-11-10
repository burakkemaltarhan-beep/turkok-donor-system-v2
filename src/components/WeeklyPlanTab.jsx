import React from 'react';

export default function WeeklyPlanTab({ donors = [], mode = 'this-week', onSelectDonor }) {
  const isThisWeek = mode === 'this-week';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentDay = today.getDay(); // 0: Pazar, 1: Pzt ...

  let monday = new Date(today);
  if (isThisWeek) {
    const daysToThisMonday = currentDay === 0 ? -6 : 1 - currentDay;
    monday.setDate(today.getDate() + daysToThisMonday);
  } else {
    const daysToNextMonday = currentDay === 0 ? 1 : 8 - currentDay;
    monday.setDate(today.getDate() + daysToNextMonday);
  }

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const dateRangeText = `${monday.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} - ${sunday.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}`;

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

  const getTaskSortWeight = (taskName) => {
    if (taskName === 'Sağlık Kontrolü') return 1;
    if (taskName === 'Halk Sağlığı') return 2;
    if (taskName === 'Nakil Merkezi Tüpü') return 3;
    if (taskName === 'IDM') return 4;
    if (taskName === 'Nakil Sonrası Sağlık') return 5;
    if (taskName && taskName.startsWith('Aşı Doz')) {
      const match = taskName.match(/#(\d+)/);
      if (match) return 10 + parseInt(match[1], 10);
      return 10;
    }
    return 99;
  };

  const smartSortTasks = (a, b) => {
    if (a.dateObj.getTime() !== b.dateObj.getTime()) {
      return a.dateObj.getTime() - b.dateObj.getTime();
    }
    const weightA = getTaskSortWeight(a.taskName);
    const weightB = getTaskSortWeight(b.taskName);
    const isVaccineA = weightA >= 10;
    const isVaccineB = weightB >= 10;

    if (isVaccineA && isVaccineB) {
      const nameCmp = a.donorName.localeCompare(b.donorName, 'tr');
      if (nameCmp !== 0) return nameCmp;
      return weightA - weightB;
    } else {
      if (weightA !== weightB) return weightA - weightB;
      return a.donorName.localeCompare(b.donorName, 'tr');
    }
  };

  const weeklyTasks = [];

  donors.forEach((d) => {
    const dStatus = d.status || 'Aktif';
    if (dStatus === 'Beklemede' || dStatus === 'İptal') return;

    const checkStep = (title, step) => {
      if (!step || !step.date) return;
      const targetDate = parseToDate(step.date);
      if (!targetDate) return;

      if (targetDate >= monday && targetDate <= sunday) {
        weeklyTasks.push({
          donorName: d.name,
          donorId: d.id,
          hospital: d.hospital,
          taskName: title,
          dateObj: targetDate,
          completed: step.completed,
          completedBy: step.completedBy,
        });
      }
    };

    checkStep('Sağlık Kontrolü', d.healthCheck);
    checkStep('Halk Sağlığı', d.publicHealth);
    checkStep('Nakil Merkezi Tüpü', d.transplantTube);
    checkStep('IDM', d.idm);
    checkStep('Nakil Sonrası Sağlık', d.postTransplantCheck);

    if (!d.vaccinePostponed && d.vaccineDates) {
      d.vaccineDates.forEach((v, idx) => checkStep(`Aşı Doz #${idx + 1}`, v));
    }
  });

  if (weeklyTasks.length === 0) {
    return (
      <div className="bg-white p-8 rounded-2xl text-center text-slate-500 text-xs border border-slate-200">
        🎉 <strong>{dateRangeText}</strong> haftası için planlanmış bir iş bulunmuyor.
      </div>
    );
  }

  weeklyTasks.sort(smartSortTasks);
  const groupedTasks = {};
  const dateOptions = { day: 'numeric', month: 'long', weekday: 'long' };

  weeklyTasks.forEach((task) => {
    const dateStr = task.dateObj.toLocaleDateString('tr-TR', dateOptions);
    if (!groupedTasks[dateStr]) groupedTasks[dateStr] = [];
    groupedTasks[dateStr].push(task);
  });

  const badgeTheme = isThisWeek
    ? 'text-sky-700 bg-sky-50 border-sky-100'
    : 'text-indigo-700 bg-indigo-50 border-indigo-100';

  return (
    <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-200 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span>{isThisWeek ? '📌' : '🗓️'}</span>
          {isThisWeek ? 'Bu Haftanın İş Planı' : 'Önümüzdeki Haftanın İş Planı'}
        </h2>
        <span className={`text-xs font-semibold px-3 py-1 rounded-xl border ${badgeTheme}`}>
          📅 Plan Kapsamı: {dateRangeText}
        </span>
      </div>

      <div className="space-y-5">
        {Object.entries(groupedTasks).map(([dateStr, tasks]) => (
          <div key={dateStr} className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1 flex items-center gap-1.5">
              <span>🗓️</span> {dateStr}
            </h3>

            <div className="space-y-1.5">
              {tasks.map((t, idx) => (
                <div
                  key={`${t.donorId}-${t.taskName}-${idx}`}
                  className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-50 hover:bg-slate-100 transition p-2.5 rounded-xl border border-slate-200 gap-2 text-xs"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onSelectDonor && onSelectDonor(t.donorId)}
                      className="text-indigo-700 hover:text-indigo-900 font-bold hover:underline cursor-pointer text-left"
                      title="Bağışçı kartına git"
                    >
                      👤 {t.donorName}
                    </button>

                    {t.hospital ? (
                      <span className="text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md font-medium border border-sky-100">
                        🏥 {t.hospital}
                      </span>
                    ) : null}

                    <span className="text-slate-600 font-medium">➡️ {t.taskName}</span>
                  </div>

                  <div>
                    {t.completed ? (
                      <span className="bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-emerald-200">
                        ✓ Bitti ({t.completedBy || 'Personel'})
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-md text-[10px] font-bold border border-amber-200">
                        ⏳ Bekliyor
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}