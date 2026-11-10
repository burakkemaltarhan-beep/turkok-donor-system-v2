import { db } from '../config/firebase';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch 
} from 'firebase/firestore';

// 1. Bağışçıları ve ay akordeon durumlarını canlı dinleme
export function subscribeToDonors(onDataUpdate, onError) {
  return onSnapshot(collection(db, "donors"), (snapshot) => {
    let donorsList = [];
    let monthStatesData = {};

    snapshot.forEach((docSnap) => {
      if (docSnap.id === "--month-states--") {
        monthStatesData = docSnap.data();
      } else {
        let d = docSnap.data();
        if (!d.auditLogs) d.auditLogs = [];
        donorsList.push({ id: docSnap.id, ...d });
      }
    });

    onDataUpdate(donorsList, monthStatesData);
  }, (error) => {
    console.error("Firestore veri çekme hatası: ", error);
    if (onError) onError(error);
  });
}

// 2. Tekil Bağışçı Kaydetme / Güncelleme (Micro-Save)
export async function saveSingleDonor(donor) {
  try {
    let docId = donor.id.toString();
    let dataToSave = { ...donor };
    delete dataToSave.id;
    await setDoc(doc(db, "donors", docId), dataToSave);
  } catch (e) {
    console.error("Firestore kayıt hatası:", e);
    throw e;
  }
}

// 3. Ay akordeon durumunu kaydetme
export async function saveMonthStateToFirebase(monthState) {
  try {
    await setDoc(doc(db, "donors", "--month-states--"), monthState);
  } catch (e) {
    console.error("Ay durumu kayıt hatası:", e);
  }
}

// 4. Bağışçı silme
export async function deleteDonorFromCloud(id) {
  try {
    await deleteDoc(doc(db, "donors", id.toString()));
  } catch (err) {
    console.error("Firestore silme hatası:", err);
    throw err;
  }
}

// 5. Toplu veri aktarımı (Batch Write)
export async function batchSaveDonors(newDonorsArray) {
  try {
    const batch = writeBatch(db);
    newDonorsArray.forEach((d) => {
      let docRef = doc(db, "donors", d.id.toString());
      let dataToSave = { ...d };
      delete dataToSave.id;
      batch.set(docRef, dataToSave);
    });
    await batch.commit();
    return true;
  } catch (e) {
    console.error("Batch aktarım hatası: ", e);
    return false;
  }
}