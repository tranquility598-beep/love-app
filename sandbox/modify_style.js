const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'client', 'styles', 'style.css');

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

let css = fs.readFileSync(filePath, 'utf8');

// Normalize line endings for replacement matches
const normalizedCss = css.replace(/\r\n/g, '\n');

// 1. .global-sidebar padding (already done, but verify)
const oldSidebar = `padding: 20px 0;
    justify-content: space-between;`;
const newSidebar = `padding: 12px 0;
    justify-content: space-between;`;

// 2. .logo-nav-area margin-bottom (already done)
const oldLogo = `transition: var(--transition-smooth);
    margin-bottom: 24px;`;
const newLogo = `transition: var(--transition-smooth);
    margin-bottom: 12px;`;

// 3. .global-nav gap, margin-top and flex-shrink
const oldNav = `display: flex;
    flex-direction: column;
    gap: 12px;
    flex-grow: 0;
    width: 100%;
    align-items: center;
    margin-top: 16px;`;
const newNav = `display: flex;
    flex-direction: column;
    gap: 8px;
    flex-grow: 0;
    flex-shrink: 0 !important;
    width: 100%;
    align-items: center;
    margin-top: 8px;`;

// 4. .sidebar-footer gap and flex-shrink
const oldFooter = `display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    width: 100%;`;
const newFooter = `display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 100%;
    flex-shrink: 0 !important;`;

// 5. .sidebar-quick-access and .quick-access-items (without max-height, using flex: 1 1 auto)
const oldQuickAccess = `sidebar-quick-access {
    margin: 12px 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 12px !important;
    flex-grow: 1 !important;
    width: 100% !important;
    justify-content: flex-start !important;
    padding-top: 10px !important;
}

.quick-access-items {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 12px !important;
}`;

const newQuickAccess = `sidebar-quick-access {
    margin: 8px 0 !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 8px !important;
    flex: 1 1 auto !important;
    width: 100% !important;
    justify-content: flex-start !important;
    padding-top: 6px !important;
    min-height: 0 !important;
    overflow: hidden !important;
}

.quick-access-items {
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    gap: 8px !important;
    overflow-y: auto !important;
    flex: 1 1 auto !important;
    width: 100% !important;
    scrollbar-width: none !important;
}
.quick-access-items::-webkit-scrollbar {
    display: none !important;
}`;

// 6. .quick-btn flex-shrink: 0 (already done)
const oldQuickBtn = `.quick-btn {
    width: 38px !important;
    height: 38px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    color: var(--text-secondary) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    position: relative !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
}`;
const newQuickBtn = `.quick-btn {
    width: 38px !important;
    height: 38px !important;
    border-radius: 50% !important;
    background: rgba(255, 255, 255, 0.03) !important;
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
    color: var(--text-secondary) !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    cursor: pointer !important;
    position: relative !important;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    flex-shrink: 0 !important;
}`;

// 7. .nav-btn, .logo-nav-area, .user-avatar-btn flex-shrink: 0 (already done)
const oldNavBtns = `/* Perfect circles by default for global sidebar buttons */
.nav-btn, .logo-nav-area, .user-avatar-btn {
    border-radius: 50% !important;
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
}`;
const newNavBtns = `/* Perfect circles by default for global sidebar buttons */
.nav-btn, .logo-nav-area, .user-avatar-btn {
    border-radius: 50% !important;
    transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1) !important;
    flex-shrink: 0 !important;
}`;

// 8. .sidebar-divider flex-shrink: 0
const oldDivider = `.sidebar-divider {
    width: 32px !important;
    height: 1.5px !important;
    background-color: rgba(255, 255, 255, 0.08) !important;
    margin: 10px auto 0 auto !important;
    border-radius: 1px !important;
}`;
const newDivider = `.sidebar-divider {
    width: 32px !important;
    height: 1.5px !important;
    background-color: rgba(255, 255, 255, 0.08) !important;
    margin: 10px auto 0 auto !important;
    border-radius: 1px !important;
    flex-shrink: 0 !important;
}`;

// 9. Override min-height: 777px for Electron mode (already done in titlebar.css, but keep it in mind)

let modified = normalizedCss;

// Restore style.css to baseline from sandbox first to apply clean replacements
const baselinePath = path.resolve(__dirname, 'new-design', 'style.css');
if (fs.existsSync(baselinePath)) {
    modified = fs.readFileSync(baselinePath, 'utf8').replace(/\r\n/g, '\n');
    console.log("Reset style.css to pristine baseline for dynamic updates.");
}

// Apply updates
modified = modified.replace(oldSidebar.replace(/\r\n/g, '\n'), newSidebar);
modified = modified.replace(oldLogo.replace(/\r\n/g, '\n'), newLogo);
modified = modified.replace(oldNav.replace(/\r\n/g, '\n'), newNav);
modified = modified.replace(oldFooter.replace(/\r\n/g, '\n'), newFooter);
modified = modified.replace(oldQuickAccess.replace(/\r\n/g, '\n'), newQuickAccess);
modified = modified.replace(oldQuickBtn.replace(/\r\n/g, '\n'), newQuickBtn);
modified = modified.replace(oldNavBtns.replace(/\r\n/g, '\n'), newNavBtns);
modified = modified.replace(oldDivider.replace(/\r\n/g, '\n'), newDivider);

// Write back with normalized \r\n
const finalCss = modified.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalCss, 'utf8');
console.log(`Successfully completed all style updates in style.css!`);
