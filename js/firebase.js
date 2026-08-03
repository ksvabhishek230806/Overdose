const firebaseConfig = {
  apiKey: 'AIzaSyDYG8mxcUBvTuIAL8-dcRgV49jNtoVv22E',
  authDomain: 'overdose-30375.firebaseapp.com',
  projectId: 'overdose-30375',
  storageBucket: 'overdose-30375.firebasestorage.app',
  messagingSenderId: '327093868957',
  appId: '1:327093868957:web:bd261869127c7f06fe3774'
};

let firebaseApp = null;
let firestoreDb = null;
let firestoreModule = null;

async function initFirebase(){
  if(firebaseApp && firestoreDb) return { app: firebaseApp, db: firestoreDb, firestore: firestoreModule };
  if(!firebaseConfig.apiKey || !firebaseConfig.projectId){
    throw new Error('Firebase configuration is empty. Add your project credentials in js/firebase.js.');
  }
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
  firestoreModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  firebaseApp = initializeApp(firebaseConfig);
  firestoreDb = firestoreModule.getFirestore(firebaseApp);
  return { app: firebaseApp, db: firestoreDb, firestore: firestoreModule };
}

async function saveOrder(order){
  if(!order || !order.customerName || !String(order.customerName).trim()){
    throw new Error('customerName is required to save an order.');
  }
  const { db, firestore } = await initFirebase();
  const ordersRef = firestore.collection(db, 'orders');
  const docRef = await firestore.addDoc(ordersRef, order);
  return docRef.id;
}

async function listenForOrders(onUpdate, onError){
  const { db, firestore } = await initFirebase();
  const ordersRef = firestore.collection(db, 'orders');
  return firestore.onSnapshot(
    ordersRef,
    snapshot => {
      const orders = snapshot.docs.map(docSnap => Object.assign({ docId: docSnap.id }, docSnap.data()));
      onUpdate(orders);
    },
    err => {
      // Fires for things like an invalid API key or blocked project - lets
      // callers fall back to a local-only mode instead of hanging silently.
      if(typeof onError === 'function') onError(err);
      else console.warn('Firestore listenForOrders error:', err.message);
    }
  );
}

async function updateOrderStatus(docId, status){
  const { db, firestore } = await initFirebase();
  const orderDoc = firestore.doc(db, 'orders', docId);
  await firestore.updateDoc(orderDoc, { status });
}

async function deleteOrder(docId){
  const { db, firestore } = await initFirebase();
  const orderDoc = firestore.doc(db, 'orders', docId);
  await firestore.deleteDoc(orderDoc);
}

/* ================= AUTH (staff pages only) ================= */
let authInstance = null;
let authModule = null;

async function initAuth(){
  const { app } = await initFirebase();
  if(authInstance) return { auth: authInstance, authModule };
  authModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  authInstance = authModule.getAuth(app);
  return { auth: authInstance, authModule };
}

async function signIn(email, password){
  const { auth, authModule } = await initAuth();
  const credential = await authModule.signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

async function signOut(){
  const { auth, authModule } = await initAuth();
  await authModule.signOut(auth);
}

/* onUser fires on every auth state change (including the initial unknown->resolved
   transition). onError fires if auth can't even initialize (offline, bad config) -
   callers use this to distinguish "checked, nobody's logged in" from "couldn't check". */
async function onAuthChange(onUser, onError){
  try{
    const { auth, authModule } = await initAuth();
    return authModule.onAuthStateChanged(auth, onUser, err => {
      if(typeof onError === 'function') onError(err);
      else console.warn('Firebase auth state error:', err.message);
    });
  }catch(err){
    if(typeof onError === 'function') onError(err);
    else console.warn('Firebase auth failed to initialize:', err.message);
  }
}

window.OverdoseFirebase = { saveOrder, listenForOrders, updateOrderStatus, deleteOrder, signIn, signOut, onAuthChange };
