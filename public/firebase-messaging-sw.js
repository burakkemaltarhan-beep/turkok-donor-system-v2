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

// SDK arka plan bildirimini otomatik ve TEK SEFERDE gösterir.
// Çift bildirim olmaması için onBackgroundMessage KULLANILMAMALIDIR.
const messaging = firebase.messaging();

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || 'https://donortakip.netlify.app/';

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