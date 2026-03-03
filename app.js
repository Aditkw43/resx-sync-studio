const state = {
    results: []
};

document.addEventListener('DOMContentLoaded', () => {
    addPair();
    bindEvents();
});

function bindEvents() {

    document.getElementById('addPairBtn')
        .addEventListener('click', addPair);

    document.getElementById('processBtn')
        .addEventListener('click', processAllFiles);

    document.getElementById('downloadZipBtn')
        .addEventListener('click', downloadAllAsZip);

    document.getElementById('pairContainer')
        .addEventListener('click', e => {
            if (e.target.classList.contains('remove-pair-btn')) {
                if (document.querySelectorAll('.pair-card').length > 1) {
                    e.target.closest('.pair-card').remove();
                    reindexPairs();
                }
            }

            if (e.target.classList.contains('result-header')) {
                e.target.nextElementSibling.classList.toggle('open');
            }
        });

    document.getElementById('clearAllBtn')
        .addEventListener('click', clearAll);

    bindGlobalDrop();
}

function addPair() {
    const card = document.createElement('div');
    card.className = 'pair-card';

    card.innerHTML = `
        <div class="pair-header">
            <span class="pair-title"></span>
            <button class="remove-pair-btn">&times;</button>
        </div>
        <div class="upload-grid">
            <div class="upload-box">
                <input type="file" accept=".resx" class="target-input">
                <span class="upload-label">Target</span>
                <span class="upload-filename">No file chosen</span>
            </div>
            <div class="upload-box">
                <input type="file" accept=".resx" class="source-input">
                <span class="upload-label">Source</span>
                <span class="upload-filename">No file chosen</span>
            </div>
        </div>
    `;

    bindBoxDrag(card);
    document.getElementById('pairContainer').appendChild(card);
    reindexPairs();
}

function reindexPairs() {
    document.querySelectorAll('.pair-card')
        .forEach((card, i) => {
            card.querySelector('.pair-title').textContent = `Pair #${i + 1}`;
        });
}

function clearAll() {

    if (!confirm("Are you sure you want to clear everything?")) return;

    const container = document.getElementById('pairContainer');
    container.innerHTML = '';

    state.results = [];

    document.getElementById('resultsContent').innerHTML = '';
    document.getElementById('resultsArea').style.display = 'none';
    hideStatus();

    addPair(); // always keep one empty pair
}

function bindBoxDrag(card) {
    card.querySelectorAll('.upload-box').forEach(box => {

        const input = box.querySelector('input');
        const label = box.querySelector('.upload-filename');

        input.addEventListener('change', () => {
            label.textContent = input.files[0]?.name || "No file chosen";
        });

        box.addEventListener('dragover', e => {
            e.preventDefault();
            box.classList.add('drag-over');
        });

        box.addEventListener('dragleave', () => {
            box.classList.remove('drag-over');
        });

        box.addEventListener('drop', e => {
            e.preventDefault();
            box.classList.remove('drag-over');

            const file = e.dataTransfer.files[0];
            if (!file || !file.name.endsWith('.resx')) return;

            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            label.textContent = file.name;
        });
    });
}

function bindGlobalDrop() {

    const dropZone = document.getElementById('globalDropZone');

    dropZone.addEventListener('dragover', e => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async e => {

        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = [...e.dataTransfer.files]
            .filter(f => f.name.endsWith('.resx'));

        if (!files.length) return;

        const mode = await openUploadModal();
        if (!mode) return;
        handleBatch(files, mode);
    });
}

function openUploadModal() {
    return new Promise(resolve => {

        const overlay = document.getElementById('uploadModal');
        const btnSource = document.getElementById('modalSourceBtn');
        const btnTarget = document.getElementById('modalTargetBtn');
        const btnClose = document.getElementById('modalCloseBtn');

        overlay.classList.remove('hidden');

        function cleanup(result) {
            overlay.classList.add('hidden');
            btnSource.removeEventListener('click', sourceHandler);
            btnTarget.removeEventListener('click', targetHandler);
            btnClose.removeEventListener('click', closeHandler);
            resolve(result);
        }

        function sourceHandler() { cleanup('source'); }
        function targetHandler() { cleanup('target'); }
        function closeHandler() { cleanup(null); }

        btnSource.addEventListener('click', sourceHandler);
        btnTarget.addEventListener('click', targetHandler);
        btnClose.addEventListener('click', closeHandler);
    });
}

