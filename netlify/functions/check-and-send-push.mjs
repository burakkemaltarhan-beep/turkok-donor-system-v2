import { schedule } from '@netlify/functions';
import admin from 'firebase-admin';

// Firebase Admin SDK'yı sadece bir kez başlat
if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID || 'kizilay-c3c96';
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Netlify ortam değişkenindeki \n karakterlerini gerçek satır sonuna çevir
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined;

  if (clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    console.warn('[Push Cron] Firebase Admin kimlik değişkenleri eksik!');
  }
}

const db = admin.apps.length ? admin.firestore() : null;
const messaging = admin.apps.length ? admin.messaging() : null;

const handler = async () => {
  if (!db || !messaging) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Firebase Admin başlatılamadı, ortam değişkenlerini kontrol edin.' }),
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    // 1. Okunmamış bildirimleri çek
    const snapshot = await db.collection('notifications')
      .where('read', '==', false)
      .get();

    let sentCount = 0;

    for (const docSnapshot of snapshot.docs) {
      const notif = docSnapshot.data();

      // Zaten gönderildiyse atla
      if (notif.sent === true) continue;

      // triggerAt kontrolü: Zamanı gelmiş mi?
      const triggerTime = notif.triggerAt ? new Date(notif.triggerAt).getTime() : 0;
      if (triggerTime <= now.getTime()) {
        const toUserKey = (notif.toUser || '').toLowerCase().trim();

        // 2. Personelin (Özkan, Yiğit, Batuhan, Behlül, Yunus, Burak) FCM cihaz jetonunu al
        const tokenDoc = await db.collection('fcm_tokens').doc(toUserKey).get();

        if (tokenDoc.exists && tokenDoc.data().token) {
          const deviceToken = tokenDoc.data().token;

          try {
            // 3. Kilit ekranı push bildirimini fırlat
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

            // 4. Tekrar gitmemesi için bildirimi işaretle
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

// Cron: "*/10 * * * *" -> Her 10 dakikada bir otomatik çalışır
export default schedule('*/10 * * * *', handler);