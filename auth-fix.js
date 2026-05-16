/* ═══════════════════════════════════════════════════════════════
   AUTHENTICATION FIX - Prevents Auto-Logout Issues
   ═══════════════════════════════════════════════════════════════
   
   BUGS FIXED:
   1. Firebase auth persistence not set correctly
   2. Multiple auth listeners causing conflicts  
   3. Session token not being refreshed
   4. Page state not preserved on reload
   
   ═══════════════════════════════════════════════════════════════ */

// Global auth state - prevents multiple initializations
let AUTH_INITIALIZED = false;
let CURRENT_USER = null;
let AUTH_STATE_LISTENER = null;

/**
 * Initialize Firebase Authentication with proper persistence
 * Call this ONCE on app initialization
 */
async function initializeAuth() {
  if (AUTH_INITIALIZED) {
    console.log('Auth already initialized');
    return CURRENT_USER;
  }

  try {
    // CRITICAL FIX #1: Set persistence to LOCAL (survives browser restarts)
    await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    console.log('✓ Auth persistence set to LOCAL');
    
    // CRITICAL FIX #2: Single auth state listener
    if (AUTH_STATE_LISTENER) {
      AUTH_STATE_LISTENER(); // Unsubscribe previous listener
    }
    
    AUTH_STATE_LISTENER = firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        CURRENT_USER = user;
        console.log('✓ User authenticated:', user.email);
        
        // CRITICAL FIX #3: Refresh token proactively
        try {
          await user.getIdToken(true); // Force token refresh
          console.log('✓ Token refreshed');
        } catch (tokenErr) {
          console.error('Token refresh failed:', tokenErr);
        }
        
        // CRITICAL FIX #4: Sync user data on each login
        await syncUserBusinesses(user);
        
        // Save to localStorage as backup
        localStorage.setItem('lastAuthTime', Date.now().toString());
        localStorage.setItem('lastAuthEmail', user.email);
        
      } else {
        CURRENT_USER = null;
        console.log('User signed out');
        localStorage.removeItem('lastAuthTime');
        localStorage.removeItem('lastAuthEmail');
      }
      
      // Trigger UI updates
      onAuthStateUpdate(user);
    }, (error) => {
      console.error('Auth state error:', error);
      // Don't log out on errors - keep session alive
    });
    
    AUTH_INITIALIZED = true;
    
    // Return current user (might be null)
    return firebase.auth().currentUser;
    
  } catch (error) {
    console.error('Auth initialization failed:', error);
    throw error;
  }
}

/**
 * CRITICAL FIX #5: Sync businesses when owner email matches user email
 * This fixes the "MBP not visible in dashboard" bug
 */
async function syncUserBusinesses(user) {
  if (!user || !user.email) return;
  
  try {
    const db = firebase.firestore();
    
    // Find all businesses created with this email but wrong user_id
    const businessesQuery = await db.collection('businesses')
      .where('user_email', '==', user.email)
      .where('user_id', '!=', user.uid)
      .get();
    
    if (!businessesQuery.empty) {
      console.log(`Found ${businessesQuery.size} business(es) to sync`);
      
      const batch = db.batch();
      businessesQuery.docs.forEach(doc => {
        batch.update(doc.ref, {
          user_id: user.uid,
          synced_at: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      
      await batch.commit();
      console.log('✓ Businesses synced to user account');
    }
  } catch (error) {
    console.error('Business sync failed:', error);
    // Don't throw - let user continue even if sync fails
  }
}

/**
 * Safe sign-in with Google
 * Includes retry logic and error handling
 */
async function signInWithGoogle(maxRetries = 2) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await firebase.auth().signInWithPopup(provider);
      
      if (result.user) {
        console.log('✓ Google sign-in successful');
        
        // Store user info in Firestore
        await storeUserInfo(result.user);
        
        return result.user;
      }
    } catch (error) {
      console.error(`Sign-in attempt ${attempt} failed:`, error.code);
      
      // Handle specific errors
      if (error.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in cancelled');
      }
      
      if (error.code === 'auth/network-request-failed') {
        if (attempt < maxRetries) {
          console.log('Network error, retrying...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
}

/**
 * Store/update user information in Firestore
 */
async function storeUserInfo(user) {
  try {
    const db = firebase.firestore();
    const userRef = db.collection('users').doc(user.uid);
    
    const userData = {
      email: user.email,
      displayName: user.displayName || '',
      photoURL: user.photoURL || '',
      lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    // Use merge to preserve existing data
    await userRef.set(userData, { merge: true });
    
    console.log('✓ User info stored');
  } catch (error) {
    console.error('Failed to store user info:', error);
    // Don't throw - not critical
  }
}

/**
 * Safe sign-out
 */
async function signOutUser() {
  try {
    await firebase.auth().signOut();
    
    // Clear all local storage except essential config
    const keysToKeep = ['firebase-config', 'accepted-cookies'];
    const allKeys = Object.keys(localStorage);
    allKeys.forEach(key => {
      if (!keysToKeep.includes(key)) {
        localStorage.removeItem(key);
      }
    });
    
    console.log('✓ User signed out');
    return true;
  } catch (error) {
    console.error('Sign-out failed:', error);
    throw error;
  }
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  return !!CURRENT_USER;
}

/**
 * Get current user
 */
function getCurrentUser() {
  return CURRENT_USER || firebase.auth().currentUser;
}

/**
 * Require authentication - redirect to login if not authenticated
 */
async function requireAuth(redirectPage = 'login.html') {
  await initializeAuth();
  
  if (!isAuthenticated()) {
    // Save intended destination
    sessionStorage.setItem('redirectAfterLogin', window.location.pathname);
    window.location.href = redirectPage;
    return false;
  }
  
  return true;
}

/**
 * Handle auth state updates (override this in your app)
 */
function onAuthStateUpdate(user) {
  // This should be overridden by your app
  // Update UI, redirect, etc.
  console.log('Auth state updated:', user ? 'logged in' : 'logged out');
}

/**
 * Setup automatic token refresh
 * Prevents session expiration
 */
function setupTokenRefresh() {
  // Refresh token every 50 minutes (tokens expire after 1 hour)
  setInterval(async () => {
    const user = getCurrentUser();
    if (user) {
      try {
        await user.getIdToken(true);
        console.log('✓ Token auto-refreshed');
      } catch (error) {
        console.error('Token refresh failed:', error);
      }
    }
  }, 50 * 60 * 1000); // 50 minutes
}

/**
 * Initialize on page load
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializeAuth();
    setupTokenRefresh();
  } catch (error) {
    console.error('Auth initialization error:', error);
  }
});

// Export functions for use in other files
window.authManager = {
  initialize: initializeAuth,
  signInWithGoogle,
  signOut: signOutUser,
  isAuthenticated,
  getCurrentUser,
  requireAuth,
  syncUserBusinesses
};
