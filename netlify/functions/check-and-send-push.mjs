import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

const APP_URL = (process.env.APP_URL || 'https://donortakip.netlify.app').replace(/\/+$/, '') + '/';
const MAX_RETRY_COUNT = 5;

// Kullanıcıya ait benzersiz token'ları ve bulundukları doküman referanslarını topla
async function getUserTokens(toUser) {
  const tokenMap = new Map(); // token -> Set<DocumentReference>
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
  if (candidates.length === 0) return { tokens: [], tokenDocMap: tokenMap };

  const addTokenFromDoc = (docSnap) => {
    const data = docSnap.data();
    if (!data) return;

    const registerToken = (t) => {
      if (!t || typeof t !== 'string') return;
      const cleanToken = t.trim();
      if (!cleanToken) return;
      if (!tokenMap.has(cleanToken)) {
        tokenMap.set(cleanToken, new Set());
      }
      tokenMap.get(cleanToken).add(docSnap.ref);
    };

    if (data.token) registerToken(data.token);
    if (Array.isArray(data.tokens)) {
      data.tokens.forEach(registerToken);
    }
  };

  // 1. Doğrudan doküman ID'si üzerinden kontrol
  for (const id of candidates) {
    const docSnap = await db.collection('fcm_tokens').doc(id).get();
    if (docSnap.exists) {
      addTokenFromDoc(docSnap);
    }
  }

  // 2. Alan bazlı sorgular (user, userName, uid)
  for (const field of ['user', 'userName', 'uid']) {
    try {
      const qSnap = await db.collection('fcm_tokens').where(field, 'in', candidates).get();
      qSnap.forEach((d) => addTokenFromDoc(d));
    } catch (e) {
      // Alan yoksa sessizce geç
    }
  }

  return {
    tokens: Array.from(tokenMap.keys()),
    tokenDocMap: tokenMap
  };
}

// Artık geçersiz olan (silinmiş/süresi dolmuş) FCM token'larını veritabanından otomatik temizle
async function cleanupInvalidToken(deadToken, docRefs) {
  if (!docRefs) return;
  for (const ref of docRefs) {
    try {
      const snap = await ref.get();
      if (!snap.exists) continue;
      const data = snap.data();

      const updates = {};
      if (data?.token === deadToken) {
        updates.token = FieldValue.delete();
      }
      if (Array.isArray(data?.tokens) && data.tokens.includes(deadToken)) {
        updates.tokens = FieldValue.arrayRemove(deadToken);
      }

      if (Object.keys(updates).length > 0) {
        await ref.update(updates);
        console.log(`Geçersiz token temizlendi (${ref.id}): ${deadToken.substring(0, 12)}...`);
      }
    } catch (e) {
      console.warn(`Geçersiz token silinemedi (${ref.id}):`, e.message);
    }
  }
}

async function markAsSending(docRef, nowTime) {
  try {
    return await db.runTransaction(async (transaction) => {
      const freshDoc = await transaction.get(docRef);
      if (!freshDoc.exists) return null;

      const data = freshDoc.data();
      const status = data.pushStatus || 'pending';
      const retries = data.retryCount || 0;

      if (data.read === true || status === 'sent' || retries >= MAX_RETRY_COUNT) {
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
      if ((initialData.retryCount || 0) >= MAX_RETRY_COUNT) continue;

      const triggerTime = initialData?.triggerAt ? new Date(initialData.triggerAt).getTime() : 0;
      if (triggerTime > nowTime + 60000) continue;

      const data = await markAsSending(docSnap.ref, nowTime);
      if (!data) continue;

      const toUser = data.toUser;
      if (!toUser) {
        await docSnap.ref.update({ pushStatus: 'failed', lastError: 'Alıcı (toUser) belirtilmemiş' });
        continue;
      }

      const { tokens: userTokens, tokenDocMap } = await getUserTokens(toUser);

      if (userTokens.length === 0) {
        await docSnap.ref.update({
          pushStatus: 'failed',
          retryCount: (data.retryCount || 0) + 1,
          lastError: `Kullanıcıya (${toUser}) ait aktif FCM token bulunamadı`
        });
        continue;
      }

      const title = data.title || 'TÜRKÖK Bildirim';
      const body = data.message || 'Yeni bir göreviniz var.';
      const notifId = String(docSnap.id);
      const donorId = String(data.donorId || '');

      let successCountForThisNotif = 0;
      const errorList = [];

      for (const fcmToken of userTokens) {
        const message = {
          token: fcmToken,
          notification: {
            title,
            body
          },
          data: {
            donorId,
            notifId,
            url: APP_URL
          },
          android: {
            priority: 'high',
            ttl: 86400000
          },
          webpush: {
            headers: {
              Urgency: 'high',
              TTL: '86400'
            },
            notification: {
              icon: `${APP_URL}favicon.ico`,
              badge: `${APP_URL}favicon.ico`,
              tag: notifId,
              renotify: true,
              requireInteraction: true,
              vibrate: [200, 100, 200]
            },
            fcmOptions: {
              link: APP_URL
            }
          }
        };

        try {
          await messaging.send(message);
          successCountForThisNotif++;
          sentCount++;
        } catch (err) {
          const errCode = err.code || err.message || 'FCM Gönderim Hatası';
          const shortToken = fcmToken.substring(0, 12) + '...';
          errorList.push(`${shortToken}: ${errCode}`);
          console.error(`FCM Hatası (${toUser} - ${shortToken}):`, errCode);

          // Eğer token geçersizse veya cihazdan silindiyse otomatik olarak veritabanından temizle
          if (
            errCode.includes('registration-token-not-registered') ||
            errCode.includes('invalid-registration-token') ||
            errCode.includes('invalid-argument')
          ) {
            await cleanupInvalidToken(fcmToken, tokenDocMap.get(fcmToken));
          }
        }
      }

      if (successCountForThisNotif > 0) {
        await docSnap.ref.update({
          pushStatus: 'sent',
          sentAt: now.toISOString(),
          totalTokensFound: userTokens.length,
          deliveredTokensCount: successCountForThisNotif,
          partialErrors: errorList.length > 0 ? errorList : null,
          lastError: null
        });
      } else {
        await docSnap.ref.update({
          pushStatus: 'failed',
          totalTokensFound: userTokens.length,
          retryCount: (data.retryCount || 0) + 1,
          lastError: errorList.join(' | ')
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, appUrl: APP_URL }),
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