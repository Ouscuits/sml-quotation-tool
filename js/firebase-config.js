// ══════════════════════════════════════════════════════════
// FIREBASE CONFIGURATION
// ══════════════════════════════════════════════════════════

const firebaseConfig = {
  apiKey: "AIzaSyDrZTlE3vwaewiyhGWD2Tec0sOt-MUyMdQ",
  authDomain: "quotation-tool-7989f.firebaseapp.com",
  projectId: "quotation-tool-7989f",
  storageBucket: "quotation-tool-7989f.firebasestorage.app",
  messagingSenderId: "779139506213",
  appId: "1:779139506213:web:06a53fbc72bab751a89fcc"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// References
const auth = firebase.auth();
const db = firebase.firestore();

// Secondary app for creating users without logging out admin
let secondaryApp = null;
function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, "secondary");
  }
  return secondaryApp.auth();
}
