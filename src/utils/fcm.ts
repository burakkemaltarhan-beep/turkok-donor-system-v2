import { getApp } from 'firebase/app';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const VAPID_KEY = 'BOIoIl1kbrC4XjYr_2HJy5z9NgezH_hzzvOKccQQFCLPQP0GFsbIWY-ARS81TLnjsX_B7b8Qg2-ZAH2nl1A7p4A';

export const requestAndSaveFCMToken = async (userName: string) => {
  try {
    const supported = await isSupported();
    if (!supported) {
      console.warn('[FCM] Bu tarayıcı veya ortam Firebase Messaging desteklemiyor.');
      return null;
    }

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Bildirim izni verilmedi.');
      return null;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    
    // app'i firebase.js'den import etmek yerine doğrudan hafızadaki varsayılan örnekten alıyoruz
    const app = getApp();
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (token && userName) {
      await setDoc(
        doc(db, 'fcm_tokens', userName.toLowerCase()),
        {
          userName,
          token,
          updatedAt: new Date().toISOString(),
          platform: navigator.userAgent
        },
        { merge: true }
      );
      console.log(`[FCM] ${userName} için token Firestore'a kaydedildi:`, token);
      return token;
    }
  } catch (error) {
    console.warn('[FCM] Token alma işlemi sırasında hata oluştu:', error);
  }
  return null;
};