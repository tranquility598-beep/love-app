import { expect, test } from '@playwright/test';

const staffUser = {
  _id: 'staff1', username: 'goodvexel', nickname: 'goodvexel', role: 'developer',
  roleLabel: 'Разработчик', adminTotpEnabled: true, permissions: ['*']
};

async function mockSession(page) {
  await page.route('**/api/admin/auth/me', route => route.fulfill({ json: { user: staffUser } }));
  await page.route('**/api/admin/auth/csrf', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }));
  await page.route('**/api/admin/auth/socket-token', route => route.fulfill({ json: { token: 'playwright-invalid-socket-token' } }));
  await page.route('**/api/admin/events', route => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'event: ready\ndata: {}\n\n' }));
  await page.route('**/api/admin/users?**', route => route.fulfill({ json: { users: [staffUser], pagination: { page: 1, pages: 1, total: 1 } } }));
}

test('login fits the viewport and exposes both credential fields', async ({ page }, testInfo) => {
  await page.route('**/api/admin/auth/me', route => route.fulfill({ status: 401, json: { message: 'Нет сессии' } }));
  await page.route('**/api/admin/auth/csrf', route => route.fulfill({ status: 401, json: { message: 'Нет сессии' } }));
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Вход в панель' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Пароль')).toBeVisible();
  await expect(page.locator('input:not([id]):not([name]), textarea:not([id]):not([name]), select:not([id]):not([name])')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
});

test('local email preview lets a secondary browser continue safely', async ({ page }) => {
  await page.route('**/api/admin/auth/me', route => route.fulfill({ status: 401, json: { message: 'Нет сессии' } }));
  await page.route('**/api/admin/auth/csrf', route => route.fulfill({ status: 401, json: { message: 'Нет сессии' } }));
  await page.route('**/api/admin/auth/login', route => route.fulfill({ json: { challengeToken: 'challenge-1', methods: ['email'], expiresIn: 600 } }));
  await page.route('**/api/admin/auth/challenge/email', async route => {
    expect(route.request().postDataJSON()).toEqual({ challengeToken: 'challenge-1' });
    await route.fulfill({ json: { message: 'Локальный код создан', developmentCode: '654321' } });
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('second@example.com');
  await page.getByLabel('Пароль').fill('correct-password');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.locator('input[name="verification-code"]')).toHaveValue('654321');
  await expect(page.getByText(/Локальная проверка: код 654321/)).toBeVisible();
});

test('Dev Log supports editing, live counters and inline comments', async ({ page }) => {
  await mockSession(page);
  const post = {
    _id: 'post1', title: 'Новая версия', body: 'Подробности обновления', status: 'published',
    tags: ['release'], upVotes: 4, downVotes: 1, commentCount: 2, createdAt: new Date().toISOString(),
    author: staffUser
  };
  await page.route('**/api/admin/cases?**', route => route.fulfill({ json: { cases: [], pagination: { page: 1, pages: 1, total: 0 } } }));
  await page.route('**/api/admin/devlog?**', route => route.fulfill({ json: { posts: [post] } }));
  await page.route('**/api/admin/devlog/post1/comments', route => route.fulfill({ json: { comments: [{ _id: 'comment1', post: 'post1', body: 'Ждём!', status: 'active', author: { username: 'sigma' }, createdAt: new Date().toISOString() }] } }));
  await page.route('**/api/admin/devlog/post1', async route => {
    expect(route.request().method()).toBe('PATCH');
    const payload = route.request().postDataJSON();
    expect(payload.title).toBe('Новая версия 2');
    await route.fulfill({ json: { post: { ...post, ...payload } } });
  });

  await page.goto('/community');
  await page.getByRole('button', { name: 'Dev Log' }).click();
  await expect(page.locator('.devlog-meta')).toContainText('4');
  await page.getByRole('button', { name: 'Комментарии (2)' }).click();
  await expect(page.getByText('Ждём!')).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать запись' }).click();
  await expect(page.getByRole('heading', { name: 'Редактирование Dev Log' })).toBeVisible();
  await page.locator('input[name="devlog-title"]').fill('Новая версия 2');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByText('Запись Dev Log обновлена.')).toBeVisible();
});

