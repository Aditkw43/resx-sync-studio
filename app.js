// ============================================
// Application State
// ============================================
const AppState = {
    filePairs: [],
    syncModes: {
        fillEmpty: false,
        addMissing: false,
        updateDiff: false
    },
    changes: [],
    pairCounter: 0,
    batchFiles: [],
    batchRole: null
};

// ============================================
// DOM References
// ============================================
let DOM = {};

function initDOMReferences() {
    DOM = {
        filePairsContainer: document.getElementById('filePairsContainer'),
        emptyState: document.getElementById('emptyState'),
        addPairBtn: document.getElementById('addPairBtn'),
        batchPairBtn: document.getElementById('batchPairBtn'),
        clearAllBtn: document.getElementById('clearAllBtn'),
        analyzeBtn: document.getElementById('analyzeBtn'),
        statsSection: document.getElementById('statsSection'),
        previewSection: document.getElementById('previewSection'),
        actionsSection: document.getElementById('actionsSection'),
        previewContainer: document.getElementById('previewContainer'),
        activeModesDisplay: document.getElementById('activeModesDisplay'),
        modeToggles: document.querySelectorAll('.mode-toggle'),
        statTotal: document.getElementById('statTotal'),
        statFilled: document.getElementById('statFilled'),
        statAdded: document.getElementById('statAdded'),
        statUpdated: document.getElementById('statUpdated'),
        statToApply: document.getElementById('statToApply'),
        statSkipped: document.getElementById('statSkipped'),
        applyAllBtn: document.getElementById('applyAllBtn'),
        skipAllBtn: document.getElementById('skipAllBtn'),
        downloadZipBtn: document.getElementById('downloadZipBtn'),
        downloadExcelBtn: document.getElementById('downloadExcelBtn'),
        // Modal elements
        batchModal: document.getElementById('batchModal'),
        modalBackdrop: document.getElementById('modalBackdrop'),
        closeModalBtn: document.getElementById('closeModalBtn'),
        batchDropZone: document.getElementById('batchDropZone'),
        batchFileInput: document.getElementById('batchFileInput'),
        batchDropContent: document.getElementById('batchDropContent'),
        batchFilesList: document.getElementById('batchFilesList'),
        batchFilesContainer: document.getElementById('batchFilesContainer'),
        clearBatchFilesBtn: document.getElementById('clearBatchFilesBtn'),
        batchValidationMsg: document.getElementById('batchValidationMsg'),
        cancelBatchBtn: document.getElementById('cancelBatchBtn'),
        submitBatchBtn: document.getElementById('submitBatchBtn'),
        fileRoleInputs: document.querySelectorAll('input[name="fileRole"]')
    };
}

function showLoading(message = "Processing...") {
    const overlay = document.getElementById("loadingOverlay");
    const text = document.getElementById("loadingText");

    if (text) text.textContent = message;
    if (overlay) overlay.classList.remove("hidden");
}

function hideLoading() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.classList.add("hidden");
}

// ============================================
// RESX Parser
// ============================================
const RESXParser = {
    parse(content) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/xml');
        const dataNodes = doc.querySelectorAll('data');
        const resources = new Map();

        dataNodes.forEach(node => {
            const name = node.getAttribute('name');
            const valueNode = node.querySelector('value');
            const value = valueNode ? valueNode.textContent : '';

            const attributes = {};
            for (const attr of node.attributes) {
                attributes[attr.name] = attr.value;
            }

            resources.set(name, {
                name,
                value,
                attributes,
                comment: node.querySelector('comment')?.textContent || ''
            });
        });

        return { resources, doc };
    },

    serialize(resources, originalDoc) {
        const serializer = new XMLSerializer();
        const newDoc = originalDoc.cloneNode(true);
        const root = newDoc.documentElement;

        resources.forEach((resource, key) => {
            let dataNode = root.querySelector(`data[name="${CSS.escape(key)}"]`);

            if (dataNode) {
                // UPDATE VALUE ONLY
                let valueNode = dataNode.querySelector('value');
                if (!valueNode) {
                    valueNode = newDoc.createElement('value');
                    dataNode.appendChild(valueNode);
                }

                valueNode.textContent = resource.value;

            } else {
                // ADD MISSING — append minimal structure
                const newDataNode = newDoc.createElement('data');
                newDataNode.setAttribute('name', key);
                newDataNode.setAttribute('xml:space', 'preserve');

                const valueNode = newDoc.createElement('value');
                valueNode.textContent = resource.value;

                newDataNode.appendChild(valueNode);
                root.appendChild(newDataNode);
            }
        });

        return serializer.serializeToString(newDoc);
    }
};

