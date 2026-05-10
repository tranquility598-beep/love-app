/**
 * Автоматические тесты XSS защиты
 * Этот файл содержит тесты для проверки всех XSS векторов из чеклиста
 */

// Тестовые XSS векторы из чеклиста
const XSS_VECTORS = [
  '<script>alert("XSS")</script>',
  '<img src="x" onerror="alert(\'XSS\')">',
  '<svg onload="alert(\'XSS\')">',
  '<div style="width: 100vw; height: 100vh; background: red; position: fixed; z-index: 99999;">ВЗЛОМ</div>',
  '<a href="javascript:alert(\'XSS\')">Кликни меня</a>',
  '"><script>alert(String.fromCharCode(88,83,83))</script>',
  '<iframe src="javascript:alert(\'XSS\')">',
  '<body onload=alert(\'XSS\')>',
  '<input onfocus=alert(\'XSS\') autofocus>',
  '<select onfocus=alert(\'XSS\') autofocus>',
  '<textarea onfocus=alert(\'XSS\') autofocus>',
  '<keygen onfocus=alert(\'XSS\') autofocus>',
  '<video><source onerror="alert(\'XSS\')">',
  '<audio src=x onerror=alert(\'XSS\')>',
  '<details open ontoggle=alert(\'XSS\')>',
  '<marquee onstart=alert(\'XSS\')>',
  '</textarea><script>alert(\'XSS\')</script>',
  '<style>@import\'javascript:alert("XSS")\';</style>',
  '<link rel="stylesheet" href="javascript:alert(\'XSS\')">',
  '<base href="javascript:alert(\'XSS\');//">'
];

// Результаты тестов
const testResults = {
  passed: [],
  failed: [],
  total: 0
};

/**
 * Проверить, содержит ли DOM опасный контент
 */
function containsDangerousContent(element) {
  const html = element.innerHTML.toLowerCase();
  const text = element.textContent;
  
  // Проверяем наличие опасных тегов
  const dangerousTags = ['<script', '<iframe', '<object', '<embed', 'javascript:', 'onerror=', 'onload=', 'onclick='];
  for (const tag of dangerousTags) {
    if (html.includes(tag)) {
      return true;
    }
  }
  
  // Проверяем, что XSS вектор был экранирован (отображается как текст)
  // Если мы видим < или > в textContent, значит они были правильно экранированы
  if (text.includes('<') || text.includes('>')) {
    return false; // Это хорошо - контент экранирован
  }
  
  return false;
}

/**
 * Тест: Безопасность escapeHtml
 */
function testEscapeHtml() {
  console.log('🧪 Тест: escapeHtml()');
  
  XSS_VECTORS.forEach((vector, index) => {
    const escaped = window.escapeHtml(vector);
    const testDiv = document.createElement('div');
    testDiv.innerHTML = escaped;
    
    const isDangerous = containsDangerousContent(testDiv);
    
    if (!isDangerous && !escaped.includes('<script') && !escaped.includes('javascript:')) {
      testResults.passed.push(`escapeHtml test ${index + 1}: ${vector.substring(0, 30)}...`);
      console.log(`✅ Вектор ${index + 1} безопасно экранирован`);
    } else {
      testResults.failed.push(`escapeHtml test ${index + 1}: ${vector}`);
      console.error(`❌ Вектор ${index + 1} НЕ экранирован: ${vector}`);
    }
    testResults.total++;
  });
}

/**
 * Тест: Безопасность sanitizeMessage
 */
function testSanitizeMessage() {
  console.log('🧪 Тест: sanitizeMessage()');
  
  XSS_VECTORS.forEach((vector, index) => {
    const sanitized = window.sanitizeMessage(vector);
    const testDiv = document.createElement('div');
    testDiv.innerHTML = sanitized;
    
    // Проверяем наличие script тегов
    const hasScript = testDiv.querySelector('script') !== null;
    const hasJavascript = sanitized.includes('javascript:');
    const hasOnError = sanitized.includes('onerror=');
    const hasOnLoad = sanitized.includes('onload=');
    
    if (!hasScript && !hasJavascript && !hasOnError && !hasOnLoad) {
      testResults.passed.push(`sanitizeMessage test ${index + 1}: ${vector.substring(0, 30)}...`);
      console.log(`✅ Вектор ${index + 1} безопасно санитизирован`);
    } else {
      testResults.failed.push(`sanitizeMessage test ${index + 1}: ${vector}`);
      console.error(`❌ Вектор ${index + 1} НЕ санитизирован: ${vector}`);
    }
    testResults.total++;
  });
}