test('Dev Log can be archived, restored and permanently deleted', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('love-admin-locale', 'en'));
  await mockSession(page);
  let status = 'published';
  let deleted = false;
  const post = {
    _id: 'post-archive', title: 'Release notes', body: 'A published Dev Log entry.',
    tags: ['release'], upVotes: 3, downVotes: 0, commentCount: 1,
    createdAt: new Date().toISOString(), author: staffUser
  };
  await page.route('**/api/admin/cases?**', route => route.fulfill({ json: { cases: [], pagination: { page: 1, pages: 1, total: 0 } } }));
  await page.route('**/api/admin/devlog?**', route => {
    const requested = new URL(route.request().url()).searchParams.get('status');
    const visible = !deleted && (requested === 'archived' ? status === 'archived' : status !== 'archived');
    return route.fulfill({ json: { posts: visible ? [{ ...post, status }] : [] } });
  });
  await page.route('**/api/admin/devlog/post-archive/archive', route => {
    status = 'archived';
    return route.fulfill({ json: { post: { ...post, status } } });
  });
  await page.route('**/api/admin/devlog/post-archive/restore', route => {
    status = 'published';
    return route.fulfill({ json: { post: { ...post, status } } });
  });
  await page.route('**/api/admin/devlog/post-archive', route => {
    expect(route.request().method()).toBe('DELETE');
    deleted = true;
    return route.fulfill({ json: { message: 'Deleted' } });
  });
  page.on('dialog', dialog => dialog.accept());

  await page.goto('/community');
  await page.getByRole('button', { name: 'Dev Log' }).click();
  await expect(page.getByText('Release notes')).toBeVisible();
  await page.getByTitle('Archive and remove from Love').click();
  await expect(page.getByText('Dev Log post moved to archive.')).toBeVisible();
  await expect(page.getByText('Release notes')).toHaveCount(0);

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByTitle('Restore post').click();
  await expect(page.getByText('Dev Log post restored.')).toBeVisible();
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await expect(page.getByText('Release notes')).toBeVisible();
  await page.getByTitle('Delete permanently').click();
  await expect(page.getByText('Dev Log post permanently deleted.')).toBeVisible();
  await expect(page.getByText('Release notes')).toHaveCount(0);
});

test('developer can explicitly accept an own appeal with an audited override', async ({ page }) => {
  await mockSession(page);
  let resolved = false;
  const baseCase = {
    _id: 'appeal1', number: 'LOVE-APPEAL-1', kind: 'appeal', title: 'Апелляция на ban',
    description: 'Прошу пересмотреть наказание.', status: 'triaged', priority: 'high',
    reporter: { _id: 'user1', username: 'sigma' }, notes: [], tags: [], attachments: [],
    moderationAction: { _id: 'action1', issuedBy: { _id: 'staff1', username: 'goodvexel' } },
    createdAt: new Date().toISOString()
  };
  await page.route('**/api/admin/cases?**', route => route.fulfill({ json: { cases: [{ ...baseCase, status: resolved ? 'resolved' : 'triaged' }], pagination: { page: 1, pages: 1, total: 1 } } }));
  await page.route('**/api/admin/cases/appeal1', route => route.fulfill({ json: { case: { ...baseCase, status: resolved ? 'resolved' : 'triaged' } } }));
  await page.route('**/api/admin/cases/appeal1/appeal-decision', async route => {
    const payload = route.request().postDataJSON();
    expect(payload.decision).toBe('accepted');
    expect(payload.overrideOwn).toBe(true);
    resolved = true;
    await route.fulfill({ json: { message: 'Апелляция принята, наказание снято', case: { ...baseCase, status: 'resolved' } } });
  });
  page.on('dialog', dialog => dialog.accept());

  await page.goto('/cases?case=appeal1');
  await page.getByRole('button', { name: 'Принять и снять наказание' }).click();
  await expect(page.getByText('Апелляция принята, наказание снято')).toBeVisible();
});

