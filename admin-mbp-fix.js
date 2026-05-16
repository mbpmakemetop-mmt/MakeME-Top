/* ═══════════════════════════════════════════════════════════════
   ADMIN PANEL - MBP CREATION FIX
   ═══════════════════════════════════════════════════════════════
   
   BUG FIXED: MBP not visible in owner's dashboard
   
   ROOT CAUSE:
   - When creating MBP with owner email, if user hasn't registered yet,
     user_id stays as 'admin_created'
   - When user later signs up, their Firebase Auth UID won't match
   
   SOLUTION:
   - Store both user_email AND user_id
   - On user login, automatically sync businesses (see auth-fix.js)
   - Fallback search by email if user_id doesn't match
   
   ═══════════════════════════════════════════════════════════════ */

/**
 * FIXED VERSION: Submit Free MBP Listing
 * This replaces the submitFreeMBP function in admin.html
 */
async function submitFreeMBP(btn) {
  const g = id => document.getElementById(id)?.value.trim() || '';
  
  // Get form values
  const name = g('fmbp-name');
  const type = g('fmbp-type');
  const desc = g('fmbp-desc');
  const addr = g('fmbp-addr');
  const phone = g('fmbp-phone');
  const wa = g('fmbp-wa');
  const web = g('fmbp-web');
  const email = g('fmbp-email');
  const days = parseInt(document.getElementById('fmbp-duration')?.value) || 365;
  const statusEl = document.getElementById('fmbp-status');

  // Validate required fields
  if (!name) { showToast('⚠️ Business name required'); return; }
  if (!type) { showToast('⚠️ Select a type'); return; }
  if (!desc) { showToast('⚠️ Description required'); return; }
  if (!addr) { showToast('⚠️ Address required'); return; }
  if (!phone) { showToast('⚠️ Phone required'); return; }

  // Apply security: sanitize inputs
  const sanitizedData = {
    name: window.security.sanitizeText(name, 150),
    type: window.security.sanitizeText(type, 60),
    desc: window.security.sanitizeText(desc, 2000),
    addr: window.security.sanitizeText(addr, 300),
    phone: window.security.sanitizePhone(phone),
    wa: window.security.sanitizePhone(wa),
    web: web ? window.security.sanitizeURL(web) : '',
    email: email ? window.security.sanitizeEmail(email) : ''
  };

  btn.disabled = true;
  btn.textContent = 'Creating...';
  statusEl.style.color = '#6B7280';
  statusEl.textContent = '';

  try {
    const bizId = 'biz_admin_' + Date.now();

    // ── Upload logo ──
    let logoUrl = g('fmbp-logo-url');
    const logoFile = document.getElementById('fmbp-logo-file')?.files[0];
    if (logoFile) {
      // Validate file
      window.security.validateImageFile(logoFile);
      
      statusEl.textContent = 'Uploading logo…';
      try {
        logoUrl = await uploadFmbpImage(logoFile, 'businesses/' + bizId + '/logo');
      } catch (e) {
        showToast('⚠️ Logo upload failed: ' + e.message);
      }
    }
    if (!logoUrl) logoUrl = 'https://makemetop.in/icon-192.png';

    // ── Upload cover ──
    let coverUrl = g('fmbp-cover-url');
    const coverFile = document.getElementById('fmbp-cover-file')?.files[0];
    if (coverFile) {
      // Validate file
      window.security.validateImageFile(coverFile);
      
      statusEl.textContent = 'Uploading cover…';
      try {
        coverUrl = await uploadFmbpImage(coverFile, 'businesses/' + bizId + '/cover');
      } catch (e) {
        showToast('⚠️ Cover upload failed: ' + e.message);
      }
    }
    if (!coverUrl) coverUrl = 'https://makemetop.in/icon-512.png';

    statusEl.textContent = 'Creating listing…';

    // ═══════════════════════════════════════════════════════════
    // CRITICAL FIX: Improved owner lookup and linking
    // ═══════════════════════════════════════════════════════════
    let ownerUid = null;
    let ownerExists = false;
    
    if (sanitizedData.email) {
      try {
        // Try to find existing user by email
        const usersSnapshot = await window._db.collection('users')
          .where('email', '==', sanitizedData.email)
          .limit(1)
          .get();
        
        if (!usersSnapshot.empty) {
          ownerUid = usersSnapshot.docs[0].id;
          ownerExists = true;
          console.log('✓ Found existing user:', ownerUid);
        } else {
          // User doesn't exist yet - will be synced when they sign up
          console.log('⚠ User not registered yet, will sync on first login');
        }
      } catch (e) {
        console.error('Error checking user:', e);
      }
    }
    
    // ═══════════════════════════════════════════════════════════
    // CRITICAL: Store BOTH user_id and user_email
    // This allows syncing when user signs up later
    // ═══════════════════════════════════════════════════════════
    const expiry = new Date(Date.now() + days * 86400000).toISOString();

    const businessData = {
      name: sanitizedData.name,
      type: sanitizedData.type,
      description: sanitizedData.desc,
      address: sanitizedData.addr,
      phone: sanitizedData.phone,
      whatsapp: sanitizedData.wa,
      website: sanitizedData.web,
      logo_url: logoUrl,
      cover_url: coverUrl,
      gallery_urls: [],
      services: [],
      status: 'approved',
      is_premium: true,
      premium_expiry: expiry,
      premium_plan: 'admin_free',
      image_limit: 5,
      rating: 0,
      review_count: 0,
      
      // CRITICAL FIX: Store both user_id and user_email
      user_id: ownerUid || 'pending_sync', // Will be updated on user signup
      user_email: sanitizedData.email || '', // Always store email for syncing
      owner_registered: ownerExists, // Flag to track if owner has account
      
      created_by: 'admin',
      created_at: firebase.firestore.FieldValue.serverTimestamp(),
      approved_at: new Date().toISOString(),
      
      // Security: Add metadata
      created_by_admin: true,
      requires_owner_verification: !ownerExists
    };

    const docRef = await window._db.collection('businesses').add(businessData);
    
    console.log('✓ Business created:', docRef.id);

    // Send notification email if owner email given
    if (sanitizedData.email) {
      try {
        await callAppsScript({
          action: 'sendBusinessApproved',
          to: sanitizedData.email,
          name: sanitizedData.email.split('@')[0],
          businessName: sanitizedData.name,
          bizId: docRef.id,
          isNewOwner: !ownerExists
        });
        console.log('✓ Notification email sent');
      } catch (e) {
        console.error('Email send failed:', e);
      }
    }
    
    // If owner exists, create a notification in their account
    if (ownerExists && ownerUid) {
      try {
        await window._db.collection('notifications').add({
          user_id: ownerUid,
          type: 'business_created',
          business_id: docRef.id,
          business_name: sanitizedData.name,
          message: `Your business "${sanitizedData.name}" has been created by admin`,
          read: false,
          created_at: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('✓ In-app notification created');
      } catch (e) {
        console.error('Notification creation failed:', e);
      }
    }

    statusEl.style.color = '#16A34A';
    statusEl.textContent = ownerExists 
      ? `✓ Created! Owner will see it immediately.`
      : `✓ Created! Owner will see it when they sign up with ${sanitizedData.email}`;
    
    showToast('✅ ' + sanitizedData.name + ' is live!');
    loadBadgeCounts();

    setTimeout(() => {
      closeModal('modal-free-mbp');
      showSection('approved', document.querySelector('[data-section="approved"]'));
      
      // Reset form
      document.getElementById('fmbp-form')?.reset();
    }, 2000);

  } catch (e) {
    console.error('MBP creation error:', e);
    statusEl.style.color = '#DC2626';
    statusEl.textContent = 'Error: ' + e.message;
    showToast('❌ ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Create Free MBP Listing';
  }
}

/**
 * Helper function to check and display pending sync businesses
 */
async function checkPendingSyncBusinesses() {
  try {
    const snapshot = await window._db.collection('businesses')
      .where('user_id', '==', 'pending_sync')
      .get();
    
    if (!snapshot.empty) {
      console.log(`⚠ ${snapshot.size} business(es) waiting for owner to sign up`);
      
      // Show in admin UI
      const pendingList = snapshot.docs.map(doc => {
        const data = doc.data();
        return `${data.name} (${data.user_email})`;
      });
      
      return pendingList;
    }
    
    return [];
  } catch (error) {
    console.error('Error checking pending businesses:', error);
    return [];
  }
}

// Export for use in admin panel
window.adminMBP = {
  submitFreeMBP,
  checkPendingSyncBusinesses
};

console.log('✓ Admin MBP fix loaded');
