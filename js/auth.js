// ══════════════════════════════════════════════════════════
// AUTHENTICATION (Firebase)
// ══════════════════════════════════════════════════════════
let currentUser = null; // { uid, email, role, country, displayName }

function initAuth() {
  auth.onAuthStateChanged(async (firebaseUser) => {
    if (firebaseUser) {
      // User is signed in — load their profile from Firestore
      try {
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        if (userDoc.exists) {
          const data = userDoc.data();
          currentUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            role: data.role || 'quo_user',
            country: data.country || '',
            displayName: data.displayName || firebaseUser.email
          };
          document.getElementById('login-screen').classList.add('hidden');
          document.getElementById('app-wrap').classList.add('visible');
          await loadAppData();
          applyRoleUI();
        } else {
          // User exists in Auth but not in Firestore — shouldn't happen normally
          console.error('User document not found in Firestore for:', firebaseUser.uid);
          showLoginError('Account not configured. Contact administrator.');
          auth.signOut();
        }
      } catch (err) {
        console.error('Error loading user data:', err);
        showLoginError('Error loading account data.');
        auth.signOut();
      }
    } else {
      // User is signed out
      currentUser = null;
      document.getElementById('app-wrap').classList.remove('visible');
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
      document.getElementById('login-err').textContent = '';
    }
  });
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pwd = document.getElementById('login-password').value;
  if (!email || !pwd) { showLoginError('Please enter email and password.'); return; }

  const btn = document.querySelector('.login-box .btn-primary');
  const origText = btn.textContent;
  btn.textContent = 'Signing in...';
  btn.disabled = true;

  try {
    await auth.signInWithEmailAndPassword(email, pwd);
    // onAuthStateChanged will handle the rest
  } catch (err) {
    console.error('Login error:', err);
    let msg = 'Invalid email or password.';
    if (err.code === 'auth/user-not-found') msg = 'No account found with this email.';
    else if (err.code === 'auth/wrong-password') msg = 'Incorrect password.';
    else if (err.code === 'auth/invalid-email') msg = 'Invalid email format.';
    else if (err.code === 'auth/too-many-requests') msg = 'Too many attempts. Try again later.';
    showLoginError(msg);
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

function doLogout() {
  auth.signOut();
  resetAll();
}

function showLoginError(msg) {
  document.getElementById('login-err').textContent = msg;
}

function applyRoleUI() {
  if (!currentUser) return;
  const role = currentUser.role;
  const country = currentUser.country;
  // User info bar
  const info = document.getElementById('topbar-user-info');
  const roleLabel = role === 'admin' ? 'Admin' : role === 'supervisor' ? 'Site Supervisor' : 'Quo User';
  info.innerHTML = `<span>${currentUser.email}</span> | ${roleLabel}${country ? ' | ' + country : ''}`;
  // Settings button: admin and supervisor only
  const sBtn = document.getElementById('settings-btn');
  sBtn.style.display = (role === 'admin' || role === 'supervisor') ? '' : 'none';
  // Admin tab: admin only
  const aBtn = document.getElementById('tab-admin-btn');
  if (aBtn) aBtn.style.display = role === 'admin' ? '' : 'none';
  // Country dropdown: lock to assigned country for non-admin
  refreshCountryDropdowns();
}

// ══════════════════════════════════════════════════════════
// ADMIN: CREATE USER (Firebase Auth + Firestore)
// ══════════════════════════════════════════════════════════
async function createFirebaseUser(email, password, role, country, displayName) {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Only administrators can create users.');
    return null;
  }
  try {
    const secondaryAuth = getSecondaryAuth();
    const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
    const newUid = cred.user.uid;
    // Write user doc to Firestore
    await db.collection('users').doc(newUid).set({
      email: email.toLowerCase(),
      role: role,
      country: country,
      displayName: displayName || email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.uid
    });
    // Sign out from secondary app
    await secondaryAuth.signOut();
    return newUid;
  } catch (err) {
    console.error('Error creating user:', err);
    if (err.code === 'auth/email-already-in-use') alert('This email is already registered.');
    else if (err.code === 'auth/weak-password') alert('Password must be at least 6 characters.');
    else alert('Error creating user: ' + err.message);
    return null;
  }
}

async function updateFirebaseUser(uid, data) {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    await db.collection('users').doc(uid).update(data);
  } catch (err) {
    console.error('Error updating user:', err);
    alert('Error updating user: ' + err.message);
  }
}

async function deleteFirebaseUser(uid) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (uid === currentUser.uid) { alert('Cannot delete your own account.'); return; }
  try {
    await db.collection('users').doc(uid).delete();
    // Note: This only deletes the Firestore doc. The Firebase Auth account
    // still exists but can't log in (no Firestore doc = rejected by onAuthStateChanged).
    // Full deletion requires Cloud Functions or Admin SDK.
  } catch (err) {
    console.error('Error deleting user:', err);
    alert('Error deleting user: ' + err.message);
  }
}
