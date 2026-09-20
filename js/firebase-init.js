// Firebase Initialization
// This file assumes firebase-app-compat.js and firebase-firestore-compat.js are loaded
const firebaseConfig = {
    apiKey: "AIzaSyClk1Z8cUSWqSII_KWVyDo3oExgbg4hUDo",
    authDomain: "maulasweb.firebaseapp.com",
    projectId: "maulasweb",
    storageBucket: "maulasweb.firebasestorage.app",
    messagingSenderId: "731951291672",
    appId: "1:731951291672:web:ac053aac5aecc8774dd26d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Enable offline persistence for Firestore (IndexedDB cache)
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    if (err.code === 'failed-precondition') {
        console.warn('Firestore offline persistence: multiple tabs open');
    } else if (err.code === 'unimplemented') {
        console.warn('Firestore offline persistence not supported by browser');
    } else {
        console.warn('Firestore offline persistence notice:', err);
    }
});

window.db = db; // Expose globally