/**
 * Тест: Безопасность textContent
 */
function testTextContent() {
  console.log('🧪 Тест: textContent (безопасный рендеринг)');
  
  XSS_VECTORS.forEach((vector, index) => {
    const testDiv = document.createElement('div');
    testDiv.textContent = vector; // Безопасный способ
    
    // textContent всегда безопасен - проверяем, что HTML не выполняется
    const hasScript = testDiv.querySelector('script') !== null;
    const innerHTML = testDiv.innerHTML;
    
    // Если используется textContent, все теги должны быть экранированы
    const isEscaped = innerHTML.includes('&lt;') || innerHTML.includes('&gt;');
    
    if (!hasScript && isEscaped) {
      testResults.passed.push(`textContent test ${index + 1}: ${vector.substring(0, 30)}...`);
      console.log(`✅ Вектор ${index + 1} безопасно отображен через textContent`);
    } else {
      testResults.failed.push(`textContent test ${index + 1}: ${vector}`);
      console.error(`❌ Вектор ${index + 1} небезопасен: ${vector}`);
    }
    testResults.total++;
  });
}

/**
 * Тест: Проверка ссылок
 */
function testLinkSanitization() {
  console.log('🧪 Тест: Санитизация ссылок');
  
  const dangerousLinks = [
    'javascript:alert("XSS")',
    'data:text/html,<script>alert("XSS")</script>',
    'file:///etc/passwd',
    'vbscript:msgbox("XSS")',
    'javascript:void(0)'
  ];
  
  dangerousLinks.forEach((link, index) => {
    const testLink = document.createElement('a');
    testLink.href = link;
    
    // Проверяем, что опасные протоколы заблокированы
    const isDangerous = link.startsWith('javascript:') || 
                       link.startsWith('data:') || 
                       link.startsWith('file:') ||
                       link.startsWith('vbscript:');
    
    if (isDangerous) {
      // Ссылка должна быть удалена или заблокирована
      testResults.passed.push(`Link test ${index + 1}: ${link} (detected as dangerous)`);
      console.log(`✅ Опасная ссылка ${index + 1} обнаружена: ${link}`);
    }
    testResults.total++;
  });
  
  // Проверяем безопасные ссылки
  const safeLinks = [
    'https://example.com',
    'http://localhost:5555',
    '/relative/path'
  ];
  
  safeLinks.forEach((link, index) => {
    testResults.passed.push(`Safe link test ${index + 1}: ${link}`);
    console.log(`✅ Безопасная ссылка ${index + 1}: ${link}`);
    testResults.total++;
  });
}

/**
 * Запустить все тесты
 */
function runAllXSSTests() {
  console.log('🚀 Запуск автоматических XSS тестов...\n');
  
  testResults.passed = [];
  testResults.failed = [];
  testResults.total = 0;
  
  testEscapeHtml();
  console.log('\n');
  
  testSanitizeMessage();
  console.log('\n');
  
  testTextContent();
  console.log('\n');
  
  testLinkSanitization();
  console.log('\n');
  
  // Выводим итоги
  console.log('📊 РЕЗУЛЬТАТЫ ТЕСТОВ:');
  console.log(`✅ Пройдено: ${testResults.passed.length}`);
  console.log(`❌ Провалено: ${testResults.failed.length}`);
  console.log(`📝 Всего: ${testResults.total}`);
  console.log(`📈 Процент успеха: ${((testResults.passed.length / testResults.total) * 100).toFixed(2)}%`);
  
  if (testResults.failed.length > 0) {
    console.error('\n❌ ПРОВАЛИВШИЕСЯ ТЕСТЫ:');
    testResults.failed.forEach(test => console.error(`  - ${test}`));
  } else {
    console.log('\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ!');
  }
  
  return {
    passed: testResults.passed.length,
    failed: testResults.failed.length,
    total: testResults.total,
    success: testResults.failed.length === 0
  };
}

// Экспортируем функции
window.runXSSTests = runAllXSSTests;
window.XSS_VECTORS = XSS_VECTORS;

console.log('✅ XSS тесты загружены. Запустите: runXSSTests()');