function normalizeName(name) {
    return name.replace('.resx', '').toLowerCase();
}

function handleBatch(files, mode) {
    const pairs = [...document.querySelectorAll('.pair-card')];
    const pairMap = new Map();

    pairs.forEach(pair => {
        const sourceFile = pair.querySelector('.source-input').files[0];
        const targetFile = pair.querySelector('.target-input').files[0];

        if (mode === 'target' && sourceFile) {
            pairMap.set(normalizeName(sourceFile.name), pair);
        }

        if (mode === 'source' && targetFile) {
            pairMap.set(normalizeName(targetFile.name), pair);
        }
    });

    files.forEach(file => {

        const key = normalizeName(file.name);
        let pair = pairMap.get(key);

        if (!pair) {
            pair = pairs.find(p => {
                const s = p.querySelector('.source-input').files[0];
                const t = p.querySelector('.target-input').files[0];
                return !s && !t;
            });
        }

        if (!pair) {
            addPair();
            const all = document.querySelectorAll('.pair-card');
            pair = all[all.length - 1];
        }

        const input = pair.querySelector(
            mode === 'source'
                ? '.source-input'
                : '.target-input'
        );

        const label = input.parentElement.querySelector('.upload-filename');

        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        label.textContent = file.name;
    });

    reindexPairs();
}

async function processAllFiles() {

    state.results = [];
    hideStatus();

    const pairs = [...document.querySelectorAll('.pair-card')];

    const promises = pairs.map(async (pair, index) => {

        const targetFile = pair.querySelector('.target-input').files[0];
        const sourceFile = pair.querySelector('.source-input').files[0];

        if (!targetFile || !sourceFile) {
            return {
                pairNumber: index + 1,
                filename: 'Missing file',
                changes: [],
                xmlString: null,
                error: 'Incomplete pair'
            };
        }

        try {
            const [targetText, sourceText] = await Promise.all([
                readFile(targetFile),
                readFile(sourceFile)
            ]);

            const result = syncResx(targetText, sourceText);

            return {
                pairNumber: index + 1,
                filename: targetFile.name,
                ...result
            };

        } catch (err) {
            return {
                pairNumber: index + 1,
                filename: targetFile.name,
                changes: [],
                xmlString: null,
                error: err.message
            };
        }
    });

    state.results = await Promise.all(promises);
    renderResults();
}

function syncResx(targetText, sourceText) {

    const parser = new DOMParser();

    const sourceDoc = parser.parseFromString(sourceText, "application/xml");
    const targetDoc = parser.parseFromString(targetText, "application/xml");

    const sourceMap = new Map(
        [...sourceDoc.querySelectorAll("data")]
            .map(node => [node.getAttribute("name"), node])
    );

    const changes = [];
    let updatedText = targetText;

    targetDoc.querySelectorAll("data").forEach(tNode => {

        const key = tNode.getAttribute("name");
        if (!key || !sourceMap.has(key)) return;

        const sNode = sourceMap.get(key);

        const tValueNode = tNode.querySelector("value");
        const sValueNode = sNode.querySelector("value");

        if (!tValueNode || !sValueNode) return;

        const targetValue = tValueNode.textContent?.trim();
        const sourceValue = sValueNode.textContent?.trim();

        if (targetValue) return;
        if (!sourceValue) return;

        const escapedKey = escapeRegExp(key);
        const selfClosingRegex = new RegExp(
            `(<data[^>]*name="${escapedKey}"[^>]*>[\\s\\S]*?)<value\\s*/>`,
            "m"
        );

        if (selfClosingRegex.test(updatedText)) {
            updatedText = updatedText.replace(
                selfClosingRegex,
                `$1<value>${escapeXml(sourceValue)}</value>`
            );
        } else {
            const emptyValueRegex = new RegExp(
                `(<data[^>]*name="${escapedKey}"[^>]*>[\\s\\S]*?<value>)(\\s*)(<\\/value>)`,
                "m"
            );

            updatedText = updatedText.replace(
                emptyValueRegex,
                `$1${escapeXml(sourceValue)}$3`
            );
        }

        changes.push({
            key,
            col: "value",
            old: "",
            new: sourceValue
        });
    });

    return {
        xmlString: updatedText,
        changes,
        error: null
    };
}

