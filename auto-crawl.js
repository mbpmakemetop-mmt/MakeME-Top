/* ═══════════════════════════════════════════════════════════════
   AUTO-CRAWL & INDEXING SYSTEM
   Automatically submits new businesses to Google for indexing
   ═══════════════════════════════════════════════════════════════ */

/**
 * TRIGGER THIS WHEN:
 * - Business is approved by admin
 * - Business is created with payment
 * - Business details are updated
 */

// ══════════════════════════════════════════════════════════════
// 1. AUTO-SUBMIT TO GOOGLE (Immediate Indexing)
// ══════════════════════════════════════════════════════════════

async function autoSubmitToGoogle(businessId, businessName) {
  try {
    const url = `https://makemetop.in/biz.html?id=${businessId}`;
    
    console.log(`🔄 Auto-submitting: ${businessName}`);
    
    // Method 1: Ping Google sitemap
    await fetch(`https://www.google.com/ping?sitemap=${encodeURIComponent('https://makemetop.in/sitemap.xml')}`);
    
    // Method 2: IndexNow API (Bing & Yandex)
    await submitToIndexNow(url);
    
    // Method 3: Trigger sitemap regeneration
    await triggerSitemapUpdate();
    
    console.log(`✅ Submitted ${businessName} to Google`);
    
    // Save submission record
    await saveIndexingRecord(businessId, url);
    
  } catch (error) {
    console.error('Auto-submit error:', error);
  }
}

// ══════════════════════════════════════════════════════════════
// 2. IndexNow API (Bing, Yandex, Seznam)
// ══════════════════════════════════════════════════════════════

async function submitToIndexNow(url) {
  try {
    const indexNowKey = '1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c'; // Generate at indexnow.org
    
    const payload = {
      host: 'makemetop.in',
      key: indexNowKey,
      keyLocation: `https://makemetop.in/${indexNowKey}.txt`,
      urlList: [url]
    };
    
    // Submit to Bing/Yandex via IndexNow
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    console.log('✅ IndexNow submitted');
    
  } catch (error) {
    console.error('IndexNow error:', error);
  }
}

// ══════════════════════════════════════════════════════════════
// 3. TRIGGER SITEMAP UPDATE VIA APPS SCRIPT
// ══════════════════════════════════════════════════════════════

async function triggerSitemapUpdate() {
  try {
    // Call your Google Apps Script webhook
    const scriptUrl = 'YOUR_APPS_SCRIPT_URL'; // From your code.gs deployment
    
    await fetch(scriptUrl + '?action=triggerSitemap', {
      method: 'POST'
    });
    
    console.log('✅ Sitemap update triggered');
    
  } catch (error) {
    console.error('Sitemap trigger error:', error);
  }
}

// ══════════════════════════════════════════════════════════════
// 4. SAVE INDEXING RECORD (Firestore)
// ══════════════════════════════════════════════════════════════

async function saveIndexingRecord(businessId, url) {
  try {
    await firebase.firestore()
      .collection('indexing_log')
      .add({
        business_id: businessId,
        url: url,
        submitted_at: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'submitted',
        google_pinged: true,
        indexnow_sent: true
      });
    
  } catch (error) {
    console.error('Save indexing record error:', error);
  }
}

// ══════════════════════════════════════════════════════════════
// 5. INTEGRATION - CALL FROM ADMIN PANEL
// ══════════════════════════════════════════════════════════════

/*
  ADD THIS TO YOUR ADMIN PANEL (admin.html)
  
  When approving a business:
  
  async function approveBusiness(bizId, bizName) {
    // Update status to approved
    await firebase.firestore()
      .collection('businesses')
      .doc(bizId)
      .update({
        status: 'approved',
        approved_at: new Date().toISOString()
      });
    
    // 🔥 AUTO-SUBMIT TO GOOGLE
    await autoSubmitToGoogle(bizId, bizName);
    
    showToast('✅ Business approved and submitted to Google!');
  }
*/

// ══════════════════════════════════════════════════════════════
// 6. INTEGRATION - CALL FROM INDEX.HTML
// ══════════════════════════════════════════════════════════════

/*
  ADD THIS TO YOUR INDEX.HTML
  
  After successful payment:
  
  async function onRazorpaySuccess(paymentId, businessId) {
    // Update business as paid
    await firebase.firestore()
      .collection('businesses')
      .doc(businessId)
      .update({
        status: 'approved',
        is_premium: true,
        payment_id: paymentId
      });
    
    // 🔥 AUTO-SUBMIT TO GOOGLE
    const bizDoc = await firebase.firestore()
      .collection('businesses')
      .doc(businessId)
      .get();
    
    const bizName = bizDoc.data().name;
    await autoSubmitToGoogle(businessId, bizName);
    
    showToast('✅ Payment confirmed! Your business is now live and submitted to Google!');
  }
*/

// ══════════════════════════════════════════════════════════════
// 7. BATCH SUBMIT ALL APPROVED BUSINESSES
// ══════════════════════════════════════════════════════════════

async function batchSubmitAllBusinesses() {
  try {
    console.log('🔄 Starting batch submission...');
    
    const snapshot = await firebase.firestore()
      .collection('businesses')
      .where('status', '==', 'approved')
      .get();
    
    let submitted = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      await autoSubmitToGoogle(doc.id, data.name);
      submitted++;
      
      // Wait 1 second between submissions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log(`✅ Batch submitted ${submitted} businesses`);
    alert(`✅ Submitted ${submitted} businesses to Google!`);
    
  } catch (error) {
    console.error('Batch submit error:', error);
  }
}

// ══════════════════════════════════════════════════════════════
// 8. CHECK INDEXING STATUS (Optional)
// ══════════════════════════════════════════════════════════════

async function checkIndexingStatus(url) {
  try {
    // Check if URL is indexed in Google
    const searchUrl = `https://www.google.com/search?q=site:${encodeURIComponent(url)}`;
    
    // Note: This opens a search page, actual status checking requires
    // Google Search Console API (requires OAuth setup)
    
    window.open(searchUrl, '_blank');
    
  } catch (error) {
    console.error('Check status error:', error);
  }
}

// ══════════════════════════════════════════════════════════════
// EXPORT FOR USE IN OTHER FILES
// ══════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
  window.autoIndexing = {
    submitToGoogle: autoSubmitToGoogle,
    submitToIndexNow,
    triggerSitemapUpdate,
    batchSubmitAll: batchSubmitAllBusinesses,
    checkStatus: checkIndexingStatus
  };
}

console.log('✓ Auto-crawl system loaded');

// ══════════════════════════════════════════════════════════════
// USAGE SUMMARY
// ══════════════════════════════════════════════════════════════

/*
  AUTOMATIC SUBMISSION:
  
  1. Admin approves business → Auto-submitted to Google
  2. User pays for premium → Auto-submitted to Google  
  3. Business updated → Auto-submitted to Google
  
  MANUAL BATCH SUBMISSION:
  
  In browser console:
  > window.autoIndexing.batchSubmitAll()
  
  This submits ALL approved businesses to Google at once.
  
  VERIFICATION:
  
  After 1-3 days, check if indexed:
  > window.autoIndexing.checkStatus('https://makemetop.in/biz.html?id=BUSINESS_ID')
  
  Or search on Google:
  > site:makemetop.in "Business Name"
  
  ═══════════════════════════════════════════════════════════════
  IMPORTANT: Your code.gs already handles sitemap generation!
  This script just triggers the regeneration and pings Google.
  ═══════════════════════════════════════════════════════════════
*/
