/**
 * DEBUG UI AUDIT - DIAGNOSTIC LAYER ONLY
 * 
 * This file does NOT modify UI behavior.
 * It only detects and reports issues.
 * 
 * Date: 2026-05-22
 */

(function() {
  'use strict';

  const auditResults = {
    uiDesyncIssues: [],
    duplicateTriggers: [],
    missingViewUpdates: [],
    suspiciousRepeatedCalls: []
  };

  // Track function calls to detect loops
  const callTracker = new Map();
  const CALL_THRESHOLD = 3; // Flag if called 3+ times in 1 second

  /**
   * Scan for UI functions and their behavior
   */
  function scanUIFunctions() {
    console.group('🔍 UI AUDIT: Scanning UI Functions');

    const uiFunctions = [
      'showChatView',
      'showVoiceView', 
      'showWelcomeView',
      'showFriendsView',
      'showDMView',
      'selectServer',
      'selectChannel',
      'openDMConversation',
      'joinVoiceChannel',
      'leaveVoiceChannel'
    ];

    uiFunctions.forEach(fnName => {
      if (typeof window[fnName] === 'function') {
        console.log(`✅ ${fnName} exists`);
      } else {
        console.warn(`❌ ${fnName} NOT FOUND`);
        auditResults.missingViewUpdates.push({
          function: fnName,
          issue: 'Function does not exist in global scope'
        });
      }
    });

    console.groupEnd();
  }

  /**
   * Check for functions that update state but don't update view
   */
  function detectMissingViewUpdates() {
    console.group('🔍 UI AUDIT: Missing View Updates');

    // Check selectServer
    if (typeof window.selectServer === 'function') {
      const fnString = window.selectServer.toString();
      const hasViewCall = /show(Chat|Welcome|Voice|Friends|DM)View/.test(fnString);
      
      if (!hasViewCall) {
        console.warn('⚠️ selectServer() does NOT call any view function');
        auditResults.missingViewUpdates.push({
          file: 'app.js',
          function: 'selectServer',
          issue: 'Updates state but does not show any view',
          line: 'Unknown (check app.js around line 450)'
        });
      } else {
        console.log('✅ selectServer() calls view function');
      }
    }

    // Check selectChannel
    if (typeof window.selectChannel === 'function') {
      const fnString = window.selectChannel.toString();
      const hasViewCall = /show(Chat|Welcome|Voice|Friends|DM)View/.test(fnString);
      
      if (!hasViewCall) {
        console.warn('⚠️ selectChannel() does NOT call any view function');
        auditResults.missingViewUpdates.push({
          file: 'app.js',
          function: 'selectChannel',
          issue: 'Updates state but does not show any view'
        });
      } else {
        console.log('✅ selectChannel() calls view function');
      }
    }

    console.groupEnd();
  }

  /**
   * Detect duplicate event listeners on UI elements
   */
  function detectDuplicateListeners() {
    console.group('🔍 UI AUDIT: Duplicate Event Listeners');

    const criticalElements = [
      { id: 'dm-btn', name: 'DM Button' },
      { id: 'find-friends-btn', name: 'Find Friends Button' },
      { selector: '.server-icon', name: 'Server Icons' },
      { selector: '.channel-item', name: 'Channel Items' }
    ];

    criticalElements.forEach(elem => {
      if (elem.id) {
        const el = document.getElementById(elem.id);
        if (el) {
          const hasOnclick = el.onclick !== null;
          const hasEventListener = el.getAttribute('data-has-listener') === 'true';
          
          if (hasOnclick && hasEventListener) {
            console.warn(`⚠️ ${elem.name} has BOTH onclick AND addEventListener`);
            auditResults.duplicateTriggers.push({
              element: elem.name,
              id: elem.id,
              issue: 'Has both onclick attribute and addEventListener binding'
            });
          } else {
            console.log(`✅ ${elem.name} has single binding`);
          }
        } else {
          console.log(`ℹ️ ${elem.name} not found in DOM (may not be loaded yet)`);
        }
      } else if (elem.selector) {
        const elements = document.querySelectorAll(elem.selector);
        console.log(`ℹ️ ${elem.name}: found ${elements.length} elements`);
      }
    });

    console.groupEnd();
  }

  /**
   * Monitor for repeated function calls (potential loops)
   */
  function setupCallMonitoring() {
    console.group('🔍 UI AUDIT: Setting Up Call Monitoring');

    const functionsToMonitor = [
      'showChatView',
      'showWelcomeView',
      'showFriendsView',
      'showDMView',
      'selectServer',
      'selectChannel'
    ];

    functionsToMonitor.forEach(fnName => {
      if (typeof window[fnName] === 'function') {
        const original = window[fnName];
        
        window[fnName] = function(...args) {
          // Track call
          const now = Date.now();
          if (!callTracker.has(fnName)) {
            callTracker.set(fnName, []);
          }
          
          const calls = callTracker.get(fnName);
          calls.push({ time: now, stack: new Error().stack });
          
          // Clean old calls (older than 1 second)
          const recentCalls = calls.filter(c => now - c.time < 1000);
          callTracker.set(fnName, recentCalls);
          
          // Check for suspicious repeated calls
          if (recentCalls.length >= CALL_THRESHOLD) {
            console.warn(`⚠️ SUSPICIOUS: ${fnName}() called ${recentCalls.length} times in 1 second`);
            console.log('Call stack:', recentCalls[recentCalls.length - 1].stack);
            
            auditResults.suspiciousRepeatedCalls.push({
              function: fnName,
              count: recentCalls.length,
              timeWindow: '1 second',
              lastStack: recentCalls[recentCalls.length - 1].stack
            });
          }
          
          // Call original
          return original.apply(this, args);
        };
        
        console.log(`✅ Monitoring ${fnName}()`);
      }
    });

    console.groupEnd();
  }

  /**
   * Check for UI desync issues
   */
  function detectUIDesync() {
    console.group('🔍 UI AUDIT: UI Desync Detection');

    // Check if multiple views are visible at once
    const views = [
      { id: 'welcome-view', name: 'Welcome' },
      { id: 'chat-view', name: 'Chat' },
      { id: 'voice-view', name: 'Voice' },
      { id: 'friends-view', name: 'Friends' },
      { id: 'room-view', name: 'Room' }
    ];

    const visibleViews = [];
    views.forEach(view => {
      const el = document.getElementById(view.id);
      if (el && !el.classList.contains('hidden')) {
        visibleViews.push(view.name);
      }
    });

    if (visibleViews.length === 0) {
      console.warn('⚠️ NO VIEWS VISIBLE - UI may be broken');
      auditResults.uiDesyncIssues.push({
        issue: 'No main view is visible',
        visibleViews: []
      });
    } else if (visibleViews.length > 1) {
      console.warn(`⚠️ MULTIPLE VIEWS VISIBLE: ${visibleViews.join(', ')}`);
      auditResults.uiDesyncIssues.push({
        issue: 'Multiple views visible simultaneously',
        visibleViews: visibleViews
      });
    } else {
      console.log(`✅ Single view visible: ${visibleViews[0]}`);
    }

    // Check state consistency
    if (window.currentServerId && window.currentServer) {
      console.log(`✅ Server state consistent: ${window.currentServer.name}`);
    } else if (window.currentServerId && !window.currentServer) {
      console.warn('⚠️ currentServerId set but currentServer is null');
      auditResults.uiDesyncIssues.push({
        issue: 'currentServerId exists but currentServer is null',
        serverId: window.currentServerId
      });
    }

    console.groupEnd();
  }

  /**
   * Print full audit report
   */
  function printAuditReport() {
    console.group('📊 UI AUDIT REPORT');
    
    console.group('❌ UI Desync Issues (' + auditResults.uiDesyncIssues.length + ')');
    if (auditResults.uiDesyncIssues.length === 0) {
      console.log('✅ No issues found');
    } else {
      auditResults.uiDesyncIssues.forEach((issue, i) => {
        console.log(`${i + 1}.`, issue);
      });
    }
    console.groupEnd();

    console.group('⚠️ Duplicate Triggers (' + auditResults.duplicateTriggers.length + ')');
    if (auditResults.duplicateTriggers.length === 0) {
      console.log('✅ No issues found');
    } else {
      auditResults.duplicateTriggers.forEach((issue, i) => {
        console.log(`${i + 1}.`, issue);
      });
    }
    console.groupEnd();

    console.group('🔧 Missing View Updates (' + auditResults.missingViewUpdates.length + ')');
    if (auditResults.missingViewUpdates.length === 0) {
      console.log('✅ No issues found');
    } else {
      auditResults.missingViewUpdates.forEach((issue, i) => {
        console.log(`${i + 1}.`, issue);
      });
    }
    console.groupEnd();

    console.group('🔁 Suspicious Repeated Calls (' + auditResults.suspiciousRepeatedCalls.length + ')');
    if (auditResults.suspiciousRepeatedCalls.length === 0) {
      console.log('✅ No issues found');
    } else {
      auditResults.suspiciousRepeatedCalls.forEach((issue, i) => {
        console.log(`${i + 1}.`, issue);
      });
    }
    console.groupEnd();

    console.groupEnd();
  }

  /**
   * Main audit function - exposed globally
   */
  window.runUIAudit = function() {
    console.clear();
    console.log('%c🔍 UI AUDIT STARTED', 'font-size: 16px; font-weight: bold; color: #00ff00;');
    console.log('Time:', new Date().toISOString());
    console.log('---');

    // Reset results
    auditResults.uiDesyncIssues = [];
    auditResults.duplicateTriggers = [];
    auditResults.missingViewUpdates = [];
    auditResults.suspiciousRepeatedCalls = [];

    // Run all checks
    scanUIFunctions();
    detectMissingViewUpdates();
    detectDuplicateListeners();
    detectUIDesync();
    
    // Print report
    printAuditReport();

    console.log('---');
    console.log('%c✅ UI AUDIT COMPLETE', 'font-size: 16px; font-weight: bold; color: #00ff00;');
    console.log('Run window.runUIAudit() again to re-check');
    
    return auditResults;
  };

  // Auto-run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        setupCallMonitoring();
        window.runUIAudit();
      }, 1000);
    });
  } else {
    setTimeout(() => {
      setupCallMonitoring();
      window.runUIAudit();
    }, 1000);
  }

  console.log('✅ Debug UI Audit loaded. Run window.runUIAudit() to check UI state.');
})();
