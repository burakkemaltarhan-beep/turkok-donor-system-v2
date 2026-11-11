import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (!getApps().length) {
  try {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || "kizilay-c3c96",
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY
          ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          : undefined
      })
    });
  } catch (e) {
    console.error('Firebase Admin başlatılamadı:', e);
  }
}

const db = getFirestore();
const messaging = getMessaging();

// Sabit uygulama adresini ortam değişkeninden al (Sonunda tek bir '/' olmasını garantile)
const getAppUrl = () => {
  const rawUrl = process.env.APP_URL || process.env.URL || '';
  if (!rawUrl || !rawUrl.startsWith('https://')) {
    throw new Error('Geçerli bir https:// APP_URL ortam değişkeni tanımlanmamış!');
  }
  return rawUrl.replace(/\/+$/, '') + '/';
};

// Türkçe karakter uyumlu + Hem Doküman ID hem de 'user'/'userName' alanı üzerinden Token toplayıcı
async function getUserTokens(toUser) {
  const tokens = new Set();
  const raw = String(toUser).trim();
  const lower = raw.toLowerCase();
  const trLower = raw.toLocaleLowerCase('tr-TR');
  const ascii = trLower
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g');

  const candidates = Array.from(new Set([raw, lower, trLower, ascii])).filter(Boolean);
  if (candidates.length === 0) return [];

  // 1. Doğrudan doküman ID'si kullanıcı adı olan kayıtlar
  for (const id of candidates) {
    const docSnap = await db.collection('fcm_tokens').doc(id).get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data?.token) tokens.add(data.token);
      if (Array.isArray(data?.tokens)) {
        data.tokens.forEach((t) => t && tokens.add(t));
      }
    }
  }

  // 2. Rastgele doküman ID'si ile oluşturulup içinde 'user' alanı bulunan kayıtlar
  try {
    const qUserSnap = await db.collection('fcm_tokens').where('user', 'in', candidates).get();
    qUserSnap.forEach((d) => {
      const data = d.data();
      if (data?.token) tokens.add(data.token);
      if (Array.isArray(data?.tokens)) {
        data.tokens.forEach((t) => t && tokens.add(t));
      }
    });
  } catch (e) {
    console.warn('user alanı sorgusu hatası:', e.message);
  }

  // 3. Alan adı 'userName' olarak kaydedilmiş kayıtlar
  try {
    const qUserNameSnap = await db.collection('fcm_tokens').where('userName', 'in', candidates).get();
    qUserNameSnap.forEach((d) => {
      const data = d.data();
      if (data?.token) tokens.add(data.token);
      if (Array.isArray(data?.tokens)) {
        data.tokens.forEach((t) => t && tokens.add(t));
      }
    });
  } catch (e) {
    // Alan yoksa sessizce geç
  }

  return Array.from(tokens);
}

// Atomik Durum Geçişi: pending/failed -> sending
async function markAsSending(docRef, nowTime) {
  try {
    return await db.runTransaction(async (transaction) => {
      const freshDoc = await transaction.get(docRef);
      if (!freshDoc.exists) return null;

      const data = freshDoc.data();
      const status = data.pushStatus || 'pending';

      if (data.read === true || status === 'sent') {
        return null;
      }

      if (status === 'sending' && data.sendingStartedAt && (nowTime - data.sendingStartedAt < 60000)) {
        return null;
      }

      transaction.update(docRef, {
        pushStatus: 'sending',
        sendingStartedAt: nowTime
      });

      return data;
    });
  } catch (err) {
    return null;
  }
}

export default async (req, context) => {
  try {
    const now = new Date();
    const nowTime = now.getTime();
    const appUrl = getAppUrl();

    const snapshot = await db
      .collection('notifications')
      .where('read', '==', false)
      .get();

    if (snapshot.empty) {
      return new Response(
        JSON.stringify({ success: true, message: 'Gönderilecek bildirim yok.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let sentCount = 0;

    for (const docSnap of snapshot.docs) {
      const initialData = docSnap.data();

      if (initialData.pushStatus === 'sent') continue;

      const triggerTime = initialData?.triggerAt ? new Date(initialData.triggerAt).getTime() : 0;
      if (triggerTime > nowTime + 60000) continue;

      const data = await markAsSending(docSnap.ref, nowTime);
      if (!data) continue;

      const toUser = data.toUser;
      if (!toUser) {
        await docSnap.ref.update({ pushStatus: 'failed', lastError: 'Alıcı (toUser) belirtilmemiş' });
        continue;
      }

      const userTokens = await getUserTokens(toUser);

      if (userTokens.length === 0) {
        await docSnap.ref.update({
          pushStatus: 'failed',
          lastError: 'Kullanıcıya ait FCM token bulunamadı'
        });
        continue;
      }

      const title = data.title || 'TÜRKÖK Bildirim';
      const body = data.message || 'Yeni bir göreviniz var.';
      const notifId = String(docSnap.id);
      const donorId = String(data.donorId || '');

      let isAcceptedByFCM = false;
      let lastErrorMsg = '';

      for (const fcmToken of userTokens) {
        const message = {
          token: fcmToken,
          notification: {
            title,
            body
          },
          data: {
            donorId,
            notifId
          },
          webpush: {
            headers: {
              Urgency: 'high',
              TTL: '86400'
            },
            notification: {
              icon: `${appUrl}favicon.ico`,
              badge: `${appUrl}favicon.ico`,
              tag: notifId
            },
            fcmOptions: {
              link: appUrl
            }
          }
        };

        try {
          await messaging.send(message);
          isAcceptedByFCM = true;
          sentCount++;
        } catch (err) {
          lastErrorMsg = err.code || err.message || 'FCM Gönderim Hatası';
          console.error(`FCM Hatası (${toUser}):`, lastErrorMsg);
        }
      }

      if (isAcceptedByFCM) {
        await docSnap.ref.update({
          pushStatus: 'sent',
          sentAt: now.toISOString(),
          lastError: null
        });
      } else {
        await docSnap.ref.update({
          pushStatus: 'failed',
          retryCount: (data.retryCount || 0) + 1,
          lastError: lastErrorMsg
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, appUrl }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Fonksiyon Çalışma Hatası:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};