test('documentation, policy acceptance and settings are usable', async ({ page }, testInfo) => {
  let policyAccepted = false;
  const pendingUser = {
    ...staffUser,
    adminPolicyRequiredVersion: '2026-08-01',
    get adminPolicyAcceptedVersion() { return policyAccepted ? '2026-08-01' : ''; }
  };
  await page.route('**/api/admin/auth/me', route => route.fulfill({ json: { user: { ...pendingUser, adminPolicyAcceptedVersion: policyAccepted ? '2026-08-01' : '' } } }));
  await page.route('**/api/admin/auth/csrf', route => route.fulfill({ json: { csrfToken: 'test-csrf' } }));
  await page.route('**/api/admin/auth/socket-token', route => route.fulfill({ json: { token: 'playwright-invalid-socket-token' } }));
  await page.route('**/api/admin/events', route => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: 'event: ready\ndata: {}\n\n' }));
  await page.route('**/api/admin/policy/accept', async route => {
    expect(route.request().postDataJSON().accepted).toBe(true);
    policyAccepted = true;
    await route.fulfill({ json: { message: 'Правила команды приняты' } });
  });

  await page.goto('/users');
  await expect(page).toHaveURL(/\/documentation\/start$/);
  await expect(page.locator('.docs-article h1')).toHaveText('Начало работы');
  await page.goto('/documentation/actions');
  await expect(page.locator('.docs-article h1')).toHaveText('Выбор наказания');
  await expect(page.getByText('Первый флуд')).toBeVisible();
  await page.goto('/documentation/conduct');
  await expect(page.getByRole('heading', { name: 'Что запрещено' })).toBeVisible();
  await page.goto('/documentation/security');
  await expect(page.locator('.docs-article h1')).toHaveText('Безопасность сотрудника');
  await page.goto('/documentation/roles/developer');
  await expect(page.locator('.docs-article h1')).toHaveText('Разработчик');
  await expect(page.locator('.docs-policy-gate')).toContainText('5 из 5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('documentation.png'), fullPage: true });
  await page.locator('input[name="accept-admin-policy"]').check();
  await page.getByRole('button', { name: 'Принять правила' }).click();
  await expect(page.getByText('Правила команды приняты. Рабочие разделы доступны.')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible();
  await expect(page.locator('input[name="confirm-dangerous"]')).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('dashboard renders real operational layout without horizontal overflow', async ({ page }, testInfo) => {
  await mockSession(page);
  await page.route('**/api/admin/dashboard', route => route.fulfill({ json: { kpis: { totalUsers: 11, onlineUsers: 3, newCases: 4, criticalCases: 1, mutedUsers: 1, bannedUsers: 0 }, recentCases: [] } }));
  await page.route('**/api/admin/analytics**', route => route.fulfill({ json: { kpis: { totalUsers: 11, verifiedUsers: 9, dau: 3, wau: 7, mau: 10, onlineUsers: 3, onlineSessions: 4, peakOnline: 5 }, online: [], timeline: [] } }));
  await page.goto('/');
  await expect(page.getByText('Сейчас онлайн')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Требуют внимания' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });
});

test('staff voice rooms stay visible while the realtime socket reconnects', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/admin/staff/conversations', route => route.fulfill({ json: { conversations: [] } }));
  await page.route('**/api/admin/staff/members', route => route.fulfill({ json: { members: [staffUser] } }));
  await page.route('**/api/admin/staff/escalations', route => route.fulfill({ json: { escalations: [] } }));
  await page.route('**/api/admin/staff/voice/rooms', route => route.fulfill({ json: {
    rooms: [
      { id: 'support', label: 'Support', labelEn: 'Support', canJoin: true, members: [] },
      { id: 'moderators', label: 'Модераторы', labelEn: 'Moderators', canJoin: true, members: [] },
      { id: 'admins', label: 'Администраторы', labelEn: 'Administrators', canJoin: true, members: [] },
      { id: 'leadership', label: 'Руководство', labelEn: 'Leadership', canJoin: true, members: [] }
    ]
  } }));

  await page.goto('/staff-comms');
  await expect(page.locator('.voice-room-list strong')).toHaveText(['Support', 'Модераторы', 'Администраторы', 'Руководство']);
  await expect(page.locator('.voice-room-list article').first().getByRole('button')).toBeDisabled();
  await expect(page.getByText('Восстанавливаем связь').first()).toBeVisible();
});

test('urgent case remains usable on compact screens', async ({ page }, testInfo) => {
  await mockSession(page);
  const duplicateKeyWarnings = [];
  page.on('console', message => {
    if (message.text().includes('same key')) duplicateKeyWarnings.push(message.text());
  });
  let item = {
    _id: 'case1', number: 'LOVE-TEST-1', kind: 'report', title: 'Срочная жалоба',
    description: 'Подробное описание обращения для проверки.', status: 'new', priority: 'critical',
    reporter: { _id: 'user1', username: 'sigma' },
    subjectUser: { _id: 'user2', username: 'spammer', nickname: 'Spammer' },
    evidenceSnapshot: {
      messageId: 'message1', content: 'Повторяющийся текст из исходного сообщения',
      createdAt: new Date().toISOString(), capturedAt: new Date().toISOString(), attachments: []
    },
    tags: [], attachments: [], notes: [], createdAt: new Date().toISOString()
  };
  const casePatches = [];
  let detailFetches = 0;
  await page.route('**/api/admin/cases?**', route => route.fulfill({ json: { cases: [item], pagination: { page: 1, pages: 1, total: 1 } } }));
  await page.route('**/api/admin/users?**', route => route.fulfill({ json: { users: [staffUser], pagination: { page: 1, pages: 1, total: 1 } } }));
  await page.route('**/api/admin/cases/case1', route => {
    if (route.request().method() === 'PATCH') {
      const changes = route.request().postDataJSON();
      casePatches.push(changes);
      item = { ...item, ...changes };
    } else {
      detailFetches += 1;
    }
    return route.fulfill({ json: { case: item } });
  });
  await page.goto('/cases?case=case1');
  await expect(page.getByRole('heading', { name: 'Срочная жалоба' })).toBeVisible();
  await expect(page.getByText('Зафиксированное доказательство')).toBeVisible();
  await expect(page.getByText('Повторяющийся текст из исходного сообщения')).toBeVisible();
  await expect(page.getByText('@spammer · автор сообщения')).toBeVisible();
  await expect(page.locator('select[name="case-assignee"]')).toBeVisible();
  await expect(page.getByPlaceholder('Внутренняя заметка')).toBeVisible();
  await page.locator('select[name="case-status"]').selectOption('in_progress');
  await expect(page.locator('select[name="case-status"]')).toHaveValue('in_progress');
  await page.locator('select[name="case-priority"]').selectOption('high');
  await expect(page.locator('select[name="case-priority"]')).toHaveValue('high');
  expect(casePatches).toEqual([{ status: 'in_progress' }, { priority: 'high' }]);
  const fetchesBeforeReply = detailFetches;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('love-admin-update', { detail: {
    scope: 'cases', kind: 'user_reply', caseId: 'case1', status: 'triaged',
    updatedAt: new Date().toISOString(),
    note: {
      _id: 'note-live-1', body: 'Ответ появился без перезагрузки', internal: false,
      createdAt: new Date().toISOString(), author: { _id: 'user1', username: 'sigma' }
    }
  } })));
  await expect(page.getByText('Ответ появился без перезагрузки')).toBeVisible();
  expect(detailFetches).toBe(fetchesBeforeReply);
  item = { ...item, title: 'Срочная жалоба обновлена' };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('love-admin-update', { detail: { scope: 'cases' } })));
  await expect(page.getByRole('heading', { name: 'Срочная жалоба обновлена' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(duplicateKeyWarnings).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('case.png'), fullPage: true });
  const detailClose = page.getByRole('button', { name: 'Закрыть обращение' });
  if (await detailClose.isVisible()) await detailClose.click();
  else await page.getByRole('button', { name: 'Назад', exact: true }).click();
  await expect(page).not.toHaveURL(/(?:\?|&)case=/);
  await expect(page.getByRole('heading', { name: 'Срочная жалоба обновлена' })).toHaveCount(0);
});

