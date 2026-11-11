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

const APP_URL = 'https://donortakip.netlify.app/';

// Kullanıcıya ait benzersiz token'ları topla
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

  for (const field of ['user', 'userName', 'uid']) {
    try {
      const qSnap = await db.collection('fcm_tokens').where(field, 'in', candidates).get();
      qSnap.forEach((d) => {
        const data = d.data();
        if (data?.token) tokens.add(data.token);
        if (Array.isArray(data?.tokens)) {
          data.tokens.forEach((t) => t && tokens.add(t));
        }
      });
    } catch (e) {
      // Alan yoksa geç
    }
  }

  return Array.from(tokens);
}

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
          lastError: `Kullanıcıya (${toUser}) ait FCM token bulunamadı`
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
          // Ekran kapalıyken Android ve iOS'un uyanması için kök notification ZORUNLUDUR:
          notification: {
            title,
            body
          },
          data: {
            donorId,
            notifId,
            url: APP_URL
          },
          // Android Doze Mode (Ekran kapalı derin uyku) kilidini açar:
          android: {
            priority: 'high',
            ttl: 86400000
          },
          // WebPush Yüksek Öncelik ve Tekilleştirme (title/body burada tekrar EDİLMEZ):
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
              requireInteraction: true
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