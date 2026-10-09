/* Firebase displays notification payloads while the Home Screen app is closed. */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBYZRe-2JvS4XMQKMiJ6tVzQ90rfuEvnJg",
  authDomain: "lophocttt.firebaseapp.com",
  projectId: "lophocttt",
  storageBucket: "lophocttt.firebasestorage.app",
  messagingSenderId: "225310875137",
  appId: "1:225310875137:web:7888545135eddfeb962a00"
});
firebase.messaging();
