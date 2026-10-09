export const firebaseConfig = {
  apiKey: "AIzaSyBYZRe-2JvS4XMQKMiJ6tVzQ90rfuEvnJg",
  authDomain: "lophocttt.firebaseapp.com",
  projectId: "lophocttt",
  storageBucket: "lophocttt.firebasestorage.app",
  messagingSenderId: "225310875137",
  appId: "1:225310875137:web:7888545135eddfeb962a00",
  measurementId: "G-BWRB3FC50Z"
};

export const cloudinaryConfig = {
  cloudName: "psd88zil",
  uploadPreset: "student_upload",
  defaultFolder: "lophocttt"
};

export const dataManagerConfig = Object.freeze({
  cloudinaryLocalEndpoint: "http://127.0.0.1:8787/api"
});

export const appConfig = Object.freeze({
  version: "26",
  tuitionAmount: 1000000
});

// Firebase Console → Project settings → Cloud Messaging → Web Push certificates
// Chỉ dán khóa CÔNG KHAI của chính dự án lophocttt.
export const webPushVapidKey = "BJcW9tw00otj_jtXd-ecWuIQmIlKvCekxMQbIQFRW8IRzkhXAhvP2mKR8BTN0GXsG-1Kbp_5qcH9jNQ6t2-EFLM";
