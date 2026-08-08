const b = (ru, en) => ({ ru, en });

const roleBase = {
  support: {
    title: b('Support', 'Support'),
    purpose: b('Помогает пользователю разобраться с проблемой и собирает достаточный контекст до передачи модератору.', 'Helps users resolve issues and gathers enough context before escalation.'),
    allowed: b('Обращения, ответы пользователю, внутренние заметки, идеи и баги. Доступ к данным ограничен задачей обращения.', 'Cases, user replies, internal notes, ideas and bugs. Data access is limited to the case purpose.'),
    forbidden: b('Выдавать наказания, обещать конкретный исход проверки, запрашивать пароль, код 2FA или полную переписку.', 'Issuing penalties, promising an outcome, requesting passwords, 2FA codes or an entire conversation.'),
    escalation: b('Угрозы, травля, мошенничество, спор о наказании, риск утечки данных и любая неоднозначная жалоба.', 'Threats, harassment, fraud, penalty disputes, data exposure and any ambiguous report.'),
    example: b('Пользователь пишет: «Меня оскорбили». Support уточняет место и время, просит приложить конкретное сообщение, фиксирует факты внутренней заметкой и передаёт модератору. Самостоятельно варн не выдаёт.', 'A user reports an insult. Support asks where and when it happened, requests the exact message, records the facts internally and escalates to moderation. Support does not issue a warning.')
  },
  junior_moderator: {
    title: b('Младший модератор', 'Junior moderator'),
    purpose: b('Рассматривает понятные жалобы с достаточными доказательствами и применяет минимальную соразмерную меру.', 'Handles clear reports with sufficient evidence and applies the minimum proportionate action.'),
    allowed: b('Предупреждение и мут до 24 часов, работа с доказательствами, внутренняя фиксация решения.', 'Warnings, mute up to 24 hours, evidence review and internal decision records.'),
    forbidden: b('Баны, апелляции, наказание равного или старшего сотрудника, решение собственного конфликта.', 'Bans, appeals, action against equal or senior staff, and decisions in personal conflicts.'),
    escalation: b('Повторное нарушение, серьёзная угроза, сомнение в подлинности доказательства или необходимость меры свыше 24 часов.', 'Repeat offenses, serious threats, uncertain evidence authenticity or action beyond 24 hours.'),
    example: b('Первое подтверждённое оскорбление без угроз: предупреждение с точной причиной. Продолжение агрессии после предупреждения: мут на несколько часов с привязкой к жалобе.', 'First confirmed insult without threats: a warning with a precise reason. Continued aggression after the warning: a short mute linked to the report.')
  },
  senior_moderator: {
    title: b('Старший модератор', 'Senior moderator'),
    purpose: b('Разбирает сложные и повторные нарушения, контролирует решения младших модераторов и независимо рассматривает апелляции.', 'Handles complex and repeat offenses, reviews junior decisions and independently considers appeals.'),
    allowed: b('Мут до 30 дней, бан до 7 дней, апелляции на чужие решения, контроль качества модерации.', 'Mute up to 30 days, ban up to 7 days, appeals against others’ decisions and moderation quality review.'),
    forbidden: b('Рассматривать апелляцию на собственное наказание или использовать старые нарушения без проверки их активности.', 'Reviewing an appeal against their own action or relying on expired history without verification.'),
    escalation: b('Постоянные ограничения, связанные аккаунты, утечка данных, систематическое злоупотребление сотрудника.', 'Permanent restrictions, linked-account risk, data exposure or systematic staff abuse.'),
    example: b('Пять активных предупреждений вызывают автоматический бан на 7 дней. Старший модератор проверяет корректность каждого предупреждения и оставляет понятный ответ по апелляции.', 'Five active warnings trigger a seven-day ban. The senior moderator verifies every warning and leaves a clear appeal decision.')
  },
  junior_admin: {
    title: b('Младший администратор', 'Junior administrator'),
    purpose: b('Отвечает за продолжительные ограничения, серверы, публикации и операционную часть сообщества.', 'Owns longer restrictions, servers, publishing and community operations.'),
    allowed: b('Постоянный мут, бан до 30 дней, серверы, контент, анонсы и аналитика в пределах роли.', 'Permanent mute, ban up to 30 days, servers, content, announcements and role-scoped analytics.'),
    forbidden: b('Постоянный бан, деактивация и использование IP/device-сигнала как самостоятельного доказательства.', 'Permanent bans, deactivation, or treating IP/device risk as standalone proof.'),
    escalation: b('Необратимые меры, серьёзный риск безопасности, спор между сотрудниками или массовый инцидент.', 'Irreversible action, serious security risk, staff disputes or a large-scale incident.'),
    example: b('Сервер систематически публикует запрещённый контент. Администратор сохраняет примеры, ограничивает публикацию, связывает действия с делом и передаёт вопрос о деактивации владельца выше.', 'A server repeatedly publishes prohibited content. The administrator preserves examples, restricts publishing, links actions to a case and escalates owner deactivation.')
  },
  senior_admin: {
    title: b('Старший администратор', 'Senior administrator'),
    purpose: b('Принимает решения по постоянным ограничениям и рискам аккаунтов, контролируя законность доступа к чувствительным данным.', 'Makes permanent-restriction and account-risk decisions while controlling sensitive-data access.'),
    allowed: b('Постоянный бан, деактивация, анализ входов и IP/device-риска, назначение ролей до старшего модератора.', 'Permanent ban, deactivation, login and IP/device risk review, role assignment up to senior moderator.'),
    forbidden: b('Автоматически блокировать связанные аккаунты только по совпадению IP или устройства.', 'Automatically blocking linked accounts based only on matching IP or device.'),
    escalation: b('Компрометация инфраструктуры, утечка, действия против высшего состава или необходимость удаления данных.', 'Infrastructure compromise, breach, action involving senior staff or data deletion.'),
    example: b('Два аккаунта имеют один device-сигнал. Это повод сравнить время входов и доказательства, но не основание для второго бана без самостоятельного нарушения.', 'Two accounts share a device signal. This warrants review of login timing and evidence, but not a second ban without an independent offense.')
  },
  deputy_developer: {
    title: b('Зам. разработчика', 'Deputy developer'),
    purpose: b('Контролирует аудит, инфраструктуру и старший состав, сохраняя защищённый контур разработчика.', 'Oversees audit, infrastructure and senior staff while preserving the developer’s protected boundary.'),
    allowed: b('Полный аудит, инфраструктурные проверки и назначение ролей до старшего администратора.', 'Full audit, infrastructure review and role assignment up to senior administrator.'),
    forbidden: b('Изменять защищённый аккаунт разработчика, скрывать собственные действия или удалять аудит.', 'Changing the protected developer account, hiding own actions or deleting audit records.'),
    escalation: b('Критическая утечка, потеря данных, компрометация ключей, окончательное удаление или конфликт высшего состава.', 'Critical breach, data loss, key compromise, final deletion or senior staff conflict.'),
    example: b('Обнаружена подозрительная серия входов администратора. Заместитель завершает сессии, сохраняет аудит, ограничивает роль при достаточных основаниях и уведомляет разработчика.', 'A suspicious series of administrator logins is detected. The deputy revokes sessions, preserves audit, restricts the role when justified and informs the developer.')
  },
  developer: {
    title: b('Разработчик', 'Developer'),
    purpose: b('Несёт окончательную ответственность за безопасность, архитектуру, команду и необратимые действия.', 'Holds final responsibility for security, architecture, staff and irreversible actions.'),
    allowed: b('Все действия, окончательное удаление, управление командой и документированные исключения.', 'All actions, final deletion, team management and documented exceptions.'),
    forbidden: b('Необъяснимые действия вне аудита, передача учётной записи, отключение защиты ради удобства.', 'Unexplained out-of-audit actions, account sharing or disabling protection for convenience.'),
    escalation: b('Формально выше Разработчика роли нет. При личном конфликте он привлекает Зам. разработчика и Старшего администратора как независимых проверяющих, фиксирует их заключения и своё окончательное решение в аудите.', 'No role is formally above Developer. In a personal conflict, the Developer involves a Deputy Developer and Senior Administrator as independent reviewers, records their findings and the final decision in audit.'),
    example: b('Апелляцию на собственное действие Разработчик не решает единолично: два независимых старших сотрудника оставляют заключения, после чего причина окончательного решения и любое исключение отдельно попадают в аудит.', 'The Developer does not decide an appeal against their own action alone: two independent senior staff members record findings, then the final reasoning and any override are separately audited.')
  }
};