function renderResults() {

    const container = document.getElementById('resultsContent');
    container.innerHTML = '';

    state.results.forEach(res => {

        const card = document.createElement('div');
        card.className = 'result-card';

        const hasError = !!res.error;
        const changeCount = res.changes.length;

        card.innerHTML = `
            <div class="result-header">
                <h3>Pair #${res.pairNumber} — ${res.filename}</h3>
                <span class="result-stats"
                      style="color:${hasError ? '#ef4444' : '#10b981'}">
                    ${hasError
                ? 'Error'
                : changeCount === 0
                    ? 'No changes'
                    : `${changeCount} changes`
            }
                </span>
            </div>
            <div class="result-body">
                ${buildAccordionContent(res)}
            </div>
        `;

        const header = card.querySelector('.result-header');
        const body = card.querySelector('.result-body');

        header.addEventListener('click', () => {
            body.classList.toggle('open');
        });

        container.appendChild(card);
    });

    document.getElementById('resultsArea').style.display = 'block';
}

function buildAccordionContent(res) {

    if (res.error) {
        return `
            <div style="padding:1rem; color:#ef4444;">
                ${res.error}
            </div>
        `;
    }

    if (!res.changes.length) {
        return `
            <div style="padding:1rem; color:#6b7280;">
                No updates were required.
            </div>
        `;
    }

    return `
        <table>
            <thead>
                <tr>
                    <th>Key</th>
                    <th>Column</th>
                    <th>New Value</th>
                </tr>
            </thead>
            <tbody>
                ${res.changes.map(c => `
                    <tr>
                        <td>${c.key}</td>
                        <td>${c.col}</td>
                        <td>${c.new}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function downloadAllAsZip() {

    if (!state.results.length) return;

    const zip = new JSZip();

    const changedFiles = state.results.filter(res =>
        !res.error && res.changes.length > 0
    );

    if (!changedFiles.length) {
        alert("No changes detected. Nothing to download.");
        return;
    }

    changedFiles.forEach(res => {
        zip.file(res.filename, res.xmlString);
    });

    const excelData = generateExcelReport();
    zip.file("changes_report.xlsx", excelData);

    const content = await zip.generateAsync({ type: "blob" });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = "resx_batch_output.zip";
    link.click();
}

function generateExcelReport() {
    const summaryRows = [];
    const detailRows = [];

    let totalPairs = state.results.length;
    let totalChanges = 0;
    let totalErrors = 0;

    state.results.forEach(res => {

        const changeCount = res.changes?.length || 0;
        totalChanges += changeCount;

        if (res.error) totalErrors++;

        summaryRows.push({
            Pair: res.pairNumber,
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
                    Pair: res.pairNumber,
                    File: res.filename,
                    Key: c.key,
                    Column: c.col,
                    NewValue: c.new
                });
            });
        }

        if (res.error) {
            detailRows.push({
                Pair: res.pairNumber,
                File: res.filename,
                Key: "",
                Column: "",
                NewValue: `ERROR: ${res.error}`
            });
        }
    });

    const workbook = XLSX.utils.book_new();
    
    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    autoFitColumns(summarySheet, summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    const detailSheet = XLSX.utils.json_to_sheet(detailRows);
    autoFitColumns(detailSheet, detailRows);
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

        return { wch: Math.min(maxLength + 2, 50) };
    });
}

function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeXml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

function showStatus(msg, type) {
    const el = document.getElementById('globalStatus');
    el.textContent = msg;
    el.className = type;
    el.style.display = 'block';
}

function hideStatus() {
    document.getElementById('globalStatus').style.display = 'none';
}

function escapeHtml(text) {
    return text
        ?.replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}