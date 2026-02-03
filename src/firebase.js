// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCjHHS6TbQ0rrwkfZjNskglAcU_T1lU0ow",
  authDomain: "weddingpaymentmanagement.firebaseapp.com",
  projectId: "weddingpaymentmanagement",
  storageBucket: "weddingpaymentmanagement.firebasestorage.app",
  messagingSenderId: "384869407960",
  appId: "1:384869407960:web:108acfbc7f9d3a65324bad",
  measurementId: "G-FDBQ0WWJMS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

export { db, analytics };