const articles = [
  {
    slug: 'start', icon: 'start', group: 'general', readTime: 8,
    title: b('Начало работы', 'Getting started'),
    summary: b('Как безопасно начать смену, разобрать очередь и довести дело до понятного результата.', 'How to start a shift safely, triage the queue and reach a clear outcome.'),
    sections: [
      {
        title: b('Перед началом смены', 'Before the shift'),
        intro: b('Первые минуты нужны не для выдачи наказаний, а для проверки собственной сессии и состояния системы.', 'The first minutes are for checking your session and system state, not issuing penalties.'),
        steps: [
          b('Убедитесь, что адрес панели правильный, соединение защищено, а индикатор обновлений показывает LIVE.', 'Verify the admin address, secure connection and LIVE realtime indicator.'),
          b('Проверьте свою роль и отсутствие неожиданных входов в разделе настроек и аудита.', 'Check your role and any unexpected logins in Settings and Audit.'),
          b('Откройте критические обращения без исполнителя, затем назначенные вам.', 'Open unassigned critical cases, then cases assigned to you.'),
          b('Не продолжайте работу из общей учётной записи или с чужого устройства.', 'Never work from a shared account or an untrusted device.')
        ],
        callout: { tone: 'warning', title: b('Сессия выглядит подозрительно?', 'Suspicious session?'), text: b('Выйдите из панели, смените пароль, завершите другие сессии и сообщите старшему сотруднику. Не пытайтесь «быстро закончить дело».', 'Sign out, change the password, revoke other sessions and notify senior staff. Do not try to finish a case first.') }
      },
      {
        title: b('Порядок разбора очереди', 'Queue order'),
        table: {
          headers: [b('Очередь', 'Queue'), b('Что делать', 'Action'), b('Ожидаемый результат', 'Expected result')],
          rows: [
            [b('Критические', 'Critical'), b('Проверить немедленную угрозу и назначить исполнителя.', 'Check immediate risk and assign an owner.'), b('Риск локализован или передан выше.', 'Risk contained or escalated.')],
            [b('Апелляции', 'Appeals'), b('Проверить независимость рассматривающего и срок наказания.', 'Check reviewer independence and penalty status.'), b('Обоснованное принятие или отклонение.', 'Reasoned acceptance or rejection.')],
            [b('Поддержка', 'Support'), b('Ответить, какие данные нужны и когда будет следующий шаг.', 'Explain what is needed and the next step.'), b('Пользователь понимает статус дела.', 'User understands case status.')],
            [b('Баги и идеи', 'Bugs and ideas'), b('Убрать приватные данные, проверить дубликаты, классифицировать.', 'Remove private data, check duplicates and classify.'), b('Готово к проверке или публикации.', 'Ready for review or publishing.')]
          ]
        }
      },
      {
        title: b('Когда дело считается завершённым', 'When a case is complete'),
        bullets: [
          b('Факты и доказательства проверены, а не просто пересказаны.', 'Facts and evidence were verified, not merely repeated.'),
          b('Решение соответствует полномочиям сотрудника и связано с делом.', 'The decision fits staff authority and is linked to the case.'),
          b('Пользователь получил понятный ответ без внутренних данных.', 'The user received a clear answer without internal data.'),
          b('Статус, приоритет, исполнитель и заметки актуальны.', 'Status, priority, assignee and notes are current.')
        ]
      }
    ]
  },
  {
    slug: 'panels', icon: 'panels', group: 'general', readTime: 10,
    title: b('Разделы админ-панели', 'Admin sections'),
    summary: b('Что находится в каждом разделе, когда его открывать и какие действия особенно чувствительны.', 'What each section contains, when to use it and which actions are sensitive.'),
    sections: [
      {
        title: b('Карта панели', 'Panel map'),
        table: {
          headers: [b('Раздел', 'Section'), b('Назначение', 'Purpose'), b('Осторожно', 'Caution')],
          rows: [
            [b('Дашборд', 'Dashboard'), b('Срочные дела, онлайн и основные показатели.', 'Urgent cases, online and key metrics.'), b('График показывает тенденцию, а не доказательство нарушения.', 'Charts show trends, not evidence.')],
            [b('Пользователи', 'Users'), b('Профиль, история наказаний, серверы и риск-сигналы.', 'Profile, penalty history, servers and risk signals.'), b('Не открывайте данные без служебной причины.', 'Do not access data without a work reason.')],
            [b('Модерация', 'Moderation'), b('Единый журнал наказаний и отмен.', 'Immutable action and reversal log.'), b('Запись не удаляется; ошибка исправляется отменой.', 'Entries are not deleted; mistakes are reversed.')],
            [b('Обращения', 'Cases'), b('Жалобы, апелляции, поддержка, баги и идеи.', 'Reports, appeals, support, bugs and ideas.'), b('Внутренняя заметка не видна пользователю, публичный ответ виден.', 'Internal notes are private; public replies are visible.')],
            [b('Community', 'Community'), b('Идеи, баги, Dev Log и комментарии.', 'Ideas, bugs, Dev Log and comments.'), b('Перед публикацией очистите автора, диагностику и вложения.', 'Remove author, diagnostics and private attachments before publishing.')],
            [b('Команда', 'Team'), b('Роли и состояние принятия правил.', 'Roles and policy acceptance.'), b('В production изменение роли подтверждается Authenticator.', 'Production role changes require Authenticator.')],
            [b('Серверы', 'Servers'), b('Состояние сообществ и их владельцев.', 'Community and owner state.'), b('Мера против сервера и мера против владельца обосновываются отдельно.', 'Server and owner actions need separate reasoning.')],
            [b('Анонсы', 'Announcements'), b('Подготовка и публикация сообщений.', 'Drafting and publishing announcements.'), b('Проверьте аудиторию, дату и ссылки до отправки.', 'Verify audience, date and links before sending.')],
            [b('Аудит', 'Audit'), b('Кто, когда и что изменил.', 'Who changed what and when.'), b('Аудит нельзя использовать для публичного давления на сотрудника.', 'Audit must not be used for public pressure.')],
            [b('Инфраструктура', 'Infrastructure'), b('Состояние сервисов, индексов и защиты.', 'Service, index and security status.'), b('Изменения выполняет только уполномоченный старший состав.', 'Only authorized senior staff make changes.')]
          ]
        }
      },
      {
        title: b('Пример правильного перехода между разделами', 'Example cross-section workflow'),
        examples: [{
          title: b('Жалоба на пользователя', 'User report'),
          situation: b('В «Обращениях» есть доказательство спама и ссылка на пользователя.', 'A case contains spam evidence and a linked user.'),
          wrong: b('Открыть пользователя и сразу выдать максимальный бан.', 'Open the user and immediately issue the maximum ban.'),
          right: b('Назначить дело себе, проверить доказательство, открыть историю пользователя, выбрать соразмерную меру в «Пользователях», затем вернуться в дело и ответить пользователю.', 'Assign the case, verify evidence, inspect user history, choose a proportionate action in Users, return to the case and reply.'),
          outcome: b('Дело, наказание и ответ связаны и доступны аудиту.', 'Case, action and reply are linked and auditable.')
        }]
      }
    ]
  },
  {
    slug: 'cases', icon: 'cases', group: 'moderation', readTime: 12,
    title: b('Жалобы и доказательства', 'Reports and evidence'),
    summary: b('Полный путь обращения: назначение, проверка, заметки, статусы и закрытие.', 'The full case path: assignment, review, notes, statuses and closure.'),
    sections: [
      {
        title: b('Проверка доказательства', 'Evidence review'),
        steps: [
          b('Проверьте, относится ли вложение к указанному пользователю, времени и месту.', 'Verify that the attachment matches the stated user, time and location.'),
          b('Читайте только контекст, приложенный к жалобе. Не просматривайте другие диалоги «на всякий случай».', 'Read only context attached to the report. Do not browse unrelated conversations.'),
          b('Отделите наблюдаемый факт от вывода автора жалобы.', 'Separate observable facts from the reporter’s interpretation.'),
          b('Проверьте возможное редактирование, обрезку и отсутствие ключевого контекста.', 'Check for editing, cropping and missing critical context.'),
          b('Если доказательства недостаточны, запросите конкретное дополнение или закройте без наказания.', 'If evidence is insufficient, request a specific addition or close without action.')
        ]
      },
      {
        title: b('Статусы обращения', 'Case statuses'),
        table: {
          headers: [b('Статус', 'Status'), b('Когда ставить', 'When to use'), b('Следующий шаг', 'Next step')],
          rows: [
            [b('Новое', 'New'), b('Ещё никто не проверял.', 'Not reviewed yet.'), b('Назначить и провести первичную оценку.', 'Assign and triage.')],
            [b('Разобрано', 'Triaged'), b('Тип и приоритет понятны.', 'Type and priority are clear.'), b('Собрать факты или выполнить действие.', 'Gather facts or act.')],
            [b('В работе', 'In progress'), b('Сотрудник активно ведёт проверку.', 'A staff member is actively investigating.'), b('Зафиксировать промежуточный результат.', 'Record intermediate findings.')],
            [b('Ждём пользователя', 'Waiting for user'), b('Нужно конкретное уточнение.', 'A specific user response is needed.'), b('Указать, что именно и зачем требуется.', 'Explain exactly what and why is needed.')],
            [b('Решено', 'Resolved'), b('Проверка закончена и ответ отправлен.', 'Review and response are complete.'), b('Убедиться, что история понятна.', 'Ensure the history is clear.')],
            [b('Отклонено', 'Rejected'), b('Запрос не подтверждён или нарушает правила подачи.', 'The request is unsupported or invalid.'), b('Объяснить причину без обвинений.', 'Explain why without accusations.')],
            [b('Архив', 'Archived'), b('Запись хранится без активной работы.', 'Record retained without active work.'), b('Не использовать вместо решения.', 'Do not use instead of a decision.')]
          ]
        }
      },
      {
        title: b('Примеры', 'Examples'),
        examples: [
          { title: b('Обрезанный скриншот', 'Cropped screenshot'), situation: b('На скриншоте видна грубая фраза, но нет автора и времени.', 'A screenshot shows abusive text but no author or timestamp.'), wrong: b('Выдать варн по тексту на изображении.', 'Issue a warning from the text alone.'), right: b('Запросить ссылку на сообщение или полное доказательство с автором и временем.', 'Request a message link or complete evidence with author and time.'), outcome: b('До подтверждения наказание не выдаётся.', 'No action until verified.') },
          { title: b('Признание пользователя', 'User admission'), situation: b('Пользователь признаёт спам, но утверждает, что это была ошибка.', 'A user admits spam but says it was accidental.'), wrong: b('Игнорировать доказательство из-за извинения.', 'Ignore evidence because of an apology.'), right: b('Учитывать факт, масштаб, повторяемость и историю; извинение влияет на меру, но не отменяет факт.', 'Consider fact, scale, repetition and history; an apology may affect severity but not erase the event.'), outcome: b('Выбирается минимальная достаточная мера.', 'Apply the minimum sufficient action.') }
        ]
      }
    ]
  },
  {
    slug: 'actions', icon: 'actions', group: 'moderation', readTime: 14,
    title: b('Выбор наказания', 'Choosing an action'),
    summary: b('Как выбрать предупреждение, мут, бан или деактивацию и не превысить полномочия.', 'How to choose a warning, mute, ban or deactivation without exceeding authority.'),
    sections: [
      {
        title: b('Алгоритм решения', 'Decision algorithm'),
        steps: [
          b('Назовите конкретное правило и подтверждённое действие пользователя.', 'Identify the exact rule and confirmed user action.'),
          b('Оцените вред, намерение, масштаб, повторяемость и активную историю.', 'Assess harm, intent, scale, repetition and active history.'),
          b('Выберите самую мягкую меру, которая реально остановит нарушение.', 'Choose the least severe action that will stop the behavior.'),
          b('Проверьте лимит своей роли и отсутствие конфликта интересов.', 'Check role limits and conflicts of interest.'),
          b('Напишите причину так, чтобы её понял пользователь и независимый проверяющий.', 'Write a reason clear to both the user and an independent reviewer.')
        ]
      },
      {
        title: b('Матрица мер', 'Action matrix'),
        table: {
          headers: [b('Мера', 'Action'), b('Подходит', 'Use when'), b('Не подходит', 'Do not use when')],
          rows: [
            [b('Предупреждение', 'Warning'), b('Первое понятное нарушение без немедленного серьёзного риска.', 'First clear offense without immediate serious risk.'), b('Факт не доказан или требуется немедленно остановить общение.', 'Evidence is insufficient or communication must stop immediately.')],
            [b('Мут', 'Mute'), b('Само общение создаёт риск: флуд, травля, продолжение агрессии.', 'Communication itself creates risk: flooding, harassment or ongoing aggression.'), b('Нужно защитить аккаунт от входа или пользователь уже прекратил действие.', 'Account access must be blocked or behavior has already stopped.')],
            [b('Временный бан', 'Temporary ban'), b('Тяжёлое или повторное нарушение, когда чтения и апелляции достаточно.', 'Serious or repeat offense where read-only access and appeal remain sufficient.'), b('Есть только слабый IP/device-сигнал.', 'Only a weak IP/device signal exists.')],
            [b('Постоянный бан', 'Permanent ban'), b('Систематический тяжёлый вред после проверки старшим составом.', 'Systematic severe harm after senior review.'), b('Нужно просто «проучить» пользователя или решение можно сделать обратимым.', 'The goal is punishment itself or a reversible action is sufficient.')],
            [b('Деактивация', 'Deactivation'), b('Аккаунт должен быть выведен из эксплуатации по безопасности или правилам платформы.', 'The account must be taken out of service for security or platform-policy reasons.'), b('Обычный спор, единичная грубость или недостаток доказательств.', 'Ordinary disputes, a single insult or insufficient evidence.')]
          ]
        }
      },
      {
        title: b('Шкала активных предупреждений', 'Active warning thresholds'),
        intro: b('Предупреждение активно 90 дней. Отмена предупреждения исключает его из шкалы.', 'A warning stays active for 90 days. A reversal removes it from the threshold.'),
        table: {
          headers: [b('Количество', 'Count'), b('Результат', 'Result'), b('Действие сотрудника', 'Staff action')],
          rows: [
            [b('1–2', '1–2'), b('Статус пользователя ухудшается без автоматической блокировки.', 'Standing declines without automatic restriction.'), b('Объяснить правило и следить за повтором.', 'Explain the rule and monitor repetition.')],
            [b('3', '3'), b('Автоматический мут на 24 часа.', 'Automatic 24-hour mute.'), b('Проверить, что все три предупреждения активны и корректны.', 'Verify all three warnings are active and valid.')],
            [b('5', '5'), b('Автоматический бан на 7 дней.', 'Automatic seven-day ban.'), b('Старший модератор проверяет историю и возможную апелляцию.', 'Senior moderator reviews history and any appeal.')],
            [b('7', '7'), b('Критическое дело о возможном бессрочном бане.', 'Critical case for possible permanent ban.'), b('Решение принимает уполномоченный старший сотрудник, автоматического вечного бана нет.', 'Authorized senior staff decide; there is no automatic permanent ban.')]
          ]
        }
      },
      {
        title: b('Примеры выбора', 'Decision examples'),
        examples: [
          { title: b('Первый флуд', 'First flooding offense'), situation: b('Пользователь отправил много одинаковых сообщений и остановился после замечания.', 'A user sent many duplicate messages and stopped after being told.'), wrong: b('Бан на 7 дней «для профилактики».', 'Seven-day ban as a deterrent.'), right: b('Предупреждение; при продолжающемся флуде — короткий мут.', 'Warning; short mute if flooding continues.'), outcome: b('Мера соответствует фактическому риску.', 'Action matches actual risk.') },
          { title: b('Угроза публикации адреса', 'Threat to publish an address'), situation: b('Есть подтверждённая конкретная угроза и персональные данные.', 'A specific verified threat includes personal data.'), wrong: b('Обычный варн и закрытие дела.', 'A simple warning and closure.'), right: b('Немедленно ограничить возможность публикации в пределах полномочий, сохранить доказательство и передать старшему сотруднику.', 'Immediately restrict publishing within authority, preserve evidence and escalate.'), outcome: b('Риск остановлен, окончательная мера рассматривается отдельно.', 'Risk is contained and final action reviewed separately.') }
        ]
      }
    ]
  },
  {
    slug: 'appeals', icon: 'appeals', group: 'moderation', readTime: 9,
    title: b('Апелляции', 'Appeals'),
    summary: b('Независимая проверка наказания, принятие, отклонение и корректный ответ пользователю.', 'Independent penalty review, acceptance, rejection and clear user response.'),
    sections: [
      {
        title: b('Обязательные проверки', 'Required checks'),
        steps: [
          b('Убедитесь, что наказание активно и на него ещё не было апелляции.', 'Confirm the action is active and has not already been appealed.'),
          b('Выдавший наказание не рассматривает собственную апелляцию. Исключение разработчика явно подтверждается и аудируется.', 'The issuer cannot review their own action. A developer override must be explicit and audited.'),
          b('Сравните исходное доказательство, причину, срок и новые аргументы пользователя.', 'Compare original evidence, reason, duration and new user arguments.'),
          b('Проверьте полномочия и соразмерность, а не личность сотрудника.', 'Review authority and proportionality, not the staff member’s personality.'),
          b('Ответьте, какой факт оказался решающим.', 'State which fact determined the outcome.')
        ]
      },
      {
        title: b('Примеры решений', 'Decision examples'),
        examples: [
          { title: b('Апелляция принята', 'Appeal accepted'), situation: b('Ссылка в доказательстве ведёт на сообщение другого пользователя.', 'The evidence link points to another user’s message.'), wrong: b('Отклонить, потому что «модератор обычно не ошибается».', 'Reject because moderators are usually right.'), right: b('Принять, снять наказание, указать ошибку идентификации и оставить внутреннюю заметку для проверки процесса.', 'Accept, reverse the action, identify the attribution error and add an internal process note.'), outcome: b('Наказание отменено, аудит сохранён.', 'Action reversed and audit preserved.') },
          { title: b('Апелляция отклонена', 'Appeal rejected'), situation: b('Пользователь только извиняется, но не оспаривает подтверждённый факт и срок соразмерен.', 'The user only apologizes; the confirmed fact and proportionate duration are undisputed.'), wrong: b('Ответить «нет» без объяснения.', 'Reply “no” without explanation.'), right: b('Спокойно указать подтверждённое действие, правило, срок окончания и право обратиться в поддержку по другой проблеме.', 'Calmly state the confirmed action, rule, end time and support options for other issues.'), outcome: b('Решение понятно и проверяемо.', 'Decision is clear and reviewable.') }
        ]
      }
    ]
  },
  {
    slug: 'communication', icon: 'communication', group: 'moderation', readTime: 8,
    title: b('Общение с пользователем', 'User communication'),
    summary: b('Как писать понятно, спокойно и без раскрытия внутренних данных.', 'How to write clearly and calmly without exposing internal data.'),
    sections: [
      {
        title: b('Формула хорошего ответа', 'A good response formula'),
        steps: [
          b('Подтвердите, что поняли запрос: одна короткая фраза.', 'Acknowledge the request in one short sentence.'),
          b('Назовите проверенный факт или недостающую информацию.', 'State the verified fact or missing information.'),
          b('Опишите выполненное действие или следующий шаг.', 'Describe the action taken or next step.'),
          b('Укажите срок, если он известен, и не обещайте результат до проверки.', 'Give timing if known and do not promise an outcome before review.')
        ]
      },
      {
        title: b('Шаблоны', 'Templates'),
        examples: [
          { title: b('Нужно уточнение', 'More information needed'), situation: b('Не хватает ссылки на конкретное сообщение.', 'The exact message link is missing.'), wrong: b('«Скиньте нормальные пруфы».', '“Send proper proof.”'), right: b('«Спасибо за обращение. Чтобы проверить жалобу, пришлите ссылку на конкретное сообщение и примерное время отправки. Полную переписку присылать не нужно.»', '“Thank you. To review the report, send the exact message link and approximate time. You do not need to share the full conversation.”'), outcome: b('Пользователь понимает, что требуется и зачем.', 'The user knows what is needed and why.') },
          { title: b('Решение по жалобе', 'Report outcome'), situation: b('Проверка завершена, но детали чужого наказания приватны.', 'Review is complete, but another user’s penalty details are private.'), wrong: b('Раскрыть срок и историю нарушителя.', 'Disclose duration and the offender’s history.'), right: b('«Проверка завершена. Мы приняли меры в соответствии с правилами Love. Подробности чужого аккаунта и наказания не раскрываются.»', '“The review is complete and action was taken under Love rules. Details of another account and its action remain private.”'), outcome: b('Есть результат без утечки данных.', 'There is a clear outcome without a privacy breach.') }
        ]
      },
      {
        title: b('Внутренняя заметка', 'Internal note'),
        callout: { tone: 'info', title: b('Пишите так, будто заметку позже проверит аудит', 'Write as if audit will review it later'), text: b('Фиксируйте источники, сомнения и логику решения. Не используйте оскорбления, диагнозы, насмешки или сведения, не относящиеся к делу.', 'Record sources, uncertainty and reasoning. Never use insults, diagnoses, mockery or unrelated personal information.') }
      }
    ]
  },
  {
    slug: 'staff-comms', icon: 'communication', group: 'team', readTime: 12,
    title: b('Связь сотрудников', 'Staff communications'),
    summary: b('Общий и личные чаты, передача дел, файлы, удаление сообщений и голосовые комнаты.', 'General and direct chats, handoffs, files, deleted messages and voice rooms.'),
    sections: [
      {
        title: b('Как выбирать канал связи', 'Choosing a channel'),
        table: {
          headers: [b('Инструмент', 'Tool'), b('Использовать для', 'Use for'), b('Не размещать', 'Do not post')],
          rows: [
            [b('Общий чат', 'General chat'), b('Смены, общие вопросы, координация и объявления команды.', 'Shift coordination, general questions and staff announcements.'), b('Пароли, коды 2FA, полные пользовательские переписки и секреты инфраструктуры.', 'Passwords, 2FA codes, full user conversations or infrastructure secrets.')],
            [b('Личный чат', 'Direct chat'), b('Рабочее обсуждение, относящееся только к двум сотрудникам.', 'Work discussion relevant only to two staff members.'), b('Решение, которое должно остаться только в личной договорённости.', 'A decision that exists only as a private agreement.')],
            [b('Передача дела', 'Case handoff'), b('Запрос помощи у более высокой роли с номером дела и краткой причиной.', 'Requesting help from a higher role with case number and concise reason.'), b('Эмоциональный пересказ без фактов и ожидаемого действия.', 'An emotional retelling without facts or requested action.')],
            [b('Голос', 'Voice'), b('Оперативное обсуждение; итог всё равно фиксируется текстом в деле.', 'Live coordination; the outcome must still be recorded in the case.'), b('Единственную копию решения или доказательства.', 'The only copy of a decision or evidence.')]
          ]
        }
      },
      {
        title: b('Сообщения, файлы и удаление', 'Messages, files and deletion'),
        steps: [
          b('Отвечайте на конкретное сообщение, когда обсуждение может быть неоднозначным.', 'Reply to the exact message when context may be ambiguous.'),
          b('Перед отправкой файла проверьте, что он нужен для работы и не содержит лишних данных.', 'Before sharing a file, verify it is necessary and contains no unrelated data.'),
          b('Редактирование используйте для исправления, а не для изменения уже принятого решения без пояснения.', 'Use editing for corrections, not to silently change a recorded decision.'),
          b('После удаления обычные сотрудники видят заглушку. Старший администратор и выше видят исходный текст с пометкой «удалено»; действие остаётся в аудите.', 'After deletion, regular staff see a tombstone. Senior Administrators and above see the original marked deleted; audit remains.'),
          b('Если сообщение связано с решением по пользователю, перенесите итог в карточку обращения.', 'If a message affects a user decision, record the outcome in the case.')
        ]
      },
      {
        title: b('Передача выше', 'Escalation'),
        examples: [
          { title: b('Support не уверен в жалобе', 'Support is unsure about a report'), situation: b('Есть сообщение с возможной угрозой, но контекст неоднозначен.', 'A message may contain a threat, but context is ambiguous.'), wrong: b('Самостоятельно пообещать бан или переслать всю переписку в общий чат.', 'Promise a ban or forward the full conversation to general chat.'), right: b('Создать передачу младшему модератору, указать номер дела, наблюдаемый текст и конкретный вопрос.', 'Create a handoff to Junior Moderator with case number, observed text and exact question.'), outcome: b('Ответственность и контекст переданы без лишнего доступа.', 'Ownership and context move without unnecessary access.') },
          { title: b('Старший сотрудник занят', 'Senior staff is busy'), situation: b('Передача ещё не принята, а немедленного риска нет.', 'The handoff is unclaimed and there is no immediate risk.'), wrong: b('Создавать одинаковые передачи всем ролям.', 'Create duplicate handoffs to every role.'), right: b('Оставить одну передачу нужной минимальной роли и добавить обновление при появлении нового факта.', 'Leave one handoff to the minimum required role and update it only with new facts.'), outcome: b('Очередь остаётся понятной и без дублей.', 'The queue stays clear and deduplicated.') }
        ]
      },
      {
        title: b('Голосовые комнаты', 'Voice rooms'),
        table: {
          headers: [b('Комната', 'Room'), b('Постоянный доступ', 'Standing access'), b('Временный вход', 'Temporary access')],
          rows: [
            [b('Support', 'Support'), b('Все сотрудники.', 'All staff.'), b('Не требуется.', 'Not required.')],
            [b('Модераторы', 'Moderators'), b('Младший модератор и выше.', 'Junior Moderator and above.'), b('Старший участник комнаты может пригласить нижестоящего.', 'A senior room participant may invite lower staff.')],
            [b('Администраторы', 'Administrators'), b('Младший администратор и выше.', 'Junior Administrator and above.'), b('Для собеседования, обучения или конкретного инцидента.', 'For interviews, coaching or a specific incident.')],
            [b('Руководство', 'Leadership'), b('Старший администратор и выше.', 'Senior Administrator and above.'), b('Только по явному приглашению старшего участника.', 'Only by an explicit senior invitation.')]
          ]
        },
        callout: { tone: 'warning', title: b('Перемещение не повышает роль', 'Moving does not grant a role'), text: b('Временное приглашение действует только для комнаты и задачи. Оно не даёт дополнительных прав в пользователях, делах или модерации.', 'A temporary invite applies only to that room and task. It grants no additional user, case or moderation permissions.') }
      }
    ]
  },
  {
    slug: 'incidents', icon: 'incidents', group: 'moderation', readTime: 11,
    title: b('Сложные ситуации', 'Complex situations'),
    summary: b('Что делать при угрозах, утечках, массовом спаме, взломе и конфликте интересов.', 'What to do with threats, breaches, spam raids, compromise and conflicts of interest.'),
    sections: [
      {
        title: b('Порядок реакции', 'Response order'),
        steps: [
          b('Сначала остановите продолжающийся вред доступной обратимой мерой.', 'First stop ongoing harm with an available reversible action.'),
          b('Сохраните минимально необходимое доказательство и время события.', 'Preserve the minimum necessary evidence and timestamp.'),
          b('Не проводите самостоятельное расследование за пределами Love.', 'Do not investigate beyond Love systems on your own.'),
          b('Передайте дело сотруднику нужного уровня и зафиксируйте передачу.', 'Escalate to the appropriate role and record the handoff.'),
          b('Не обещайте пользователю юридический или технический результат.', 'Do not promise legal or technical outcomes.')
        ]
      },
      {
        title: b('Сценарии', 'Scenarios'),
        examples: [
          { title: b('Компрометация аккаунта', 'Account compromise'), situation: b('Владелец сообщает о чужих входах и неожиданных сообщениях.', 'The owner reports unknown logins and unexpected messages.'), wrong: b('Сразу удалить аккаунт и историю.', 'Immediately delete the account and history.'), right: b('Защитить доступ, завершить сессии, сохранить данные входов, помочь восстановить аккаунт и передать подозрительную активность старшему администратору.', 'Secure access, revoke sessions, preserve login records, help recovery and escalate suspicious activity.'), outcome: b('Аккаунт защищён без уничтожения доказательств.', 'Account is secured without destroying evidence.') },
          { title: b('Массовый спам на сервере', 'Server spam raid'), situation: b('Несколько новых аккаунтов одновременно публикуют одинаковые ссылки.', 'Several new accounts post identical links at once.'), wrong: b('Банить всех пользователей сервера и связанные IP.', 'Ban every server user and related IPs.'), right: b('Ограничить текущую публикацию, сохранить образцы, проверить координацию и рассматривать каждый связанный аккаунт по собственным действиям.', 'Restrict ongoing posting, preserve samples, examine coordination and assess each linked account by its own actions.'), outcome: b('Инцидент локализован без массового ошибочного наказания.', 'Incident contained without broad false positives.') },
          { title: b('Личный конфликт', 'Personal conflict'), situation: b('Жалоба относится к другу, оппоненту или вашему собственному спору.', 'The report involves a friend, opponent or your own dispute.'), wrong: b('Решить самому, потому что «факты очевидны».', 'Decide it yourself because the facts seem obvious.'), right: b('Не выполнять действие, оставить нейтральную заметку о конфликте и передать независимому сотруднику.', 'Take no action, note the conflict neutrally and reassign to independent staff.'), outcome: b('Решение не зависит от личной заинтересованности.', 'Decision is independent of personal interest.') }
        ]
      }
    ]
  },
  {
    slug: 'conduct', icon: 'conduct', group: 'team', readTime: 10,
    title: b('Правила команды', 'Staff conduct'),
    summary: b('Запрет злоупотреблений, ответственность сотрудников и порядок сообщения о нарушении модерации.', 'Abuse prevention, staff accountability and reporting staff misconduct.'),
    sections: [
      {
        title: b('Что запрещено', 'Prohibited conduct'),
        bullets: [
          b('Наказывать из личной неприязни, ради шутки, демонстрации власти или по просьбе знакомого.', 'Acting from personal hostility, as a joke, to demonstrate power or for a friend.'),
          b('Просматривать данные, переписку, входы или риск-сигналы без служебной причины.', 'Accessing data, messages, logins or risk signals without a work reason.'),
          b('Разглашать доказательства, внутренние заметки, личные данные и сведения об инфраструктуре.', 'Disclosing evidence, internal notes, personal data or infrastructure details.'),
          b('Обходить пределы роли через другого сотрудника или делить учётную запись.', 'Bypassing role limits through another staff member or sharing accounts.'),
          b('Скрывать ошибку, удалять контекст или давить на автора апелляции.', 'Hiding errors, removing context or pressuring an appellant.')
        ]
      },
      {
        title: b('Последствия', 'Consequences'),
        table: {
          headers: [b('Уровень', 'Level'), b('Пример', 'Example'), b('Возможная мера', 'Possible response')],
          rows: [
            [b('Ошибка процесса', 'Process mistake'), b('Неполная заметка без вреда.', 'Incomplete note without harm.'), b('Разбор и предупреждение сотруднику.', 'Coaching and staff warning.')],
            [b('Повторная небрежность', 'Repeated negligence'), b('Регулярные решения без проверки.', 'Repeated decisions without verification.'), b('Временное ограничение полномочий или понижение.', 'Temporary permission restriction or demotion.')],
            [b('Злоупотребление', 'Abuse'), b('Наказание из личного конфликта, просмотр данных из любопытства.', 'Personal-conflict action or curiosity access.'), b('Снятие роли и отдельное расследование.', 'Role removal and separate investigation.')],
            [b('Критическое нарушение', 'Critical misconduct'), b('Утечка данных, передача доступа, сокрытие аудита.', 'Data breach, access sharing or audit concealment.'), b('Немедленное снятие, завершение сессий и эскалация разработчику.', 'Immediate removal, session revocation and developer escalation.')]
          ]
        }
      },
      {
        title: b('Как сообщить о сотруднике', 'How to report staff'),
        steps: [
          b('Не обсуждайте подозрение публично и не предупреждайте сотрудника, если это может уничтожить доказательства.', 'Do not discuss suspicions publicly or warn staff if evidence may be destroyed.'),
          b('Запишите ID действия, время, фактическое наблюдение и возможный конфликт.', 'Record action ID, time, observed facts and any conflict.'),
          b('Передайте материал сотруднику выше предполагаемого нарушителя или разработчику.', 'Escalate above the suspected staff member or to the developer.'),
          b('Не проводите ответные действия вне своих полномочий.', 'Do not take retaliatory action outside your authority.')
        ]
      }
    ]
  },
  {
    slug: 'security', icon: 'security', group: 'team', readTime: 9,
    title: b('Безопасность сотрудника', 'Staff security'),
    summary: b('2FA, сессии, устройства, данные и действия при подозрении на взлом.', '2FA, sessions, devices, data and compromise response.'),
    sections: [
      {
        title: b('Обязательные правила', 'Mandatory rules'),
        bullets: [
          b('Authenticator и резервные коды принадлежат только владельцу аккаунта. Резервные коды храните вне браузера.', 'Authenticator and recovery codes belong only to the account owner. Store recovery codes outside the browser.'),
          b('Не вводите коды по ссылке из сообщения. Открывайте админку самостоятельно по известному адресу.', 'Never enter codes through a message link. Open the known admin address yourself.'),
          b('Не оставляйте открытую панель на общем устройстве и завершайте сессию после работы.', 'Never leave the panel open on a shared device and sign out after work.'),
          b('Не копируйте пользовательские данные в личные заметки, мессенджеры и сторонние сервисы.', 'Do not copy user data into personal notes, messengers or third-party services.')
        ]
      },
      {
        title: b('Если доступ мог быть украден', 'If access may be stolen'),
        steps: [
          b('Немедленно завершите доступные сессии и смените пароль с доверенного устройства.', 'Immediately revoke sessions and change the password from a trusted device.'),
          b('Сообщите старшему сотруднику или разработчику точное время подозрения.', 'Notify senior staff or the developer with the exact suspected time.'),
          b('Проверьте аудит действий, но ничего не удаляйте и не исправляйте задним числом.', 'Review audit activity but delete nothing and do not rewrite history.'),
          b('Перевыпустите 2FA и резервные коды после проверки устройства.', 'Re-enroll 2FA and recovery codes after checking the device.')
        ],
        callout: { tone: 'danger', title: b('Love никогда не просит код 2FA в чате', 'Love never asks for a 2FA code in chat'), text: b('Код вводится только в форме входа или подтверждения чувствительного действия внутри панели.', 'Codes are entered only in the login form or a sensitive-action confirmation inside the panel.') }
      }
    ]
  }
];

