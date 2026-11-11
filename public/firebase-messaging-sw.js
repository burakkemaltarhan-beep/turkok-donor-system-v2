// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBfuPw9oxAvZo6Sy7Sv96DmNw7E_L5EbGI",
  authDomain: "kizilay-c3c96.firebaseapp.com",
  projectId: "kizilay-c3c96",
  storageBucket: "kizilay-c3c96.firebasestorage.app",
  messagingSenderId: "1069570752312",
  appId: "1:1069570752312:web:97101fd71c8a4f0f244bcd"
});

const messaging = firebase.messaging();

// Arka planda gelen mesajı yakala (Sadece data-only geldiğinde çiz, notification varsa tarayıcıya bırak)
messaging.onBackgroundMessage((payload) => {
  // Eğer tarayıcı zaten otomatik bildirim gösterecekse (payload.notification varsa) 
  // çift bildirim olmaması için burada durdur:
  if (payload.notification) {
    return;
  }

  const title = payload.data?.title || 'TÜRKÖK Bildirim';
  const options = {
    body: payload.data?.body || 'Yeni bir göreviniz var.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.notifId || 'turkok-bildirim',
    renotify: true,
    requireInteraction: true,
    data: {
      url: payload.data?.url || '/',
      donorId: payload.data?.donorId || '',
      notifId: payload.data?.notifId || ''
    }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});