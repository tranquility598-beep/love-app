const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'client', 'js', 'new', 'script.js');

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

let code = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
const normalizedCode = code.replace(/\r\n/g, '\n');

const targetStr = `    // Ограничение: максимум 5 быстрых переходов
    const existingCount = container.querySelectorAll(".quick-btn").length;
    if (existingCount >= 5) {
        showToast("Предупреждение", "Максимум 5 быстрых переходов разрешено");
        return;
    }`;

const replacementStr = `    // Ограничение: максимум 15 быстрых переходов
    const existingCount = container.querySelectorAll(".quick-btn").length;
    if (existingCount >= 15) {
        showToast("Предупреждение", "Максимум 15 быстрых переходов разрешено");
        return;
    }`;

if (normalizedCode.includes(targetStr)) {
    const modifiedCode = normalizedCode.replace(targetStr, replacementStr);
    // Write back with CRLF
    fs.writeFileSync(filePath, modifiedCode.replace(/\n/g, '\r\n'), 'utf8');
    console.log("Successfully changed maximum quick access limit to 15 inside script.js!");
} else {
    console.error("Target string not found in script.js!");
    process.exit(1);
}