const roleArticles = Object.entries(roleBase).map(([role, guide]) => ({
  slug: `roles/${role}`,
  icon: 'role',
  group: 'roles',
  readTime: 7,
  title: guide.title,
  summary: guide.purpose,
  role,
  sections: [
    { title: b('Задача должности', 'Role purpose'), intro: guide.purpose },
    {
      title: b('Полномочия и границы', 'Authority and boundaries'),
      table: {
        headers: [b('Можно', 'Allowed'), b('Нельзя', 'Not allowed'), b('Передать выше', 'Escalate')],
        rows: [[guide.allowed, guide.forbidden, guide.escalation]]
      }
    },
    {
      title: b('Рабочий порядок', 'Working routine'),
      steps: [
        b('Проверить очередь и выбрать задачу в пределах своей роли.', 'Check the queue and select work within role scope.'),
        b('Назначить дело себе и зафиксировать проверенные факты.', 'Assign the case and record verified facts.'),
        b('Выполнить только разрешённое действие либо передать выше с объяснением.', 'Take only an authorized action or escalate with an explanation.'),
        b('Оставить понятный ответ пользователю и проверить аудит действия.', 'Leave a clear user response and verify the audit record.')
      ]
    },
    {
      title: b('Практический пример', 'Practical example'),
      examples: [{ title: guide.title, situation: guide.example, wrong: guide.forbidden, right: guide.allowed, outcome: guide.escalation }]
    }
  ]
}));

export const documentationArticles = [...articles, ...roleArticles];

export const documentationGroups = [
  { id: 'general', title: b('Основы', 'Basics') },
  { id: 'moderation', title: b('Работа с обращениями', 'Case work') },
  { id: 'roles', title: b('Должности', 'Roles') },
  { id: 'team', title: b('Команда и безопасность', 'Team and security') }
];

export function localize(value, locale) {
  return value?.[locale] || value?.ru || value || '';
}
