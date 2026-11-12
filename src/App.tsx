import React, { useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from './config/firebase';
import { requestAndSaveFCMToken } from './utils/fcm';
import OperationalTasks from './components/OperationalTasks';
import ReportingTab from './components/ReportingTab';
import ExcelManager from './components/ExcelManager';
import WeeklyPlanTab from './components/WeeklyPlanTab';

export interface AuditLog {
  date: string;
  user: string;
  action: string;
}

export interface StepDetail {
  date: string;
  completed: boolean;
  completedBy: string;
  note?: string;
}

export interface VaccineDose {
  label: string;
  date: string;
  completed: boolean;
  completedBy: string;
}

export interface Donor {
  id: string;
  name: string;
  hospital: string;
  phone?: string;
  assignedTo?: string;
  status?: string;
  statusNote?: string;
  isOpen?: boolean;
  healthCheck?: StepDetail;
  publicHealth?: StepDetail;
  transplantTube?: StepDetail;
  idm?: StepDetail;
  postTransplantCheck?: StepDetail;
  vaccineDates?: VaccineDose[];
  vaccinePostponed?: boolean;
  auditLogs?: AuditLog[];
}

export interface NotificationItem {
  id: string;
  toUser: string;
  fromUser: string;
  donorId: string;
  donorName: string;
  title: string;
  message: string;
  triggerAt: string;
  read: boolean;
  pushStatus?: 'pending' | 'sending' | 'sent' | 'failed';
  createdAt: string;
}

const teamMembers = ["Burak", "Özkan", "Yiğit", "Batuhan", "Behlül", "Yunus"];
const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

const authorizedUsers = [
  { name: "Burak", email: "burak@panel.com" },
  { name: "Özkan", email: "ozkan@panel.com" },
  { name: "Yiğit", email: "yigit@panel.com" },
  { name: "Batuhan", email: "batuhan@panel.com" },
  { name: "Behlül", email: "behlul@panel.com" },
  { name: "Yunus", email: "yunus@panel.com" },
];

const stepLabels: Record<'healthCheck' | 'publicHealth' | 'transplantTube' | 'idm' | 'postTransplantCheck', string> = {
  healthCheck: 'Sağlık Kontrolü',
  publicHealth: 'Halk Sağlığı',
  transplantTube: 'Nakil Merkezi Tüpü',
  idm: 'IDM',
  postTransplantCheck: 'Nakil Sonrası Sağlık'
};

const formatLocalDate = (dateObj: Date): string => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDonorSortKey = (d: Donor) => {
  if (!d.healthCheck?.date) return '9999-12';
  const clean = String(d.healthCheck.date).trim();
  if (/^\d{4}-\d{2}/.test(clean)) {
    const parts = clean.split('-');
    return `${parts[0]}-${parts[1].padStart(2, '0')}`;
  }
  const parts = clean.split(/[./-]/);
  if (parts.length === 3) {
    if (parts[2].length === 4) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}`;
    }
    if (parts[0].length === 4) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}`;
    }
  }
  return '9999-12';
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [donors, setDonors] = useState<Donor[]>([]);
  const [currentTab, setCurrentTab] = useState<'operation' | 'this-week' | 'next-week' | 'reporting'>('operation');
  
  // YENİ: Ortak Liste ve Bana Atananlar Görünüm Modu State'i
  const [taskViewMode, setTaskViewMode] = useState<'all' | 'mine'>('all');

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  const [monthAccordionState, setMonthAccordionState] = useState<Record<string, boolean>>({});
  const [openDonorIds, setOpenDonorIds] = useState<Record<string, boolean>>({});
  const [openAuditLogIds, setOpenAuditLogIds] = useState<Record<string, boolean>>({});

  const [statusNotesDraft, setStatusNotesDraft] = useState<Record<string, string>>({});
  const [idmNotesDraft, setIdmNotesDraft] = useState<Record<string, string>>({});

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const [savedStatusNoteId, setSavedStatusNoteId] = useState<string | null>(null);
  const [savedIdmNoteId, setSavedIdmNoteId] = useState<string | null>(null);

  const [newDonorName, setNewDonorName] = useState('');
  const [newDonorHospital, setNewDonorHospital] = useState('');

  const [activeVaccineDonorId, setActiveVaccineDonorId] = useState<string | null>(null);
  const [collectionDateInput, setCollectionDateInput] = useState<string>('');

  const lastPushTriggerRef = useRef<number>(0);

  const getDisplayName = (email?: string | null) => {
    if (!email) return 'Koordinatör';
    const prefix = email.split('@')[0].toLowerCase();
    if (prefix === 'ozkan') return 'Özkan';
    if (prefix === 'yigit') return 'Yiğit';
    if (prefix === 'behlul') return 'Behlül';
    if (prefix === 'burak') return 'Burak';
    if (prefix === 'batuhan') return 'Batuhan';
    if (prefix === 'yunus') return 'Yunus';
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  };

  const displayUser = getDisplayName(user?.email);
  const isManager = displayUser.toLowerCase() === 'burak';

  const triggerPushCheck = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastPushTriggerRef.current < 3000) {
      return;
    }
    lastPushTriggerRef.current = now;

    try {
      const response = await fetch('/.netlify/functions/check-and-send-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true
      });
      if (response.ok) {
        const data = await response.json();
        console.log('[Push Sync] Kontrol tamamlandı:', data);
      }
    } catch (error) {
      console.warn('[Push Sync] Tetikleme hatası:', error);
    }
  }, []);

  const handleSaveDonor = async (updatedDonor: Donor) => {
    try {
      const { id, isOpen, ...dataToSave } = updatedDonor;
      await setDoc(doc(db, 'donors', id), dataToSave, { merge: true });
    } catch (err) {
      console.error('Kayıt kaydedilemedi:', err);
    }
  };

  const toggleMonthAccordion = (sortKey: string) => {
    setMonthAccordionState((prev) => ({
      ...prev,
      [sortKey]: prev[sortKey] === undefined ? false : !prev[sortKey]
    }));
  };

  const toggleDonorOpen = (id: string) => {
    setOpenDonorIds((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id]
    }));
  };

  const toggleAuditLog = (donorId: string) => {
    setOpenAuditLogIds((prev) => ({
      ...prev,
      [donorId]: !prev[donorId]
    }));
  };

  const createNotification = async (
    toUser: string,
    title: string,
    message: string,
    donorId: string,
    donorName: string,
    triggerAt?: string,
    deterministicKey?: string
  ) => {
    if (!toUser) return;
    try {
      const nowIso = new Date().toISOString();
      const finalTriggerAt = triggerAt || nowIso;

      const payload = {
        toUser: toUser.trim(),
        fromUser: displayUser,
        donorId: donorId || '',
        donorName: donorName || '',
        title,
        message,
        triggerAt: finalTriggerAt,
        read: false,
        pushStatus: 'pending',
        createdAt: nowIso
      };

      if (deterministicKey) {
        const safeId = deterministicKey.replace(/[^a-zA-Z0-9_-]/g, '_');
        await setDoc(doc(db, 'notifications', safeId), payload);
      } else {
        await addDoc(collection(db, 'notifications'), payload);
      }

      await triggerPushCheck(true);
    } catch (err) {
      console.error('Bildirim eklenemedi:', err);
    }
  };

  const markNotificationAsRead = async (notifId: string) => {
    try {
      await setDoc(doc(db, 'notifications', notifId), { read: true }, { merge: true });
    } catch (err) {
      console.error('Okundu yapılamadı:', err);
    }
  };

  const markAllNotificationsAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach((notif) => {
        batch.update(doc(db, 'notifications', notif.id), { read: true });
      });
      await batch.commit();
    } catch (err) {
      console.error('Toplu okundu yapılamadı:', err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && displayUser && displayUser !== 'Koordinatör') {
      try {
        requestAndSaveFCMToken(displayUser);
      } catch (e) {
        console.warn('FCM başlatılamadı:', e);
      }
    }
  }, [user, displayUser]);

  useEffect(() => {
    if (!user) return;

    triggerPushCheck(true);
    const interval = setInterval(() => triggerPushCheck(false), 90000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerPushCheck(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, triggerPushCheck]);

  useEffect(() => {
    if (!user || !displayUser) return;

    const notifQuery = query(
      collection(db, 'notifications'),
      where('toUser', '==', displayUser)
    );

    const unsubscribe = onSnapshot(
      notifQuery,
      (snapshot) => {
        const list: NotificationItem[] = [];

        snapshot.forEach((d) => {
          const data = d.data() as any;
          list.push({
            id: d.id,
            toUser: data.toUser || '',
            fromUser: data.fromUser || '',
            donorId: data.donorId || '',
            donorName: data.donorName || '',
            title: data.title || 'Bildirim',
            message: data.message || '',
            triggerAt: data.triggerAt || '',
            read: Boolean(data.read),
            pushStatus: data.pushStatus || 'pending',
            createdAt: data.createdAt || new Date().toISOString()
          });
        });

        list.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime() || 0;
          const timeB = new Date(b.createdAt).getTime() || 0;
          return timeB - timeA;
        });

        setNotifications(list);
      },
      (err) => {
        console.error('Bildirim dinleme hatası:', err);
      }
    );

    return () => unsubscribe();
  }, [user, displayUser]);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'donors'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const donorList: Donor[] = [];
        snapshot.forEach((docSnapshot) => {
          if (docSnapshot.id === '--month-states--') return;

          const data = docSnapshot.data() as any;
          donorList.push({
            id: docSnapshot.id,
            name: data.name || '',
            hospital: data.hospital || '',
            phone: data.phone || '',
            assignedTo: data.assignedTo || '',
            status: data.status || 'Aktif',
            statusNote: data.statusNote || '',
            healthCheck: data.healthCheck || { date: '', completed: false, completedBy: '' },
            publicHealth: data.publicHealth || { date: '', completed: false, completedBy: '' },
            transplantTube: data.transplantTube || { date: '', completed: false, completedBy: '' },
            idm: data.idm || { date: '', completed: false, completedBy: '', note: '' },
            postTransplantCheck: data.postTransplantCheck || { date: '', completed: false, completedBy: '' },
            vaccineDates: data.vaccineDates || [],
            vaccinePostponed: data.vaccinePostponed || false,
            auditLogs: data.auditLogs || []
          });
        });
        setDonors(donorList);
      },
      (error) => {
        console.error('Firestore hatası:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    if (!selectedUserEmail) {
      setLoginError('Lütfen isminizi seçin.');
      return;
    }
    if (!passwordInput.trim()) {
      setLoginError('Lütfen şifrenizi girin.');
      return;
    }

    setIsLoggingIn(true);

    try {
      await signInWithEmailAndPassword(auth, selectedUserEmail, passwordInput);
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        try {
          const prefix = selectedUserEmail.split('@')[0];
          const altEmail = `${prefix}@kizilay.org.tr`;
          await signInWithEmailAndPassword(auth, altEmail, passwordInput);
        } catch {
          setLoginError('Şifre hatalı veya giriş izniniz yok!');
        }
      } else {
        setLoginError('Giriş yapılamadı. Lütfen bilgilerinizi kontrol edin.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleSelectDonorFromPlan = (donorId: string) => {
    setSearchTerm('');
    setSelectedYear('all');
    setCurrentTab('operation');

    const donor = donors.find((d) => d.id === donorId);
    if (!donor) return;

    const sortKey = getDonorSortKey(donor);
    setMonthAccordionState((prev) => ({ ...prev, [sortKey]: true }));
    setOpenDonorIds((prev) => ({ ...prev, [donorId]: true }));

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const card = document.getElementById(`donor-card-${donorId}`);
      if (card) {
        clearInterval(interval);
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('ring-4', 'ring-indigo-500', 'bg-indigo-50/70');
        setTimeout(() => {
          card.classList.remove('ring-4', 'ring-indigo-500', 'bg-indigo-50/70');
        }, 2200);
      } else if (attempts >= 30) {
        clearInterval(interval);
      }
    }, 50);
  };

  const handleAddDonor = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newDonorName.trim()) {
      alert('Lütfen bağışçı adını girin.');
      return;
    }

    const newId = Date.now().toString() + Math.random().toString().substring(2, 7);
    const newDonor: Donor = {
      id: newId,
      name: newDonorName.trim(),
      hospital: newDonorHospital || '',
      assignedTo: '',
      status: 'Aktif',
      statusNote: '',
      healthCheck: { date: '', completed: false, completedBy: '' },
      publicHealth: { date: '', completed: false, completedBy: '' },
      transplantTube: { date: '', completed: false, completedBy: '' },
      idm: { date: '', completed: false, completedBy: '', note: '' },
      postTransplantCheck: { date: '', completed: false, completedBy: '' },
      vaccineDates: [],
      vaccinePostponed: false,
      auditLogs: [
        {
          date: new Date().toISOString(),
          user: displayUser,
          action: 'Yeni bağışçı sisteme manuel olarak eklendi.'
        }
      ]
    };

    await handleSaveDonor(newDonor);
    setOpenDonorIds((prev) => ({ ...prev, [newId]: true }));
    setNewDonorName('');
    setNewDonorHospital('');
  };

  const handleAssignDonor = async (donorId: string, assignedMember: string) => {
    if (!isManager) {
      alert('Görev atama yetkisi sadece Burak kullanıcısına aittir.');
      return;
    }

    const donor = donors.find((d) => d.id === donorId);
    if (!donor) return;

    const updated: Donor = {
      ...donor,
      assignedTo: assignedMember,
      auditLogs: [
        {
          date: new Date().toISOString(),
          user: displayUser,
          action: assignedMember
            ? `Dosya sorumlusu '${assignedMember}' olarak atandı.`
            : `Dosya sorumlusu ataması kaldırıldı.`
        },
        ...(donor.auditLogs || [])
      ]
    };
    await handleSaveDonor(updated);

    if (assignedMember) {
      await createNotification(
        assignedMember,
        'Yeni Dosya Sorumluluğu 📋',
        `${donor.name} isimli bağışçının dosya takibi size atanmıştır.`,
        donor.id,
        donor.name,
        new Date().toISOString(),
        `assign_${donor.id}`
      );
    }
  };

  const handleDeleteDonor = async (donor: Donor) => {
    if (!isManager) {
      alert('Bağışçı kaydını silme yetkisi sadece Burak kullanıcısına aittir.');
      return;
    }

    const onay = confirm(`"${donor.name}" kaydını kalıcı olarak silmek istediğinize emin misiniz?`);
    if (!onay) return;

    try {
      await deleteDoc(doc(db, 'donors', donor.id));
    } catch (err) {
      alert('Silinirken hata oluştu.');
    }
  };

  const handleNameChange = (id: string, newName: string) => {
    const donor = donors.find((d) => d.id === id);
    if (!donor || !newName.trim() || donor.name === newName.trim()) return;
    const updated: Donor = {
      ...donor,
      name: newName.trim(),
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: `İsim '${donor.name}' iken '${newName.trim()}' yapıldı.` },
        ...(donor.auditLogs || [])
      ]
    };
    handleSaveDonor(updated);
  };

  const handleStatusChange = (id: string, newStatus: string) => {
    const donor = donors.find((d) => d.id === id);
    if (!donor) return;
    const updated: Donor = {
      ...donor,
      status: newStatus,
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: `Süreç durumu '${newStatus}' yapıldı.` },
        ...(donor.auditLogs || [])
      ]
    };
    handleSaveDonor(updated);
  };

  const handleStatusNoteSave = (id: string, noteVal: string) => {
    const donor = donors.find((d) => d.id === id);
    if (!donor) return;
    const updated: Donor = {
      ...donor,
      statusNote: noteVal,
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: `Durum açıklaması kaydedildi.` },
        ...(donor.auditLogs || [])
      ]
    };
    handleSaveDonor(updated);
    setSavedStatusNoteId(id);
    setTimeout(() => setSavedStatusNoteId(null), 2000);
  };

  const handleHospitalChange = (id: string, hosp: string) => {
    const donor = donors.find((d) => d.id === id);
    if (!donor) return;
    const updated: Donor = {
      ...donor,
      hospital: hosp,
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: `Hastane '${hosp || "Belirtilmedi"}' olarak güncellendi.` },
        ...(donor.auditLogs || [])
      ]
    };
    handleSaveDonor(updated);
  };

  const handleStepFieldChange = async (
    donorId: string,
    field: 'healthCheck' | 'publicHealth' | 'transplantTube' | 'idm' | 'postTransplantCheck',
    key: 'date' | 'completed' | 'completedBy' | 'note',
    value: any
  ) => {
    if (key === 'completedBy' && !isManager) {
      alert('Sorumlu atama yetkisi sadece Burak kullanıcısına aittir.');
      return;
    }

    const donor = donors.find((d) => d.id === donorId);
    if (!donor) return;

    const currentStep = donor[field] || { date: '', completed: false, completedBy: '' };
    const updatedStep = { ...currentStep, [key]: value };
    const stepLabel = stepLabels[field] || field;

    let actionMsg = `${stepLabel} güncellendi.`;
    if (key === 'completed') actionMsg = `${stepLabel} ${value ? 'tamamlandı olarak işaretlendi.' : 'işareti kaldırıldı.'}`;
    if (key === 'completedBy') actionMsg = `${stepLabel} sorumlusu '${value || "Seçilmedi"}' atandı.`;

    const updated: Donor = {
      ...donor,
      [field]: updatedStep,
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: actionMsg },
        ...(donor.auditLogs || [])
      ]
    };
    await handleSaveDonor(updated);

    if (key === 'completedBy' && value) {
      await createNotification(
        value,
        `${stepLabel} Görevi 📌`,
        `${donor.name} bağışçısının "${stepLabel}" görevi ${updatedStep.date ? `(${updatedStep.date}) ` : ''}size atanmıştır.`,
        donor.id,
        donor.name,
        new Date().toISOString(),
        `step_assign_${donor.id}_${field}`
      );
    }

    if (key === 'date' && value && updatedStep.completedBy) {
      await createNotification(
        updatedStep.completedBy,
        `${stepLabel} Tarihi Güncellendi 📅`,
        `${donor.name} bağışçısının "${stepLabel}" tarihi ${value} olarak belirlendi.`,
        donor.id,
        donor.name,
        new Date().toISOString(),
        `step_date_${donor.id}_${field}`
      );
    }

    if (key === 'completed' && value === true) {
      await createNotification(
        'Burak',
        'Görev Tamamlandı ✅',
        `${displayUser}, ${donor.name} bağışçısının "${stepLabel}" görevini tamamladı.`,
        donor.id,
        donor.name,
        new Date().toISOString(),
        `step_done_${donor.id}_${field}`
      );
    }
  };

  const handleIdmNoteSave = (donorId: string, noteVal: string) => {
    handleStepFieldChange(donorId, 'idm', 'note', noteVal);
    setSavedIdmNoteId(donorId);
    setTimeout(() => setSavedIdmNoteId(null), 2000);
  };

  const getDateStatus = (stepObj?: StepDetail | VaccineDose) => {
    if (!stepObj || !stepObj.date) return 'normal';
    if (stepObj.completed) return 'completed';
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const target = new Date(stepObj.date);
    target.setHours(0, 0, 0, 0);
    if (isNaN(target.getTime())) return 'normal';

    const diffDays = Math.round((target.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays === 0) return 'today';

    const dayOfWeek = todayDate.getDay();
    let isUpcoming = false;
    if (dayOfWeek === 5 && diffDays >= 1 && diffDays <= 3) isUpcoming = true;
    else if (dayOfWeek === 6 && diffDays >= 1 && diffDays <= 2) isUpcoming = true;
    else if (diffDays === 1) isUpcoming = true;

    if (isUpcoming) return 'upcoming_soon';
    return 'normal';
  };

  const getDonorUrgencyClass = (d: Donor) => {
    const status = d.status || 'Aktif';
    if (status === 'İptal') return 'border-slate-300 bg-slate-100/90 opacity-60 grayscale';
    if (status === 'Beklemede') return 'border-amber-300 bg-amber-50/60 opacity-95';

    const steps: (StepDetail | VaccineDose | undefined)[] = [
      d.healthCheck,
      d.publicHealth,
      d.transplantTube,
      d.idm,
      d.postTransplantCheck
    ];
    if (!d.vaccinePostponed && d.vaccineDates) {
      steps.push(...d.vaccineDates);
    }

    let hasOverdue = false;
    let hasSoon = false;

    for (const s of steps) {
      const st = getDateStatus(s);
      if (st === 'overdue') hasOverdue = true;
      if (st === 'upcoming_soon' || st === 'today') hasSoon = true;
    }

    if (hasOverdue) return 'border-red-300 bg-red-50/30 text-red-950 shadow-xs';
    if (hasSoon) return 'border-amber-300 bg-amber-50/30 text-amber-950 shadow-xs';

    const allVaccinesCompleted = d.vaccineDates && d.vaccineDates.length > 0 && d.vaccineDates.every((v) => v.completed);
    if (allVaccinesCompleted) return 'border-emerald-400 bg-emerald-50/40 text-emerald-950 shadow-xs';

    return 'border-slate-200 bg-white shadow-xs';
  };

  const handleAutoGenerateVaccines = (donorId: string) => {
    if (!collectionDateInput) {
      alert('Lütfen aferez / ürün toplama tarihini seçin.');
      return;
    }
    const donor = donors.find((d) => d.id === donorId);
    if (!donor) return;

    const parts = collectionDateInput.split('-').map(Number);
    if (parts.length !== 3) {
      alert('Geçersiz tarih formatı.');
      return;
    }

    const colDateObj = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    if (isNaN(colDateObj.getTime())) {
      alert('Geçersiz tarih formatı.');
      return;
    }

    const startDateObj = new Date(colDateObj);
    startDateObj.setDate(colDateObj.getDate() - 5);
    const d1Str = formatLocalDate(startDateObj);

    const generatedDoses: VaccineDose[] = [
      { label: "1. Doz (1. Gün Akşam)", date: d1Str, completed: false, completedBy: "" }
    ];

    for (let i = 1; i <= 4; i++) {
      const currentDay = new Date(startDateObj);
      currentDay.setDate(startDateObj.getDate() + i);
      const dayStr = formatLocalDate(currentDay);
      generatedDoses.push({ label: `${i + 1}. Gün Sabah Dozu`, date: dayStr, completed: false, completedBy: "" });
      generatedDoses.push({ label: `${i + 1}. Gün Akşam Dozu`, date: dayStr, completed: false, completedBy: "" });
    }

    generatedDoses.push({ label: "10. Doz (Ürün Toplama Günü)", date: collectionDateInput, completed: false, completedBy: "" });

    const postDate = new Date(colDateObj);
    postDate.setDate(colDateObj.getDate() + 20);
    const postDateStr = formatLocalDate(postDate);

    const updated: Donor = {
      ...donor,
      vaccineDates: generatedDoses,
      postTransplantCheck: {
        ...(donor.postTransplantCheck || { completed: false, completedBy: '' }),
        date: postDateStr
      },
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: `10 Doz aşı planı ${collectionDateInput} toplama tarihine göre otomatik üretildi.` },
        ...(donor.auditLogs || [])
      ]
    };

    handleSaveDonor(updated);
    alert('10 Doz aşı planı ve Nakil Sonrası Sağlık tarihi (+20 gün) başarıyla oluşturuldu!');
  };

  const handleVaccineDoseChange = async (
    donorId: string,
    index: number,
    key: 'date' | 'completed' | 'completedBy',
    val: any
  ) => {
    if (key === 'completedBy' && !isManager) {
      alert('Aşı sorumlusu atama yetkisi sadece Burak kullanıcısına aittir.');
      return;
    }

    const donor = donors.find((d) => d.id === donorId);
    if (!donor || !donor.vaccineDates) return;

    const newDoses = [...donor.vaccineDates];
    newDoses[index] = { ...newDoses[index], [key]: val };

    const updated: Donor = {
      ...donor,
      vaccineDates: newDoses,
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: `Aşı Doz #${index + 1} (${key}) güncellendi.` },
        ...(donor.auditLogs || [])
      ]
    };
    await handleSaveDonor(updated);

    const dose = newDoses[index];
    const doseLabel = dose.label || `Doz #${index + 1}`;
    const isEvening = doseLabel.toLowerCase().includes('akşam');

    if (key === 'completedBy' && val) {
      await createNotification(
        val,
        isEvening ? 'Akşam Aşısı Görevi 💉' : 'Sabah Aşısı Görevi 💉',
        `${donor.name} bağışçısının ${doseLabel} (${dose.date || 'Tarihsiz'}) görevi size atanmıştır.`,
        donor.id,
        donor.name,
        new Date().toISOString(),
        `vac_assign_${donor.id}_${index}`
      );
    }

    if (key === 'completed' && val === true) {
      await createNotification(
        'Burak',
        'Aşı Dozu Tamamlandı ✅',
        `${displayUser}, ${donor.name} bağışçısının ${doseLabel} aşısını tamamladı.`,
        donor.id,
        donor.name,
        new Date().toISOString(),
        `vac_done_${donor.id}_${index}`
      );
    }
  };

  const handleToggleVaccinePostpone = (donorId: string, isPostponed: boolean) => {
    const donor = donors.find((d) => d.id === donorId);
    if (!donor) return;

    const updated: Donor = {
      ...donor,
      vaccinePostponed: isPostponed,
      auditLogs: [
        { date: new Date().toISOString(), user: displayUser, action: isPostponed ? 'Aşı takvimi ertelendi.' : 'Aşı takvimi ertelemesi kaldırıldı.' },
        ...(donor.auditLogs || [])
      ]
    };
    handleSaveDonor(updated);
  };

  const uniqueYears = Array.from(
    new Set(
      donors
        .map((d) => d.healthCheck?.date?.split('-')[0])
        .filter((y): y is string => Boolean(y && y.length === 4))
    )
  ).sort().reverse();

  // YENİ: Arama/yıl filtresi sonrasında Ortak Liste veya Bana Atananlar filtresini uygulama
  const filteredDonors = donors.filter((d) => {
    const nameMatch = d.name?.toLowerCase().includes(searchTerm.toLowerCase().trim());
    const donorYear = d.healthCheck?.date ? d.healthCheck.date.split('-')[0] : '';
    const yearMatch = selectedYear === 'all' || donorYear === selectedYear || donorYear === '';
    
    // Görünüm Modu Filtresi (Ortak Liste vs Bana Atananlar)
    const viewMatch = taskViewMode === 'all' || d.assignedTo === displayUser;

    return nameMatch && yearMatch && viewMatch;
  });

  const groupedDonors: Record<string, { display: string; donors: Donor[] }> = {};

  filteredDonors.forEach((d) => {
    const sortKey = getDonorSortKey(d);
    let displayKey = 'Tarihi Belirsiz (Sağlık Kontrolü Bekleniyor)';

    if (sortKey !== '9999-12') {
      const parts = sortKey.split('-');
      const mIndex = parseInt(parts[1], 10) - 1;
      if (mIndex >= 0 && mIndex < 12) {
        displayKey = `${monthNames[mIndex]} ${parts[0]}`;
      }
    }

    if (!groupedDonors[sortKey]) {
      groupedDonors[sortKey] = { display: displayKey, donors: [] };
    }
    groupedDonors[sortKey].donors.push(d);
  });

  const sortedMonthKeys = Object.keys(groupedDonors).sort((a, b) => a.localeCompare(b));
  const activeVaccineDonor = donors.find((d) => d.id === activeVaccineDonorId);
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-slate-500 text-sm font-semibold flex items-center gap-2">
          <span className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
          TÜRKÖK Sistemi Yükleniyor...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full space-y-4 shadow-2xl text-center border border-slate-100">
          <div className="text-4xl mb-1">🔒</div>
          <h2 className="font-bold text-lg text-slate-800">Yetkili Girişi</h2>
          <p className="text-xs text-slate-500">Lütfen isminizi seçin ve Firebase şifrenizi girin.</p>

          {loginError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3 pt-1">
            <div className="text-left">
              <label className="block text-[11px] font-bold text-slate-600 mb-1 ml-1">Kullanıcı</label>
              <select
                id="userSelectInput"
                value={selectedUserEmail}
                onChange={(e) => setSelectedUserEmail(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-indigo-500 bg-white font-medium cursor-pointer shadow-xs"
              >
                <option value="">👤 İsminizi Seçin</option>
                {authorizedUsers.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-left">
              <label className="block text-[11px] font-bold text-slate-600 mb-1 ml-1">Şifre</label>
              <input
                type="password"
                id="passwordInput"
                placeholder="••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-indigo-500 shadow-xs"
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold py-2.5 rounded-xl text-xs transition shadow-md cursor-pointer mt-2"
            >
              {isLoggingIn ? 'Bağlanıyor...' : 'Giriş Yap'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const renderStepBox = (
    donor: Donor,
    title: string,
    field: 'healthCheck' | 'publicHealth' | 'transplantTube' | 'idm' | 'postTransplantCheck'
  ) => {
    const stepObj = donor[field] || { date: '', completed: false, completedBy: '', note: '' };
    const st = getDateStatus(stepObj);

    let dateBorder = 'border-slate-200';
    let badgeHtml = null;

    if (st === 'overdue') {
      dateBorder = 'border-red-400 bg-red-50';
      badgeHtml = <span className="text-[10px] text-red-600 font-bold block">Gecikti!</span>;
    } else if (st === 'today') {
      dateBorder = 'border-amber-400 bg-amber-50';
      badgeHtml = <span className="text-[10px] text-amber-600 font-bold block">Bugün!</span>;
    } else if (st === 'upcoming_soon') {
      dateBorder = 'border-amber-300 bg-amber-50/50';
      badgeHtml = <span className="text-[10px] text-amber-700 font-bold block">Yarın!</span>;
    } else if (stepObj.completed) {
      dateBorder = 'border-emerald-300 bg-emerald-50';
      badgeHtml = <span className="text-[10px] text-emerald-600 font-bold block">✓ Tamamlandı</span>;
    }

    const boxBg = stepObj.completed ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-white';
    const titleColor = stepObj.completed ? 'text-emerald-800' : 'text-slate-700';
    const isIdmSaved = savedIdmNoteId === donor.id;
    const currentIdmNote = idmNotesDraft[donor.id] !== undefined ? idmNotesDraft[donor.id] : (stepObj.note || '');

    return (
      <div className={`p-3 rounded-xl border ${boxBg} space-y-2 flex flex-col justify-start transition-colors h-full`}>
        <div>
          <div className="flex justify-between items-center mb-1">
            <span className={`font-semibold ${titleColor}`}>{title}</span>
            {badgeHtml}
          </div>
          <input
            type="date"
            value={stepObj.date || ''}
            onChange={(e) => handleStepFieldChange(donor.id, field, 'date', e.target.value)}
            className={`w-full border ${dateBorder} rounded-lg p-1 text-xs`}
          />
        </div>

        <div className="space-y-1.5 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={stepObj.completed || false}
              onChange={(e) => handleStepFieldChange(donor.id, field, 'completed', e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
            />
            <span className="text-[11px] font-medium text-slate-600">Yapıldı</span>
          </div>

          {isManager ? (
            <select
              value={stepObj.completedBy || ''}
              onChange={(e) => handleStepFieldChange(donor.id, field, 'completedBy', e.target.value)}
              className="w-full border border-indigo-200 bg-indigo-50/40 rounded-lg p-1 text-[11px] text-indigo-900 font-medium cursor-pointer"
              title="Görev Sorumlusu Ata (Yönetici)"
            >
              <option value="">👤 Sorumlu Ata</option>
              {teamMembers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <div
              className="w-full border border-slate-200 bg-slate-50 rounded-lg p-1 text-[11px] text-slate-600 flex items-center justify-between"
              title="Sorumlu atama yetkisi sadece Burak kullanıcısına aittir."
            >
              <span className="truncate">👤 {stepObj.completedBy || 'Atanmadı'}</span>
              <span className="text-[9px] text-slate-400">🔒</span>
            </div>
          )}
        </div>

        {field === 'idm' && (
          <div className="pt-2 mt-2 border-t border-slate-100">
            <span className="text-[10px] font-semibold text-slate-500 mb-1 block">📝 Süreç Açıklaması:</span>
            <textarea
              value={currentIdmNote}
              onChange={(e) => setIdmNotesDraft((prev) => ({ ...prev, [donor.id]: e.target.value }))}
              placeholder="Örn: Rapor bekleniyor..."
              className="w-full border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-700 focus:outline-indigo-500 resize-y min-h-[44px] max-h-40 bg-white/60 mb-1 shadow-inner leading-relaxed"
            />
            <button
              onClick={() => handleIdmNoteSave(donor.id, currentIdmNote)}
              className={`w-full text-[10px] font-bold py-1.5 rounded-lg transition cursor-pointer ${
                isIdmSaved
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
              }`}
            >
              {isIdmSaved ? 'Kayıtlı ✅' : 'Kaydet'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-12">
      <header className="bg-slate-900 text-white shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-rose-600/20 text-rose-500 text-xl font-bold">
              🩸
            </span>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                TÜRKÖK Kök Hücre Koordinasyon
              </h1>
              <p className="text-[10px] text-slate-400">Bağışçı ve Süreç Takip Sistemi V2.0</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                className="relative p-2 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition cursor-pointer flex items-center justify-center text-sm"
                title="Bildirimler"
              >
                <span>🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 text-[9px] font-bold bg-rose-600 text-white rounded-full animate-pulse shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div className="fixed top-[70px] left-4 right-4 sm:absolute sm:top-auto sm:left-auto sm:right-0 sm:mt-3 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-50 text-slate-800">
                  <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <span>🔔</span> Bildirimler ({unreadCount})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          createNotification(
                            displayUser,
                            'Test Bildirimi 🔔',
                            `Merhaba ${displayUser}, bildirim sistemi sorunsuz çalışıyor!`,
                            '',
                            ''
                          )
                        }
                        className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 transition cursor-pointer bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-md"
                      >
                        ⚡ Test Gönder
                      </button>
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          onClick={markAllNotificationsAsRead}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer bg-indigo-50 px-2.5 py-1 rounded-md"
                        >
                          Tümünü Oku
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-[60vh] sm:max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400 font-medium">
                        Henüz bir bildiriminiz bulunmuyor.
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => {
                            markNotificationAsRead(notif.id);
                            setShowNotifMenu(false);
                            if (notif.donorId) handleSelectDonorFromPlan(notif.donorId);
                          }}
                          className={`p-4 sm:p-5 text-xs cursor-pointer transition hover:bg-slate-50 ${
                            !notif.read ? 'bg-indigo-50/40' : 'bg-white opacity-90'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2 gap-2">
                            <span className="font-bold text-indigo-900 text-xs truncate">
                              {notif.title}
                            </span>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap font-medium">
                              {new Date(notif.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-[11.5px] text-slate-600 leading-relaxed mb-2">
                            {notif.message}
                          </p>
                          {notif.donorId && (
                            <span className="text-[10px] text-indigo-600 font-bold inline-block hover:underline">
                              Karta Git ➔
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700">
              <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                {displayUser.charAt(0)}
              </span>
              <span className="text-xs font-semibold text-slate-200">{displayUser}</span>
              {isManager && (
                <span className="text-[9px] bg-rose-600/80 text-white font-bold px-1.5 py-0.2 rounded">
                  Yönetici
                </span>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1.5 rounded-xl transition cursor-pointer"
            >
              Çıkış Yap
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
          <button
            onClick={() => setCurrentTab('operation')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              currentTab === 'operation'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>📋</span> Bağışçı Süreçleri
          </button>

          <button
            onClick={() => setCurrentTab('this-week')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              currentTab === 'this-week'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>📌</span> Bu Haftanın İşleri
          </button>

          <button
            onClick={() => setCurrentTab('next-week')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              currentTab === 'next-week'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>🗓️</span> Önümüzdeki Haftanın İşleri
          </button>

          <button
            onClick={() => setCurrentTab('reporting')}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-2 whitespace-nowrap ${
              currentTab === 'reporting'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>📊</span> Detaylı Süreç Raporları
          </button>
        </div>

        {currentTab === 'operation' && (
          <div className="space-y-4">
            <OperationalTasks
              donors={donors}
              currentUser={displayUser}
              onSelectDonor={handleSelectDonorFromPlan}
            />

            {/* YENİ: Ortak Liste ve Bana Atananlar Geçiş Sekmeleri */}
            <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl w-fit border border-slate-200 shadow-2xs">
              <button
                onClick={() => setTaskViewMode('all')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                  taskViewMode === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>📋</span>
                <span>Ortak Liste ({donors.length})</span>
              </button>
              <button
                onClick={() => setTaskViewMode('mine')}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5 ${
                  taskViewMode === 'mine'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>👤</span>
                <span>Bana Atananlar ({donors.filter(d => d.assignedTo === displayUser).length})</span>
              </button>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 space-y-2.5">
              <div className="flex justify-between items-center">
                <h2 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>➕</span> Yeni Bağışçı Ekle
                </h2>
                <span className="text-[11px] text-slate-400">Tekil manuel kayıt</span>
              </div>
              <form onSubmit={handleAddDonor} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Bağışçı Adı Soyadı"
                  value={newDonorName}
                  onChange={(e) => setNewDonorName(e.target.value)}
                  className="flex-1 border border-slate-300 rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-indigo-500 bg-slate-50 transition"
                />
                <select
                  value={newDonorHospital}
                  onChange={(e) => setNewDonorHospital(e.target.value)}
                  className="border border-slate-300 rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-indigo-500 bg-slate-50 cursor-pointer"
                >
                  <option value="">Hastane Seçin (İsteğe Bağlı)</option>
                  <option value="İzmir Şehir Hastanesi">İzmir Şehir Hastanesi</option>
                  <option value="Yeşilyurt">Yeşilyurt</option>
                </select>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 py-2 rounded-xl text-xs transition cursor-pointer shadow-xs whitespace-nowrap"
                >
                  Ekle
                </button>
              </form>
            </div>

            <ExcelManager donors={donors} />

            <div className="bg-white p-4 rounded-2xl shadow-xs border border-slate-200 space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>🔍</span> Bağışçı Ara & Filtrele
                </span>
                <span className="text-[11px] text-slate-400 font-semibold">
                  Gösterilen: <strong className="text-indigo-600">{filteredDonors.length}</strong> / {donors.length}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Bağışçı adı soyadı ile arayın..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 text-xs px-3.5 py-2.5 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:outline-indigo-500 transition"
                />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-indigo-500 bg-indigo-50 text-indigo-700 font-bold cursor-pointer"
                >
                  <option value="all">Tüm Yıllar</option>
                  {uniqueYears.map((year) => (
                    <option key={year} value={year}>
                      {year} Yılı
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-4">
              {filteredDonors.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl text-center text-xs text-slate-400 border border-slate-200">
                  {taskViewMode === 'mine' 
                    ? `(${displayUser}) üzerine atanmış aktif bir süreç bulunmuyor veya filtrelere uygun kayıt yok.` 
                    : 'Filtrelere uygun bağışçı kaydı bulunamadı.'}
                </div>
              ) : (
                sortedMonthKeys.map((sortKey) => {
                  const group = groupedDonors[sortKey];
                  const isMonthOpen = monthAccordionState[sortKey] ?? true;

                  return (
                    <div key={sortKey} className="space-y-3">
                      <div
                        onClick={() => toggleMonthAccordion(sortKey)}
                        className="bg-indigo-50 hover:bg-indigo-100 border-l-4 border-indigo-500 py-2.5 px-3 rounded-r-xl shadow-xs flex justify-between items-center cursor-pointer transition select-none"
                      >
                        <h3 className="text-xs font-bold text-indigo-900 flex items-center gap-2">
                          <span className={`text-indigo-600 transition-transform duration-200 ${isMonthOpen ? 'rotate-90' : ''}`}>
                            ▶
                          </span>
                          <span>📅</span> {group.display}
                        </h3>
                        <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-200/60 px-2.5 py-0.5 rounded-full">
                          {group.donors.length} Bağışçı
                        </span>
                      </div>

                      {isMonthOpen && (
                        <div className="space-y-3 ml-1 sm:ml-3">
                          {group.donors.map((donor) => {
                            const isCardOpen = openDonorIds[donor.id] ?? true;
                            const completedDoses = donor.vaccineDates?.filter((v) => v.completed).length || 0;
                            const allVaccinesDone = donor.vaccineDates && donor.vaccineDates.length > 0 && completedDoses === donor.vaccineDates.length;

                            let vaccineBadge = <span className="text-[11px] bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full font-medium">Aşı: {completedDoses}/10</span>;
                            if (donor.vaccinePostponed) {
                              vaccineBadge = <span className="text-[11px] bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">Aşı: Ertelendi</span>;
                            } else if (allVaccinesDone) {
                              vaccineBadge = <span className="text-[11px] bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-full font-bold">✅ Tüm Dozlar Bitti</span>;
                            }

                            let vaccineBoxBg = 'bg-slate-50 border-slate-200';
                            let vaccineTitle = 'text-slate-700';
                            let vaccineDesc = 'text-slate-400';
                            let vaccineDescText = 'Otomatik 10 Doz';
                            let vaccineBtnColor = 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600';

                            if (allVaccinesDone) {
                              vaccineBoxBg = 'bg-emerald-50 border-emerald-200';
                              vaccineTitle = 'text-emerald-800';
                              vaccineDesc = 'text-emerald-600 font-medium';
                              vaccineDescText = '✅ Tüm Dozlar Bitti';
                              vaccineBtnColor = 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700';
                            } else if (donor.vaccinePostponed) {
                              vaccineDesc = 'text-amber-600 font-medium';
                              vaccineDescText = '⚠️ Takvim Ertelendi';
                            }

                            const isAuditOpen = openAuditLogIds[donor.id] ?? false;
                            const isStatusSaved = savedStatusNoteId === donor.id;
                            const currentStatusNote = statusNotesDraft[donor.id] !== undefined ? statusNotesDraft[donor.id] : (donor.statusNote || '');

                            return (
                              <div
                                key={donor.id}
                                id={`donor-card-${donor.id}`}
                                className={`rounded-2xl border overflow-hidden transition ${getDonorUrgencyClass(donor)}`}
                              >
                                <div
                                  onClick={() => toggleDonorOpen(donor.id)}
                                  className="flex justify-between items-center p-3.5 hover:bg-slate-50/70 cursor-pointer select-none gap-2 border-b border-slate-100/70"
                                >
                                  <div className="flex items-center gap-2.5 flex-1 flex-wrap">
                                    <span className={`text-indigo-600 font-bold transition-transform duration-200 ${isCardOpen ? 'rotate-90' : ''}`}>
                                      ▶
                                    </span>
                                    <input
                                      type="text"
                                      defaultValue={donor.name}
                                      onClick={(e) => e.stopPropagation()}
                                      onBlur={(e) => handleNameChange(donor.id, e.target.value)}
                                      className="font-bold text-sm text-indigo-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 focus:outline-none px-1 py-0.5"
                                    />
                                    {donor.status === 'Beklemede' && (
                                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md font-bold border border-amber-200">
                                        ⏸️ Beklemede
                                      </span>
                                    )}
                                    {donor.status === 'İptal' && (
                                      <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-md font-bold border border-red-200">
                                        ❌ İptal
                                      </span>
                                    )}
                                    <span className="text-[10px] bg-sky-100 text-sky-700 px-2 py-0.5 rounded-md font-bold border border-sky-200">
                                      🏥 {donor.hospital || 'Hastane Belirsiz'}
                                    </span>

                                    <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200 flex items-center gap-1">
                                      <span>👤</span>
                                      <span>{donor.assignedTo || 'Atanmadı'}</span>
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                    {vaccineBadge}
                                    {isManager && (
                                      <button
                                        onClick={() => handleDeleteDonor(donor)}
                                        className="text-xs bg-red-100 hover:bg-red-200 text-red-600 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer"
                                      >
                                        Sil
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isCardOpen && (
                                  <div className="p-4 bg-white/90 space-y-4 text-xs">
                                    <div className="flex flex-col lg:flex-row items-start lg:items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 w-full">
                                      <div className="flex items-center gap-1.5 shrink-0 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                        <span className="text-[11px] font-bold text-slate-700">👤 Sorumlu:</span>
                                        {isManager ? (
                                          <select
                                            value={donor.assignedTo || ''}
                                            onChange={(e) => handleAssignDonor(donor.id, e.target.value)}
                                            className="border-0 bg-transparent text-xs font-bold text-indigo-700 focus:outline-none cursor-pointer"
                                            title="Dosya Sorumlusu Ata (Yönetici)"
                                          >
                                            <option value="">Atanmadı</option>
                                            {teamMembers.map((m) => (
                                              <option key={m} value={m}>
                                                {m}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span className="text-xs font-bold text-slate-700 flex items-center gap-1" title="Sadece Burak görev ataması yapabilir">
                                            {donor.assignedTo || 'Atanmadı'}
                                            <span className="text-[10px] text-slate-400">🔒</span>
                                          </span>
                                        )}
                                      </div>

                                      <span className="text-xs font-semibold text-slate-700 whitespace-nowrap ml-1">
                                        📌 Süreç Durumu:
                                      </span>
                                      <select
                                        value={donor.status || 'Aktif'}
                                        onChange={(e) => handleStatusChange(donor.id, e.target.value)}
                                        className="border border-slate-300 rounded-md p-1.5 text-xs bg-white focus:outline-indigo-500 font-medium cursor-pointer"
                                      >
                                        <option value="Aktif">🟢 Aktif (İşlemler Devam Ediyor)</option>
                                        <option value="Beklemede">⏸️ Beklemede (Süreci Duraklat)</option>
                                        <option value="İptal">❌ İptal / Vazgeçti</option>
                                      </select>
                                      <div className="flex-1 w-full lg:w-auto flex gap-2 items-start">
                                        <textarea
                                          value={currentStatusNote}
                                          onChange={(e) => setStatusNotesDraft((prev) => ({ ...prev, [donor.id]: e.target.value }))}
                                          placeholder="İptal/Bekleme nedeni (Örn: Grip oldu, 1 ay ertelendi vb.)"
                                          className="flex-1 border border-slate-300 rounded-md p-1.5 text-xs focus:outline-indigo-500 bg-white resize-y min-h-[34px] max-h-32 leading-relaxed"
                                        />
                                        <button
                                          onClick={() => handleStatusNoteSave(donor.id, currentStatusNote)}
                                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                                            isStatusSaved
                                              ? 'bg-emerald-100 text-emerald-700'
                                              : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700'
                                          }`}
                                        >
                                          {isStatusSaved ? 'Kaydedildi ✅' : 'Notu Kaydet'}
                                        </button>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 w-max">
                                      <span className="text-xs font-semibold text-sky-800">🏥 İşlem Hastanesi:</span>
                                      <select
                                        value={donor.hospital || ''}
                                        onChange={(e) => handleHospitalChange(donor.id, e.target.value)}
                                        className="border border-sky-200 rounded-md p-1 text-xs bg-white text-slate-700 focus:outline-sky-500 font-medium cursor-pointer"
                                      >
                                        <option value="">Seçilmedi</option>
                                        <option value="İzmir Şehir Hastanesi">İzmir Şehir Hastanesi</option>
                                        <option value="Yeşilyurt">Yeşilyurt</option>
                                      </select>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-stretch">
                                      {renderStepBox(donor, 'Sağlık Kontrolü', 'healthCheck')}
                                      {renderStepBox(donor, 'Halk Sağlığı', 'publicHealth')}
                                      {renderStepBox(donor, 'Nakil Merkezi Tüpü', 'transplantTube')}
                                      {renderStepBox(donor, 'IDM', 'idm')}
                                      {renderStepBox(donor, 'Nakil Sonrası Sağlık', 'postTransplantCheck')}

                                      <div className={`p-3 ${vaccineBoxBg} rounded-xl border space-y-2 flex flex-col justify-between transition-colors h-full`}>
                                        <div>
                                          <span className={`font-semibold ${vaccineTitle} block mb-1`}>Aşı Programı</span>
                                          <p className={`text-[10px] ${vaccineDesc}`}>{vaccineDescText}</p>
                                        </div>
                                        <button
                                          onClick={() => {
                                            setActiveVaccineDonorId(donor.id);
                                            setCollectionDateInput(donor.vaccineDates?.find((v) => v.label.includes('10. Doz'))?.date || '');
                                          }}
                                          className={`w-full ${vaccineBtnColor} font-medium py-1.5 rounded-lg transition text-center mt-auto cursor-pointer`}
                                        >
                                          Aşı Planı Görüntüle
                                        </button>
                                      </div>
                                    </div>

                                    <div className="mt-4 border-t border-slate-100 pt-3">
                                      <button
                                        type="button"
                                        onClick={() => toggleAuditLog(donor.id)}
                                        className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 transition flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-indigo-50 cursor-pointer select-none"
                                      >
                                        <span>📜</span> İşlem Geçmişini Göster / Gizle
                                        <span className="text-[10px] text-slate-400">
                                          {isAuditOpen ? '▲' : '▼'}
                                        </span>
                                      </button>

                                      {isAuditOpen && (
                                        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 shadow-inner">
                                          {donor.auditLogs && donor.auditLogs.length > 0 ? (
                                            donor.auditLogs.map((log, idx) => (
                                              <div
                                                key={idx}
                                                className="text-[10px] text-slate-600 flex justify-between border-b border-slate-100 last:border-0 pb-1"
                                              >
                                                <div>
                                                  <strong className="text-indigo-700">{log.user}:</strong>{' '}
                                                  <span>{log.action}</span>
                                                </div>
                                                <span className="text-slate-400 text-[9px] font-mono whitespace-nowrap ml-2">
                                                  {log.date ? new Date(log.date).toLocaleString('tr-TR') : ''}
                                                </span>
                                              </div>
                                            ))
                                          ) : (
                                            <div className="text-[10px] text-slate-400 p-2 text-center">
                                              Henüz bir işlem geçmişi yok.
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {currentTab === 'this-week' && (
          <WeeklyPlanTab
            donors={donors}
            mode="this-week"
            onSelectDonor={handleSelectDonorFromPlan}
          />
        )}

        {currentTab === 'next-week' && (
          <WeeklyPlanTab
            donors={donors}
            mode="next-week"
            onSelectDonor={handleSelectDonorFromPlan}
          />
        )}

        {currentTab === 'reporting' && <ReportingTab donors={donors} />}
      </main>

      {activeVaccineDonor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full space-y-4 shadow-2xl border border-slate-100">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span>💉</span> 10 Doz Aşı Planı — {activeVaccineDonor.name}
                </h3>
                <p className="text-[11px] text-slate-500">G-CSF doz takvimi ve sorumlu personel takibi</p>
              </div>
              <button
                onClick={() => setActiveVaccineDonorId(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="block font-bold text-indigo-900 text-xs">📅 Aferez (Ürün Toplama) Tarihini Seçin</span>
                <span className="block text-[10px] text-indigo-700">Seçtiğiniz tarihe göre 10 doz ve +20 gün kontrolü otomatik hesaplanır.</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={collectionDateInput}
                  onChange={(e) => setCollectionDateInput(e.target.value)}
                  className="border border-indigo-300 rounded-xl px-2.5 py-1.5 text-xs bg-white text-slate-800"
                />
                <button
                  onClick={() => handleAutoGenerateVaccines(activeVaccineDonor.id)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition cursor-pointer shadow-xs"
                >
                  Tarihleri Otomatik Dağıt
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex justify-between items-center">
              <div>
                <span className="block font-bold text-amber-800 text-xs">Tüm Takvimi Ertele</span>
                <span className="block text-[10px] text-amber-600">İşaretlendiğinde geciken aşı uyarılarından düşer.</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-amber-200 shadow-sm hover:bg-amber-100 transition">
                <input
                  type="checkbox"
                  checked={activeVaccineDonor.vaccinePostponed || false}
                  onChange={(e) => handleToggleVaccinePostpone(activeVaccineDonor.id, e.target.checked)}
                  className="rounded text-amber-500 h-4 w-4 focus:ring-amber-400 cursor-pointer"
                />
                <span className="font-semibold text-xs text-amber-700">Ertelendi</span>
              </label>
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {!activeVaccineDonor.vaccineDates || activeVaccineDonor.vaccineDates.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
                  Henüz aşı planı oluşturulmamış. Yukarıdan toplama tarihini seçip "Tarihleri Otomatik Dağıt" butonuna basabilirsiniz.
                </div>
              ) : (
                activeVaccineDonor.vaccineDates.map((dose, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col sm:flex-row justify-between items-start sm:items-center bg-slate-50 p-2.5 rounded-xl border border-slate-200 gap-2 text-xs transition ${
                      activeVaccineDonor.vaccinePostponed ? 'opacity-60 grayscale' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-indigo-600 w-16">Doz #{idx + 1}</span>
                      <span className="text-[11px] text-slate-500 w-36 truncate">{dose.label}</span>
                      <input
                        type="date"
                        value={dose.date || ''}
                        onChange={(e) => handleVaccineDoseChange(activeVaccineDonor.id, idx, 'date', e.target.value)}
                        className="border border-slate-200 rounded-lg p-1 text-xs bg-white"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dose.completed || false}
                          onChange={(e) => handleVaccineDoseChange(activeVaccineDonor.id, idx, 'completed', e.target.checked)}
                          className="rounded text-indigo-600 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="font-medium text-slate-600">Yapıldı</span>
                      </label>

                      {isManager ? (
                        <select
                          value={dose.completedBy || ''}
                          onChange={(e) => handleVaccineDoseChange(activeVaccineDonor.id, idx, 'completedBy', e.target.value)}
                          className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-1 text-xs text-indigo-900 font-medium cursor-pointer"
                        >
                          <option value="">Aşı Sorumlusu Ata</option>
                          {teamMembers.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className="border border-slate-200 bg-slate-100 text-slate-600 rounded-lg px-2 py-1 text-[11px] font-medium flex items-center gap-1"
                          title="Sadece Burak aşı sorumlusu atayabilir"
                        >
                          <span>{dose.completedBy || 'Atanmadı'}</span>
                          <span className="text-[9px] text-slate-400">🔒</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setActiveVaccineDonorId(null)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}