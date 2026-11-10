import { schedule } from '@netlify/functions';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Firebase Admin SDK'yı sadece bir kez başlat
if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'kizilay-c3c96';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Netlify ortam değişkenindeki \n kaçış karakterlerini gerçek satır sonlarına çevir
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    console.warn('[Push Cron] Firebase Admin kimlik değişkenleri eksik!');
  }
}

const getDb = () => (getApps().length ? getFirestore() : null);
const getMsg = () => (getApps().length ? getMessaging() : null);

const handler = async () => {
  const db = getDb();
  const messaging = getMsg();

  if (!db || !messaging) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Firebase Admin başlatılamadı, ortam değişkenlerini kontrol edin.' }),
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const snapshot = await db.collection('notifications')
      .where('read', '==', false)
      .get();

    let sentCount = 0;

    for (const docSnapshot of snapshot.docs) {
      const notif = docSnapshot.data();

      // Zaten gönderildiyse atla
      if (notif.sent === true) continue;

      // triggerAt kontrolü
      const triggerTime = notif.triggerAt ? new Date(notif.triggerAt).getTime() : 0;
      if (triggerTime <= now.getTime()) {
        const toUserKey = (notif.toUser || '').toLowerCase().trim();

        // fcm_tokens koleksiyonundan cihaz jetonunu al
        const tokenDoc = await db.collection('fcm_tokens').doc(toUserKey).get();

        if (tokenDoc.exists && tokenDoc.data().token) {
          const deviceToken = tokenDoc.data().token;

          try {
            await messaging.send({
              token: deviceToken,
              notification: {
                title: notif.title || 'TÜRKÖK Görev Bildirimi',
                body: notif.message || 'Planlanmış bir göreviniz bulunmaktadır.',
              },
              data: {
                donorId: notif.donorId || '',
                url: '/',
              },
              webpush: {
                headers: {
                  Urgency: 'high',
                },
                notification: {
                  icon: '/favicon.ico',
                  badge: '/favicon.ico',
                  requireInteraction: true,
                },
              },
            });

            // Bildirimi iletildi olarak işaretle
            await docSnapshot.ref.update({
              sent: true,
              sentAt: nowIso,
            });

            sentCount++;
          } catch (sendErr) {
            console.error(`[Push Cron] ${toUserKey} cihazına gönderim başarısız:`, sendErr);
          }
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Kontrol tamamlandı.',
        sentCount,
        timestamp: nowIso,
      }),
    };
  } catch (error) {
    console.error('[Push Cron] Genel hata:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

export default schedule('*/10 * * * *', handler);