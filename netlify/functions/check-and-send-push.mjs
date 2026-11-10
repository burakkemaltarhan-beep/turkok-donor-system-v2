import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Firebase Admin SDK'yı Netlify ortam değişkenleriyle başlat
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

export default async (req, context) => {
  try {
    const now = new Date();
    const nowTime = now.getTime();

    // 1. Okunmamış ve vakti gelmiş bildirimleri çek
    const snapshot = await db.collection('notifications')
      .where('read', '==', false)
      .get();

    if (snapshot.empty) {
      return new Response(JSON.stringify({ success: true, message: 'Gönderilecek bildirim yok.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let sentCount = 0;

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const triggerTime = data?.triggerAt ? new Date(data.triggerAt).getTime() : 0;

      // Vakti geldiyse veya geçmişse bildirimi işle
      if (triggerTime <= nowTime + 60000) {
        const toUser = data.toUser;
        if (!toUser) continue;

        // Kullanıcının FCM token'ını al
        const tokenDoc = await db.collection('fcm_tokens').doc(toUser.toLowerCase()).get();
        
        if (tokenDoc.exists) {
          const tokenData = tokenDoc.data();
          const fcmToken = tokenData?.token;

          if (fcmToken) {
            const message = {
              token: fcmToken,
              notification: {
                title: data.title || 'TÜRKÖK Bildirim',
                body: data.message || 'Yeni bir göreviniz var.'
              },
              data: {
                donorId: data.donorId || ''
              }
            };

            try {
              await messaging.send(message);
              sentCount++;
            } catch (err) {
              console.error(`FCM Gönderim Hatası (${toUser}):`, err);
            }
          }
        }

        // Bildirimi okundu olarak işaretle (tekrar gitmemesi için)
        await docSnap.ref.update({ read: true });
      }
    }

    return new Response(JSON.stringify({ success: true, sent: sentCount }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Fonksiyon Çalışma Hatası:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};