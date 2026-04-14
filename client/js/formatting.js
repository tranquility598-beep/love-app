/**
 * Форматирование текста в сообщениях
 */

/**
 * Вставить форматирование в текущую позицию курсора
 */
function insertFormatting(before, after) {
  const input = document.getElementById('message-input');
  if (!input) return;
  
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const text = input.value;
  const selectedText = text.substring(start, end);
  
  // Если текст выделен, оборачиваем его
  if (selectedText) {
    const newText = text.substring(0, start) + before + selectedText + after + text.substring(end);
    input.value = newText;
    
    // Устанавливаем курсор после вставленного текста
    input.selectionStart = input.selectionEnd = start + before.length + selectedText.length + after.length;
  } else {
    // Если текст не выделен, вставляем маркеры и ставим курсор между ними
    const newText = text.substring(0, start) + before + after + text.substring(end);
    input.value = newText;
    
    // Устанавливаем курсор между маркерами
    input.selectionStart = input.selectionEnd = start + before.length;
  }
  
  input.focus();
  
  // Обновляем высоту textarea
  if (typeof handleMessageInput === 'function') {
    handleMessageInput({ target: input });
  }
}

/**
 * Показать/скрыть панель форматирования
 */
function toggleFormattingToolbar() {
  const toolbar = document.getElementById('formatting-toolbar');
  if (!toolbar) return;
  
  toolbar.classList.toggle('hidden');
}

/**
 * Показать/скрыть пикер форматирования
 */
function toggleFormattingPicker() {
  const picker = document.getElementById('formatting-picker-container');
  const emojiPicker = document.getElementById('emoji-picker-container');
  
  if (!picker) return;
  
  // Закрываем эмодзи пикер если открыт
  if (emojiPicker && !emojiPicker.classList.contains('hidden')) {
    emojiPicker.classList.add('hidden');
  }
  
  picker.classList.toggle('hidden');
}

/**
 * Показать справку по форматированию
 */
function showFormattingHelp() {
  const helpText = `
📝 Справка по форматированию текста:

**жирный текст** - жирный
*курсивный текст* - курсив
~~зачеркнутый~~ - зачеркнутый
\`код\` - моноширинный код

Ссылки автоматически становятся кликабельными.

Горячие клавиши:
Ctrl+B - жирный
Ctrl+I - курсив
  `.trim();
  
  alert(helpText);
}

/**
 * Обработка горячих клавиш для форматирования
 */
function handleFormattingHotkeys(e) {
  // Ctrl+B - жирный
  if (e.ctrlKey && e.key === 'b') {
    e.preventDefault();
    insertFormatting('**', '**');
    return;
  }
  
  // Ctrl+I - курсив
  if (e.ctrlKey && e.key === 'i') {
    e.preventDefault();
    insertFormatting('*', '*');
    return;
  }
  
  // Ctrl+Shift+X - зачеркнутый
  if (e.ctrlKey && e.shiftKey && e.key === 'X') {
    e.preventDefault();
    insertFormatting('~~', '~~');
    return;
  }
  
  // Ctrl+E - код
  if (e.ctrlKey && e.key === 'e') {
    e.preventDefault();
    insertFormatting('`', '`');
    return;
  }
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  const messageInput = document.getElementById('message-input');
  
  if (messageInput) {
    // Обработка горячих клавиш
    messageInput.addEventListener('keydown', handleFormattingHotkeys);
  }
  
  // Закрытие пикера форматирования при клике вне его
  document.addEventListener('click', (e) => {
    const picker = document.getElementById('formatting-picker-container');
    const toggleBtn = document.querySelector('.format-toggle-btn');
    
    if (!picker || !toggleBtn) return;
    
    // Если клик не по кнопке и не по пикеру - закрываем
    if (!picker.classList.contains('hidden') && 
        !picker.contains(e.target) && 
        !toggleBtn.contains(e.target)) {
      picker.classList.add('hidden');
    }
  });
});
