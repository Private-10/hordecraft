import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2jB7svTRPRg2b61fePnObAitYFCgixOc",
  authDomain: "hordecraft-a2fc1.firebaseapp.com",
  projectId: "hordecraft-a2fc1",
  storageBucket: "hordecraft-a2fc1.firebasestorage.app",
  messagingSenderId: "988839877470",
  appId: "1:988839877470:web:6576eed388a3b75d698dcf",
  measurementId: "G-B4YWM7NSXB",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
