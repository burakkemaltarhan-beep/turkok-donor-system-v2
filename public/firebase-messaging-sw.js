importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBfuPw9oxAvZo6Sy7Sv96DmNw7E_L5EbGI",
  authDomain: "kizilay-c3c96.firebaseapp.com",
  projectId: "kizilay-c3c96",
  storageBucket: "kizilay-c3c96.appspot.com",
  messagingSenderId: "1069570752312",
  appId: "1:1069570752312:web:97101fd71c8a4f0f244bcd"
});

const messaging = firebase.messaging();

// Telefon kilitliyken veya sekme kapalıyken gelen bildirim
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'TÜRKÖK Görev Bildirimi';
  const options = {
    body: payload.notification?.body || payload.data?.message || 'Yeni bir görev bildiriminiz var.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.data?.donorId || 'turkok-task',
    renotify: true,
    data: {
      donorId: payload.data?.donorId || ''
    }
  };

  self.registration.showNotification(title, options);
});

// Kilit ekranındaki bildirime tıklandığında uygulamayı öne getir
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});