test('message report back returns from review to the previous reason list', async ({ page }, testInfo) => {
  await page.setContent('<main></main>');
  await page.evaluate(() => {
    window.CasesAPI = {
      reportTaxonomy: async () => ({
        categories: [{
          id: 'abuse',
          label: 'Оскорбления и травля',
          children: [{
            id: 'public',
            label: 'Публичное унижение',
            children: [{ id: 'harassment', label: 'Насмешки', descriptionRequired: false }]
          }]
        }]
      }),
      reportMessage: async () => ({})
    };
    window.showToast = () => {};
  });
  await page.addStyleTag({ path: '../client/styles/style.css' });
  await page.addScriptTag({ path: '../client/js/new/message-reports.js' });
  await page.evaluate(() => window.openMessageReport({ messageId: 'message-1', author: 'SIGMA', preview: 'Текст сообщения' }));

  await page.getByRole('button', { name: /Оскорбления и травля/ }).click();
  await page.getByRole('button', { name: /Публичное унижение/ }).click();
  await page.getByRole('button', { name: /Насмешки/ }).click();
  await expect(page.getByRole('textbox', { name: /Описание/ })).toBeVisible();
  expect(await page.locator('.message-report-dialog').evaluate(element => parseFloat(getComputedStyle(element).borderRadius))).toBeGreaterThanOrEqual(14);
  await page.getByRole('button', { name: 'Назад' }).click();
  await expect(page.getByRole('button', { name: /Насмешки/ })).toBeVisible();
  await expect(page.getByText('Выберите наиболее точную причину')).toBeVisible();
  const backButton = page.getByRole('button', { name: 'Назад' });
  await page.mouse.move(1, 1);
  const restingBackground = await backButton.evaluate(element => getComputedStyle(element).backgroundColor);
  await backButton.hover();
  await expect.poll(() => backButton.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe(restingBackground);
  await page.screenshot({ path: testInfo.outputPath('message-report.png') });
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(page.locator('.message-report-backdrop')).toHaveCount(0);
});

test('cases move to the archive and can be restored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('love-admin-locale', 'en'));
  await mockSession(page);
  let status = 'triaged';
  const item = {
    _id: 'archive1', number: 'LOVE-ARCHIVE-1', kind: 'bug', title: 'Archive test',
    description: 'A complete bug report that should remain recoverable.', priority: 'normal',
    reporter: { _id: 'user1', username: 'sigma' }, tags: [], attachments: [], notes: [],
    createdAt: new Date().toISOString()
  };
  await page.route('**/api/admin/cases/archive1', async route => {
    if (route.request().method() === 'PATCH') status = route.request().postDataJSON().status;
    await route.fulfill({ json: { case: { ...item, status } } });
  });
  await page.route('**/api/admin/cases?**', route => {
    const requestedStatus = new URL(route.request().url()).searchParams.get('status');
    const visible = requestedStatus === 'archived' ? status === 'archived' : status !== 'archived';
    return route.fulfill({ json: { cases: visible ? [{ ...item, status }] : [], pagination: { page: 1, pages: 1, total: visible ? 1 : 0 } } });
  });
  page.on('dialog', dialog => dialog.accept());

  await page.goto('/cases?case=archive1');
  await page.getByTitle('Move to archive').click();
  await expect(page.getByText('Case moved to archive.')).toBeVisible();
  await expect(page.getByText('Archive test')).toHaveCount(0);

  await page.locator('select[name="case-status-filter"]').selectOption('archived');
  await page.getByRole('button', { name: 'Archive test', exact: false }).click();
  await page.getByTitle('Restore case to active queue').click();
  await expect(page.getByText('Case restored.')).toBeVisible();
  await expect(page.getByText('Archive test')).toHaveCount(0);
});