// ============================================
// Sync Engine
// ============================================
const SyncEngine = {
    analyze(sourceResources, targetResources, modes) {
        const changes = [];
        const sourceMap = sourceResources;
        const targetMap = targetResources;

        if (modes.addMissing) {
            sourceMap.forEach((sourceValue, key) => {
                if (!targetMap.has(key)) {
                    changes.push({
                        id: `add-${key}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        key,
                        type: 'add-missing',
                        sourceValue: sourceValue.value,
                        targetValue: null,
                        action: 'apply'
                    });
                }
            });
        }

        targetMap.forEach((targetResource, key) => {
            const sourceResource = sourceMap.get(key);
            if (!sourceResource) return;

            const sourceValue = sourceResource.value || '';
            const targetValue = targetResource.value || '';

            if (modes.fillEmpty && (!targetValue || targetValue.trim() === '') && sourceValue && sourceValue.trim() !== '') {
                changes.push({
                    id: `fill-${key}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    key,
                    type: 'fill-empty',
                    sourceValue,
                    targetValue,
                    action: 'apply'
                });
            }

            if (modes.updateDiff && targetValue && targetValue.trim() !== '' && sourceValue !== targetValue) {
                changes.push({
                    id: `update-${key}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    key,
                    type: 'update-diff',
                    sourceValue,
                    targetValue,
                    action: 'apply'
                });
            }
        });

        return changes;
    },

    applyChanges(sourceResources, targetResources, changes) {
        const newTarget = new Map();
        targetResources.forEach((value, key) => {
            newTarget.set(key, { ...value });
        });

        changes.forEach(change => {
            if (change.action !== 'apply') return;

            if (change.type === 'add-missing') {
                const source = sourceResources.get(change.key);
                if (!source) return;

                newTarget.set(change.key, {
                    name: source.name,
                    value: source.value,
                    attributes: { name: source.name },
                    comment: source.comment || ''
                });

            } else {
                const existing = newTarget.get(change.key);
                if (!existing) return;
                newTarget.set(change.key, {
                    ...existing,
                    value: change.sourceValue
                });
            }
        });

        return newTarget;
    }
};

// ============================================
// Filename Utilities
// ============================================
function getBaseFilename(filename) {
    return filename.replace(/\.resx$/i, '');
}

function checkFilenameUniqueness(filename, role, excludePairId = null) {
    return !AppState.filePairs
        .filter(p => p.id !== excludePairId)
        .some(p => p[`${role}File`] && p[`${role}File`].name === filename);
}

// ============================================
// File Pair Management
// ============================================
function createFilePairUI(pair) {
    const div = document.createElement('div');
    div.className = 'pair-card bg-bg-tertiary rounded-xl border border-border overflow-hidden';
    div.dataset.pairId = pair.id;

    div.innerHTML = `
    <div class="px-4 py-3 border-b border-border bg-bg-elevated/30 flex items-center justify-between">
        <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-fg-primary">Pair ${pair.id}</span>
        <span class="px-1.5 py-0.5 rounded text-xs ${pair.sourceFile && pair.targetFile ? 'bg-accent/15 text-accent' : 'bg-fg-dim/20 text-fg-muted'}">
            ${pair.sourceFile && pair.targetFile ? 'Ready' : 'Incomplete'}
        </span>
        </div>
        <button class="remove-pair w-7 h-7 rounded-md flex items-center justify-center text-fg-muted hover:text-status-error hover:bg-status-error/10 transition-colors" aria-label="Remove pair">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
        </button>
    </div>
    <div class="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div class="p-3">
        <label class="block text-xs font-medium text-fg-muted mb-2">Source (Master)</label>
        <div class="drop-zone rounded-lg p-3 text-center cursor-pointer" data-type="source" data-pair="${pair.id}">
            <input type="file" accept=".resx" class="hidden" data-type="source" data-pair="${pair.id}">
            <div class="file-drop-content ${pair.sourceFile ? 'hidden' : ''}">
            <svg class="w-6 h-6 mx-auto mb-1.5 text-fg-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <p class="text-xs text-fg-secondary">Drop file or click</p>
            </div>
            <div class="file-info ${pair.sourceFile ? '' : 'hidden'}">
            <div class="flex items-center justify-center gap-1.5">
                <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="text-xs text-accent font-medium file-name truncate max-w-32">${pair.sourceFile?.name || ''}</span>
            </div>
            <button class="remove-file mt-1.5 text-xs text-fg-muted hover:text-status-error transition-colors" data-type="source">Remove</button>
            </div>
        </div>
        </div>
        <div class="p-3">
        <label class="block text-xs font-medium text-fg-muted mb-2">Target (To Sync)</label>
        <div class="drop-zone rounded-lg p-3 text-center cursor-pointer" data-type="target" data-pair="${pair.id}">
            <input type="file" accept=".resx" class="hidden" data-type="target" data-pair="${pair.id}">
            <div class="file-drop-content ${pair.targetFile ? 'hidden' : ''}">
            <svg class="w-6 h-6 mx-auto mb-1.5 text-fg-dim" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <p class="text-xs text-fg-secondary">Drop file or click</p>
            </div>
            <div class="file-info ${pair.targetFile ? '' : 'hidden'}">
            <div class="flex items-center justify-center gap-1.5">
                <svg class="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="text-xs text-accent font-medium file-name truncate max-w-32">${pair.targetFile?.name || ''}</span>
            </div>
            <button class="remove-file mt-1.5 text-xs text-fg-muted hover:text-status-error transition-colors" data-type="target">Remove</button>
            </div>
        </div>
        </div>
    </div>
    `;

    return div;
}

function addFilePair(sourceFile = null, targetFile = null) {
    AppState.pairCounter++;
    const pairId = AppState.pairCounter;

    const pair = {
        id: pairId,
        sourceFile: sourceFile,
        targetFile: targetFile,
        sourceResources: null,
        targetResources: null,
        sourceDoc: null,
        targetDoc: null,
        changes: [],
        status: 'pending'
    };

    if (sourceFile) {
        const parsed = RESXParser.parse(sourceFile.content);
        pair.sourceResources = parsed.resources;
        pair.sourceDoc = parsed.doc;
    }

    if (targetFile) {
        const parsed = RESXParser.parse(targetFile.content);
        pair.targetResources = parsed.resources;
        pair.targetDoc = parsed.doc;
    }

    AppState.filePairs.push(pair);

    const pairUI = createFilePairUI(pair);
    DOM.filePairsContainer.appendChild(pairUI);

    setupDropZone(pairUI, pairId);
    updateUI();

    return pair;
}

function removeFilePair(pairId) {
    AppState.filePairs = AppState.filePairs.filter(p => p.id !== pairId);
    const ui = DOM.filePairsContainer.querySelector(`[data-pair-id="${pairId}"]`);
    if (ui) {
        ui.style.opacity = '0';
        ui.style.transform = 'translateX(-10px)';
        setTimeout(() => ui.remove(), 200);
    }
    setTimeout(updateUI, 210);
}

function clearAllPairs() {
    AppState.filePairs = [];
    AppState.pairCounter = 0;
    AppState.changes = [];
    DOM.filePairsContainer.innerHTML = '';

    DOM.statsSection.classList.add('hidden');
    DOM.previewSection.classList.add('hidden');
    DOM.actionsSection.classList.add('hidden');

    updateUI();
}

function updateUI() {
    const hasPairs = AppState.filePairs.length > 0;

    DOM.emptyState.classList.toggle('hidden', hasPairs);
    DOM.clearAllBtn.disabled = !hasPairs;
    DOM.clearAllBtn.classList.toggle('opacity-50', !hasPairs);
    DOM.clearAllBtn.classList.toggle('pointer-events-none', !hasPairs);

    updateAnalyzeButton();
}

function setupDropZone(container, pairId) {
    const dropZones = container.querySelectorAll('.drop-zone');

    dropZones.forEach(zone => {
        const input = zone.querySelector('input[type="file"]');
        const type = zone.dataset.type;

        zone.addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-file')) {
                input.click();
            }
        });

        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0], pairId, type);
            }
        });

        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0], pairId, type);
                input.value = '';
            }
        });
    });

    container.querySelectorAll('.remove-file').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const type = btn.dataset.type;
            removeFileFromPair(pairId, type);
        });
    });
}

function handleFileUpload(file, pairId, type) {
    if (!checkFilenameUniqueness(file.name, type, pairId)) {
        showValidationError(`File "${file.name}" already exists as a ${type} in another pair.`);
        return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
        const content = e.target.result;
        const { resources, doc } = RESXParser.parse(content);

        const pair = AppState.filePairs.find(p => p.id === pairId);
        if (pair) {
            parseAndAssign(pair, { name: file.name, content }, type);
            updatePairUI(pair);
            updateAnalyzeButton();
        }
    };

    reader.readAsText(file);
}

function removeFileFromPair(pairId, type) {
    const pair = AppState.filePairs.find(p => p.id === pairId);
    if (pair) {
        if (type === 'source') {
            pair.sourceFile = null;
            pair.sourceResources = null;
            pair.sourceDoc = null;
        } else {
            pair.targetFile = null;
            pair.targetResources = null;
            pair.targetDoc = null;
        }

        updatePairUI(pair);
        updateAnalyzeButton();
    }
}

function updatePairUI(pair) {
    const container = DOM.filePairsContainer.querySelector(`[data-pair-id="${pair.id}"]`);
    if (!container) return;

    const sourceZone = container.querySelector('.drop-zone[data-type="source"]');
    const sourceDropContent = sourceZone.querySelector('.file-drop-content');
    const sourceFileInfo = sourceZone.querySelector('.file-info');
    const sourceFileName = sourceZone.querySelector('.file-name');

    sourceDropContent.classList.toggle('hidden', !!pair.sourceFile);
    sourceFileInfo.classList.toggle('hidden', !pair.sourceFile);
    if (pair.sourceFile) sourceFileName.textContent = pair.sourceFile.name;

    const targetZone = container.querySelector('.drop-zone[data-type="target"]');
    const targetDropContent = targetZone.querySelector('.file-drop-content');
    const targetFileInfo = targetZone.querySelector('.file-info');
    const targetFileName = targetZone.querySelector('.file-name');

    targetDropContent.classList.toggle('hidden', !!pair.targetFile);
    targetFileInfo.classList.toggle('hidden', !pair.targetFile);
    if (pair.targetFile) targetFileName.textContent = pair.targetFile.name;

    const statusBadge = container.querySelector('.px-1\\.5');
    const isComplete = pair.sourceFile && pair.targetFile;
    statusBadge.className = `px-1.5 py-0.5 rounded text-xs ${isComplete ? 'bg-accent/15 text-accent' : 'bg-fg-dim/20 text-fg-muted'}`;
    statusBadge.textContent = isComplete ? 'Ready' : 'Incomplete';
}

function updateAnalyzeButton() {
    const hasValidPairs = AppState.filePairs.some(p =>
        p.sourceFile && p.targetFile && p.sourceResources && p.targetResources
    );

    const hasActiveModes = Object.values(AppState.syncModes).some(v => v);

    DOM.analyzeBtn.disabled = !(hasValidPairs && hasActiveModes);
}

// ============================================
// Mode Toggle Management
// ============================================
function setupModeToggles() {
    DOM.modeToggles.forEach(toggle => {
        toggle.addEventListener('click', () => toggleMode(toggle));
        toggle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleMode(toggle);
            }
        });
    });
}

function toggleMode(toggle) {
    const mode = toggle.dataset.mode;
    AppState.syncModes[mode] = !AppState.syncModes[mode];
    toggle.classList.toggle('active', AppState.syncModes[mode]);
    toggle.setAttribute('aria-checked', AppState.syncModes[mode]);

    updateActiveModesDisplay();
    updateAnalyzeButton();
}

function updateActiveModesDisplay() {
    const modeLabels = {
        fillEmpty: 'Fill Empty',
        addMissing: 'Add Missing',
        updateDiff: 'Update Diff'
    };

    const colors = {
        fillEmpty: 'bg-status-filled/15 text-status-filled border-status-filled/30',
        addMissing: 'bg-status-added/15 text-status-added border-status-added/30',
        updateDiff: 'bg-status-updated/15 text-status-updated border-status-updated/30'
    };

    const activeModes = Object.entries(AppState.syncModes)
        .filter(([_, active]) => active)
        .map(([mode, _]) => `<span class="px-2 py-0.5 text-xs font-medium rounded border ${colors[mode]}">${modeLabels[mode]}</span>`);

    if (activeModes.length === 0) {
        DOM.activeModesDisplay.innerHTML = '<span class="text-xs text-fg-dim italic">None</span>';
    } else {
        DOM.activeModesDisplay.innerHTML = activeModes.join('');
    }
}

// ============================================
// Batch Pair Modal
// ============================================
function openBatchModal() {
    DOM.batchModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    AppState.batchFiles = [];
    AppState.batchRole = null;
    DOM.fileRoleInputs.forEach(input => input.checked = false);
    updateBatchUI();
}

function closeBatchModal() {
    DOM.batchModal.classList.add('hidden');
    document.body.style.overflow = '';

    AppState.batchFiles = [];
    AppState.batchRole = null;
    DOM.fileRoleInputs.forEach(input => input.checked = false);
    DOM.batchFileInput.value = '';
    updateBatchUI();
}

function setupBatchModal() {
    DOM.batchPairBtn.addEventListener('click', openBatchModal);

    DOM.closeModalBtn.addEventListener('click', closeBatchModal);
    DOM.cancelBatchBtn.addEventListener('click', closeBatchModal);
    DOM.modalBackdrop.addEventListener('click', closeBatchModal);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !DOM.batchModal.classList.contains('hidden')) {
            closeBatchModal();
        }
    });

    DOM.fileRoleInputs.forEach(input => {
        input.addEventListener('change', () => {
            AppState.batchRole = input.value;
            updateBatchUI();
        });
    });

    DOM.batchDropZone.addEventListener('click', () => {
        if (AppState.batchRole) {
            DOM.batchFileInput.click();
        }
    });

    DOM.batchDropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        DOM.batchDropZone.classList.add('drag-over');
    });

    DOM.batchDropZone.addEventListener('dragleave', () => {
        DOM.batchDropZone.classList.remove('drag-over');
    });

    DOM.batchDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        DOM.batchDropZone.classList.remove('drag-over');

        if (!AppState.batchRole) {
            showValidationError('Please select a role (Source or Target) first.');
            return;
        }

        const files = Array.from(e.dataTransfer.files).filter(f => f.name.toLowerCase().endsWith('.resx'));
        if (files.length > 0) {
            processBatchFiles(files);
        }
    });

    DOM.batchFileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            processBatchFiles(files);
        }
        e.target.value = '';
    });

    DOM.clearBatchFilesBtn.addEventListener('click', () => {
        AppState.batchFiles = [];
        updateBatchUI();
    });

    DOM.submitBatchBtn.addEventListener('click', submitBatchFiles);
}

function processBatchFiles(files) {
    const validationErrors = [];

    files.forEach(file => {
        if (!checkFilenameUniqueness(file.name, AppState.batchRole)) {
            validationErrors.push(`"${file.name}" already exists as a ${AppState.batchRole}`);
        }

        if (AppState.batchFiles.some(f => f.name === file.name)) {
            validationErrors.push(`"${file.name}" is already in the batch`);
        }
    });

    if (validationErrors.length > 0) {
        showValidationError(validationErrors.join('. '));
        return;
    }

    const readPromises = files.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({ name: file.name, content: e.target.result });
            };
            reader.readAsText(file);
        });
    });

    Promise.all(readPromises).then(fileData => {
        AppState.batchFiles.push(...fileData);
        updateBatchUI();
    });
}

function removeBatchFile(index) {
    AppState.batchFiles.splice(index, 1);
    updateBatchUI();
}

function updateBatchUI() {
    const hasFiles = AppState.batchFiles.length > 0;
    const hasRole = !!AppState.batchRole;

    DOM.batchFilesList.classList.toggle('hidden', !hasFiles);

    if (hasFiles) {
        DOM.batchFilesContainer.innerHTML = AppState.batchFiles.map((file, index) => `
        <div class="file-tag flex items-center justify-between p-2 rounded-lg bg-bg-elevated border border-border">
        <div class="flex items-center gap-2 min-w-0">
            <svg class="w-4 h-4 text-accent flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
            <span class="text-sm text-fg-primary truncate">${escapeHtml(file.name)}</span>
        </div>
        <button onclick="removeBatchFile(${index})" class="w-6 h-6 rounded flex items-center justify-center text-fg-muted hover:text-status-error hover:bg-status-error/10 transition-colors flex-shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
        </div>
    `).join('');
    }

    DOM.submitBatchBtn.disabled = !hasFiles || !hasRole;
    DOM.batchValidationMsg.classList.add('hidden');
}

function showValidationError(message) {
    DOM.batchValidationMsg.classList.remove('hidden');
    DOM.batchValidationMsg.querySelector('p').textContent = message;
}

function submitBatchFiles() {
    const role = AppState.batchRole;
    const files = AppState.batchFiles;

    if (!role || files.length === 0) return;

    files.forEach(file => {
        const baseName = getBaseFilename(file.name);
        let assigned = false;

        if (role === 'source') {
            const matchingPair = AppState.filePairs.find(p =>
                p.targetFile && getBaseFilename(p.targetFile.name) === baseName && !p.sourceFile
            );

            if (matchingPair) {
                parseAndAssign(matchingPair, file, 'source');
                assigned = true;
            } else {
                const emptyPair = AppState.filePairs.find(p => !p.sourceFile);
                if (emptyPair) {
                    const parsed = RESXParser.parse(file.content);
                    emptyPair.sourceFile = file;
                    emptyPair.sourceResources = parsed.resources;
                    emptyPair.sourceDoc = parsed.doc;
                    assigned = true;
                }
            }
        } else {
            const matchingPair = AppState.filePairs.find(p =>
                p.sourceFile && getBaseFilename(p.sourceFile.name) === baseName && !p.targetFile
            );

            if (matchingPair) {
                const parsed = RESXParser.parse(file.content);
                matchingPair.targetFile = file;
                matchingPair.targetResources = parsed.resources;
                matchingPair.targetDoc = parsed.doc;
                assigned = true;
            } else {
                const emptyPair = AppState.filePairs.find(p => !p.targetFile);
                if (emptyPair) {
                    const parsed = RESXParser.parse(file.content);
                    emptyPair.targetFile = file;
                    emptyPair.targetResources = parsed.resources;
                    emptyPair.targetDoc = parsed.doc;
                    assigned = true;
                }
            }
        }

        if (!assigned) {
            if (role === 'source') {
                addFilePair(file, null);
            } else {
                addFilePair(null, file);
            }
        }
    });

    refreshAllPairUIs();
    closeBatchModal();
}

function refreshAllPairUIs() {
    DOM.filePairsContainer.innerHTML = '';
    AppState.filePairs.forEach(pair => {
        const pairUI = createFilePairUI(pair);
        DOM.filePairsContainer.appendChild(pairUI);
        setupDropZone(pairUI, pair.id);
    });
    updateUI();
}

// ============================================
// Analysis
// ============================================
async function analyzeFiles() {
    showLoading("Analyzing files...");
    await new Promise(resolve => setTimeout(resolve, 50));

    AppState.changes = [];

    AppState.filePairs.forEach(pair => {
        if (pair.sourceResources && pair.targetResources) {
            const changes = SyncEngine.analyze(
                pair.sourceResources,
                pair.targetResources,
                AppState.syncModes
            );

            pair.changes = changes.map(c => ({ ...c, pairId: pair.id }));
            AppState.changes.push(...pair.changes);
        }
    });

    renderPreview();
    updateStatistics();
    showSections();

    hideLoading();
}

// ============================================
// Preview Rendering
// ============================================
function renderPreview() {
    DOM.previewContainer.innerHTML = '';

    const pairMap = new Map(
        AppState.filePairs.map(p => [p.id, p])
    );

    const changesByPair = {};

    for (const change of AppState.changes) {
        (changesByPair[change.pairId] ||= []).push(change);
    }

    for (const [pairId, changes] of Object.entries(changesByPair)) {
        const pair = pairMap.get(Number(pairId));
        if (!pair) continue;

        DOM.previewContainer.appendChild(
            createAccordion(pair, changes)
        );
    }
}

function createAccordion(pair, changes) {
    const div = document.createElement('div');
    div.className = 'bg-bg-tertiary rounded-xl border border-border overflow-hidden';

    const typeColors = {
        'fill-empty': { bg: 'bg-status-filled', text: 'text-status-filled' },
        'add-missing': { bg: 'bg-status-added', text: 'text-status-added' },
        'update-diff': { bg: 'bg-status-updated', text: 'text-status-updated' }
    };

    const grouped = groupByType(changes);

    div.innerHTML = `
    <button class="accordion-header w-full px-4 py-3 flex items-center justify-between text-left hover:bg-bg-elevated/50 transition-colors">
        <div class="flex items-center gap-3 min-w-0">
        <svg class="w-4 h-4 text-fg-muted accordion-icon transition-transform flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
        <div class="min-w-0">
            <span class="font-medium text-fg-primary truncate">${escapeHtml(pair.targetFile?.name || 'Unknown')}</span>
            <span class="text-fg-dim mx-1.5">←</span>
            <span class="text-fg-secondary text-sm truncate">${escapeHtml(pair.sourceFile?.name || 'Unknown')}</span>
        </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0 ml-2">
        ${Object.entries(grouped).map(([type, items]) => `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${typeColors[type].bg}/15 ${typeColors[type].text}">
            <span class="w-1.5 h-1.5 rounded-full ${typeColors[type].bg}"></span>
            ${items.length}
            </span>
        `).join('')}
        </div>
    </button>
    <div class="accordion-content">
        <div class="border-t border-border divide-y divide-border">
        ${changes.map(change => createChangeCard(change)).join('')}
        </div>
    </div>
    `;

    const header = div.querySelector('.accordion-header');
    const content = div.querySelector('.accordion-content');
    const icon = div.querySelector('.accordion-icon');

    header.addEventListener('click', () => {
        content.classList.toggle('open');
        icon.style.transform = content.classList.contains('open') ? 'rotate(180deg)' : '';
    });

    div.querySelectorAll('.change-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const changeId = btn.dataset.changeId;
            const action = btn.dataset.action;
            updateChangeAction(changeId, action);
        });
    });

    return div;
}

function createChangeCard(change) {
    const typeConfig = {
        'fill-empty': { bg: 'bg-status-filled/10', border: 'border-status-filled/20', text: 'text-status-filled', label: 'Fill' },
        'add-missing': { bg: 'bg-status-added/10', border: 'border-status-added/20', text: 'text-status-added', label: 'Add' },
        'update-diff': { bg: 'bg-status-updated/10', border: 'border-status-updated/20', text: 'text-status-updated', label: 'Update' }
    };

    const config = typeConfig[change.type];
    const isApplied = change.action === 'apply';
    const isSkipped = change.action === 'skip';

    return `
    <div class="change-card p-3 ${isSkipped ? 'opacity-40' : ''}" data-change-id="${change.id}">
        <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-2">
            <span class="px-1.5 py-0.5 rounded text-xs font-medium ${config.bg} ${config.text} ${config.border} border">
                ${config.label}
            </span>
            <code class="text-xs font-mono text-fg-primary bg-bg-elevated px-1.5 py-0.5 rounded">${escapeHtml(change.key)}</code>
            </div>
            <div class="grid sm:grid-cols-2 gap-2 text-xs">
            <div>
                <span class="text-fg-dim block mb-0.5">Source:</span>
                <div class="bg-bg-elevated rounded p-1.5 font-mono text-fg-secondary break-all max-h-16 overflow-y-auto">
                ${escapeHtml(change.sourceValue || '<empty>')}
                </div>
            </div>
            <div>
                <span class="text-fg-dim block mb-0.5">Target:</span>
                <div class="bg-bg-elevated rounded p-1.5 font-mono text-fg-secondary break-all max-h-16 overflow-y-auto">
                ${change.targetValue === null ? '<missing>' : escapeHtml(change.targetValue || '<empty>')}
                </div>
            </div>
            </div>
        </div>
        <div class="flex items-center gap-1.5 flex-shrink-0">
            <button class="change-action-btn px-2 py-1 rounded text-xs font-medium transition-colors ${isApplied ? 'bg-accent text-bg-primary' : 'bg-bg-elevated text-fg-secondary hover:bg-accent hover:text-bg-primary'}" 
                    data-change-id="${change.id}" data-action="apply">
            Apply
            </button>
            <button class="change-action-btn px-2 py-1 rounded text-xs font-medium transition-colors ${isSkipped ? 'bg-status-skip text-white' : 'bg-bg-elevated text-fg-secondary hover:bg-status-skip hover:text-white'}"
                    data-change-id="${change.id}" data-action="skip">
            Skip
            </button>
        </div>
        </div>
    </div>
    `;
}

function groupByType(changes) {
    const result = {};
    for (const c of changes) {
        (result[c.type] ||= []).push(c);
    }
    return result;
}

function updateChangeAction(changeId, action) {
    const change = AppState.changes.find(c => c.id === changeId);
    if (!change) return;

    change.action = action;
    const card = document.querySelector(`[data-change-id="${changeId}"]`);
    if (card) {
        card.classList.toggle('opacity-40', action === 'skip');
    }

    updateStatistics();
}

// ============================================
// Statistics
// ============================================
function updateStatistics() {
    const stats = {
        total: 0,
        filled: 0,
        added: 0,
        updated: 0,
        toApply: 0,
        skipped: 0
    };

    for (const change of AppState.changes) {
        stats.total++;

        if (change.type === 'fill-empty') stats.filled++;
        if (change.type === 'add-missing') stats.added++;
        if (change.type === 'update-diff') stats.updated++;
        if (change.action === 'apply') stats.toApply++;
        if (change.action === 'skip') stats.skipped++;
    }

    animateNumber(DOM.statTotal, stats.total);
    animateNumber(DOM.statFilled, stats.filled);
    animateNumber(DOM.statAdded, stats.added);
    animateNumber(DOM.statUpdated, stats.updated);
    animateNumber(DOM.statToApply, stats.toApply);
    animateNumber(DOM.statSkipped, stats.skipped);
}

function animateNumber(element, target) {
    const current = parseInt(element.textContent) || 0;
    const diff = target - current;

    if (diff === 0) return;

    const duration = 250;
    const start = performance.now();

    function update(timestamp) {
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.round(current + diff * eased);

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// ============================================
// Section Visibility
// ============================================
function showSections() {
    DOM.statsSection.classList.remove('hidden');
    DOM.previewSection.classList.remove('hidden');
    DOM.actionsSection.classList.remove('hidden');

    setTimeout(() => {
        const firstHeader = DOM.previewContainer.querySelector('.accordion-header');
        if (firstHeader) firstHeader.click();
    }, 100);
}

// ============================================
// Bulk Actions
// ============================================
function applyAllChanges() {
    AppState.changes.forEach(c => c.action = 'apply');
    renderPreview();
    updateStatistics();
}

function skipAllChanges() {
    AppState.changes.forEach(c => c.action = 'skip');
    renderPreview();
    updateStatistics();
}

// ============================================
// Export Functions
// ============================================
async function downloadZip() {
    if (!AppState.filePairs.length) return;

    showLoading("Generating ZIP file...");

    await new Promise(resolve => setTimeout(resolve, 50));

    const zip = new JSZip();
    const results = [];

    for (const pair of AppState.filePairs) {

        if (!pair.targetFile || !pair.sourceFile) {
            results.push({
                pairId: pair.id,
                filename: pair.targetFile?.name || "Missing file",
                changes: [],
                xmlString: null,
                error: "Incomplete pair"
            });
            continue;
        }

        const fillChanges = AppState.changes.filter(c =>
            c.pairId === pair.id &&
            c.type === "fill-empty" &&
            c.action === "apply"
        );

        if (!fillChanges.length) {
            results.push({
                pairId: pair.id,
                filename: pair.targetFile.name,
                changes: [],
                xmlString: pair.targetFile.content,
                error: null
            });
            continue;
        }

        let updatedText = pair.targetFile.content;

        for (const change of fillChanges) {

            const escapedKey = escapeRegex(change.key);
            const sourceValue = escapeXml(change.sourceValue || "");

            const selfClosingRegex = new RegExp(
                `(<data[^>]*name="${escapedKey}"[^>]*>[\\s\\S]*?)<value\\s*/>`,
                "m"
            );

            if (selfClosingRegex.test(updatedText)) {
                updatedText = updatedText.replace(
                    selfClosingRegex,
                    `$1<value>${sourceValue}</value>`
                );
            } else {
                const emptyValueRegex = new RegExp(
                    `(<data[^>]*name="${escapedKey}"[^>]*>[\\s\\S]*?<value>)(\\s*)(<\\/value>)`,
                    "m"
                );

                updatedText = updatedText.replace(
                    emptyValueRegex,
                    `$1${sourceValue}$3`
                );
            }
        }

        results.push({
            pairId: pair.id,
            filename: pair.targetFile.name,
            changes: fillChanges,
            xmlString: updatedText,
            error: null
        });

        zip.file(pair.targetFile.name, updatedText);
    }

    const content = await zip.generateAsync({ type: "blob" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = "resx_batch_output.zip";
    link.click();

    hideLoading();
}

function generateExcelReport(results) {

    const summaryRows = [];
    const detailRows = [];

    results.forEach(res => {

        const changeCount = res.changes?.length || 0;

        summaryRows.push({
            Pair: res.pairId,
            File: res.filename,
            Changes: changeCount,
            Status: res.error
                ? "ERROR"
                : changeCount === 0
                    ? "NO CHANGE"
                    : "UPDATED",
            ErrorMessage: res.error || ""
        });

        if (!res.error && changeCount > 0) {
            res.changes.forEach(c => {
                detailRows.push({
                    Pair: res.pairId,
                    File: res.filename,
                    Key: c.key,
                    Mode: c.type,
                    OldValue: c.targetValue ?? "",
                    NewValue: c.sourceValue ?? ""
                });
            });
        }

        if (res.error) {
            detailRows.push({
                Pair: res.pairId,
                File: res.filename,
                Key: "",
                Mode: "",
                OldValue: "",
                NewValue: `ERROR: ${res.error}`
            });
        }
    });

    const workbook = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    autoFitColumns(summarySheet, summaryRows);
    summarySheet["!freeze"] = { ySplit: 1 };
    summarySheet["!autofilter"] = { ref: summarySheet["!ref"] };
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    autoFitColumns(detailSheet, detailRows);
    detailSheet["!freeze"] = { ySplit: 1 };
    detailSheet["!autofilter"] = { ref: detailSheet["!ref"] };
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Detailed Changes");

    return XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array"
    });
}

function autoFitColumns(worksheet, rows) {

    if (!rows.length) return;

    const headers = Object.keys(rows[0]);

    worksheet['!cols'] = headers.map(header => {

        const maxLength = Math.max(
            header.length,
            ...rows.map(row =>
                String(row[header] ?? "").length
            )
        );

        return { wch: Math.min(maxLength + 2, 60) };
    });
}

async function downloadExcel() {
    if (!AppState.filePairs.length) {
        alert("No data to export.");
        return;
    }

    showLoading("Generating Excel report...");

    await new Promise(resolve => setTimeout(resolve, 50));

    const results = [];

    for (const pair of AppState.filePairs) {

        if (!pair.targetFile || !pair.sourceFile) {
            results.push({
                pairId: pair.id,
                filename: pair.targetFile?.name || "Missing file",
                changes: [],
                xmlString: null,
                error: "Incomplete pair"
            });
            continue;
        }

        const appliedChanges = AppState.changes.filter(c =>
            c.pairId === pair.id &&
            c.action === "apply"
        );

        results.push({
            pairId: pair.id,
            filename: pair.targetFile.name,
            changes: appliedChanges,
            xmlString: null,
            error: null
        });
    }

    const excelData = generateExcelReport(results);

    const blob = new Blob([excelData], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "changes_report.xlsx";
    link.click();

    hideLoading();
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// Utility Functions
// ============================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

async function downloadZipFile(filename, fileData) {
    const zip = new JSZip();
    zip.file(filename, fileData);

    const content = await zip.generateAsync({ type: "blob" });

    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = filename.replace(".xlsx", ".zip");
    link.click();
}

function parseAndAssign(pair, file, type) {
    const { resources, doc } = RESXParser.parse(file.content);

    if (type === 'source') {
        pair.sourceFile = file;
        pair.sourceResources = resources;
        pair.sourceDoc = doc;
    } else {
        pair.targetFile = file;
        pair.targetResources = resources;
        pair.targetDoc = doc;
    }
}

// ============================================
// Event Listeners Setup
// ============================================
function setupEventListeners() {
    DOM.addPairBtn.addEventListener('click', () => addFilePair());
    DOM.clearAllBtn.addEventListener('click', clearAllPairs);
    DOM.analyzeBtn.addEventListener('click', analyzeFiles);
    DOM.applyAllBtn.addEventListener('click', applyAllChanges);
    DOM.skipAllBtn.addEventListener('click', skipAllChanges);
    DOM.downloadZipBtn.addEventListener('click', downloadZip);
    DOM.downloadExcelBtn.addEventListener('click', downloadExcel);

    DOM.filePairsContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-pair');
        if (removeBtn) {
            const pairElement = removeBtn.closest('.pair-card');
            if (pairElement) {
                removeFilePair(parseInt(pairElement.dataset.pairId));
            }
        }
    });
}

// ============================================
// Initialize Application
// ============================================
function init() {
    initDOMReferences();
    setupModeToggles();
    setupBatchModal();
    setupEventListeners();

    updateUI();
}

window.removeBatchFile = removeBatchFile;

document.addEventListener('DOMContentLoaded', init);