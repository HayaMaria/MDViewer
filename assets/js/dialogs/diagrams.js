// ===== Диалоги «Настройка Mermaid диаграммы» и «Настройка UML диаграммы» =====
(function () {
  var MERMAID_PRESETS = {
    'flowchart TD': '    A[Начало] --> B{Условие}\n    B -- Да --> C[Действие]\n    B -- Нет --> D[Отмена]',
    'flowchart BT': '    A[1] --> B[2]\n    B --> C[3]',
    'flowchart LR': '    A[Вход] --> B[Обработка]\n    B --> C[Выход]',
    'flowchart RL': '    A[4] --> B[3]\n    B --> C[2]',
  };

  // Ключи с префиксом «nomnoml:» вставляются блоком ```nomnoml, остальные — ```mermaid
  var UML_PRESETS = {
    'sequenceDiagram': '    participant A as User\n    participant B as Server\n    A->>B: Request\n    B-->>A: Response',
    'classDiagram': '    class Animal {\n      +String name\n      +eat()\n    }\n    class Dog {\n      +bark()\n    }\n    Dog <|-- Animal',
    'stateDiagram': '    [*] --> Idle\n    Idle --> Running\n    Running --> [*]',
    'timeline': '    title History\n    2020: Launch\n    2021: Growth\n    2022: Leader',
    'nomnoml:useCase': '[User]\n[Admin]\n[User] -> [Login]\n[User] -> [View]\n[Admin] -> [Manage]',
    'nomnoml:activity': '[start] -> [Step 1]\n[Step 1] -> [Step 2]\n[Step 2] -> [end]',
    'nomnoml:component': '[Client] <-> [API]\n[API] <-> [Service A]\n[API] <-> [Service B]\n[Service A] <-> [(DB)]\n[Service B] <-> [(DB)]',
    'nomnoml:package': '[Client Layer]\n[Business Logic]\n[Data Layer]\n[Client Layer] <-> [Business Logic]\n[Business Logic] <-> [Data Layer]',
  };

  // При смене типа диаграммы подставляем пример в поле содержимого
  function bindPresets(selectId, textareaId, presets) {
    var select = document.getElementById(selectId);
    select.addEventListener('change', function () {
      if (presets[select.value]) document.getElementById(textareaId).value = presets[select.value];
    });
  }

  function insertDiagram(lang, header, content) {
    var body = trimBlankLines(content);
    insertText('\n```' + lang + '\n' + (header ? header + '\n' : '') + body + '\n```\n');
  }

  bindPresets('mermaid-type', 'mermaid-content', MERMAID_PRESETS);
  bindPresets('uml-type', 'uml-content', UML_PRESETS);

  window.runInsertMermaid = function () {
    insertDiagram('mermaid', document.getElementById('mermaid-type').value, document.getElementById('mermaid-content').value);
    closeModal('mermaid-config-overlay');
  };

  window.runInsertUml = function () {
    var type = document.getElementById('uml-type').value;
    var content = document.getElementById('uml-content').value;
    if (type.indexOf('nomnoml:') === 0) insertDiagram('nomnoml', '', content);
    else insertDiagram('mermaid', type, content);
    closeModal('uml-config-overlay');
  };
})();
