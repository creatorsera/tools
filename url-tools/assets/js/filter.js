import { saveState, loadState, downloadCsv } from './utils.js';

let filterState = loadState('filterState') || {};
let allLinks = filterState.csvData || [];
let filteredLinks = filterState.filteredLinks || allLinks;
let currentPage = filterState.currentPage || 1;
const linksPerPage = 20;
let csvHeaders = filterState.headers || [];

const elements = {
    csvFile: document.getElementById('csvFile'),
    filterKeyword: document.getElementById('filterKeyword'),
    filterColumn: document.getElementById('filterColumn'),
    logicOperator: document.getElementById('logicOperator'),
    regexToggle: document.getElementById('regexToggle'),
    caseSensitive: document.getElementById('caseSensitive'),
    filterButton: document.getElementById('filterButton'),
    resetButton: document.getElementById('resetButton'),
    downloadButton: document.getElementById('downloadButton'),
    downloadSelectedButton: document.getElementById('downloadSelectedButton'),
    fileStatus: document.getElementById('fileStatus'),
    resultsStatus: document.getElementById('resultsStatus'),
    resultsTable: document.getElementById('resultsTable'),
    columnSelector: document.getElementById('columnSelector'),
    pagination: document.getElementById('pagination'),
    loadingIndicator: document.getElementById('loadingIndicator'),
    csvPreview: document.getElementById('csvPreview'),
    previewTable: document.getElementById('previewTable')
};

function init() {
    if (filterState.csvData) {
        elements.fileStatus.textContent = filterState.fileStatus || 'No file selected';
        elements.filterKeyword.value = filterState.keyword || '';
        elements.filterColumn.value = filterState.filterColumn || '';
        elements.logicOperator.value = filterState.logic || 'AND';
        elements.regexToggle.checked = filterState.regex || false;
        elements.caseSensitive.checked = filterState.caseSensitive || false;
        updateColumnSelector();
        updateColumnFilter();
        showPreview();
        updateResults();
    }

    elements.csvFile.addEventListener('change', handleFileUpload);
    elements.filterButton.addEventListener('click', applyFilter);
    elements.resetButton.addEventListener('click', resetFilter);
    elements.downloadButton.addEventListener('click', () => downloadCSV(false));
    elements.downloadSelectedButton.addEventListener('click', () => downloadCSV(true));
    elements.filterKeyword.addEventListener('keyup', debounce((e) => {
        if (e.key === 'Enter') applyFilter();
    }, 300));

    registerServiceWorker();
}

async function loadPapaParse() {
    if (window.Papa) return;
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'assets/lib/papaparse.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
    });
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    elements.fileStatus.textContent = `Processing: ${file.name}`;
    elements.loadingIndicator.style.display = 'block';
    elements.downloadButton.disabled = true;
    elements.downloadSelectedButton.disabled = true;

    await loadPapaParse();

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            elements.loadingIndicator.style.display = 'none';
            if (results.meta.fields && results.data.length) {
                csvHeaders = results.meta.fields;
                allLinks = results.data.map(row => {
                    const item = {};
                    csvHeaders.forEach(header => item[header] = row[header] || '');
                    return item;
                });
                filteredLinks = [...allLinks];
                filterState = {
                    csvData: allLinks,
                    headers: csvHeaders,
                    filteredLinks,
                    selectedColumns: csvHeaders,
                    selectedRows: [],
                    fileStatus: `${file.name} (${allLinks.length} rows)`,
                    keyword: '',
                    filterColumn: '',
                    logic: 'AND',
                    regex: false,
                    caseSensitive: false,
                    currentPage: 1
                };
                saveState('filterState', filterState);
                elements.fileStatus.textContent = filterState.fileStatus;
                elements.downloadButton.disabled = false;
                updateColumnSelector();
                updateColumnFilter();
                showPreview();
                resetFilter();
            } else {
                elements.fileStatus.textContent = 'Error: Invalid CSV format';
                resetState();
            }
        },
        error: (error) => {
            elements.loadingIndicator.style.display = 'none';
            elements.fileStatus.textContent = `Error: ${error.message}`;
            resetState();
        }
    });
}

function updateColumnSelector() {
    elements.columnSelector.innerHTML = '<h3>Select Columns</h3>';
    csvHeaders.forEach(header => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = header;
        checkbox.checked = filterState.selectedColumns?.includes(header) ?? true;
        checkbox.addEventListener('change', () => {
            filterState.selectedColumns = Array.from(elements.columnSelector.querySelectorAll('input:checked')).map(input => input.value);
            saveState('filterState', filterState);
            updateResults();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(header));
        elements.columnSelector.appendChild(label);
    });
}

function updateColumnFilter() {
    elements.filterColumn.innerHTML = '<option value="">All Columns</option>';
    csvHeaders.forEach(header => {
        const option = document.createElement('option');
        option.value = header;
        option.textContent = header;
        elements.filterColumn.appendChild(option);
    });
    elements.filterColumn.value = filterState.filterColumn || '';
}

function showPreview() {
    if (!allLinks.length) {
        elements.csvPreview.style.display = 'none';
        return;
    }

    elements.csvPreview.style.display = 'block';
    const thead = elements.previewTable.querySelector('thead tr');
    thead.innerHTML = '';
    csvHeaders.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        thead.appendChild(th);
    });

    const tbody = elements.previewTable.querySelector('tbody');
    tbody.innerHTML = '';
    allLinks.slice(0, 5).forEach(item => {
        const row = tbody.insertRow();
        csvHeaders.forEach(col => {
            const cell = row.insertCell();
            cell.textContent = item[col] || '';
        });
    });
}

function applyFilter() {
    if (!allLinks.length) {
        elements.resultsStatus.textContent = 'No data to filter. Please upload a CSV file.';
        return;
    }

    elements.loadingIndicator.style.display = 'block';
    setTimeout(() => {
        const keywords = elements.filterKeyword.value.trim().split(/\s+/).filter(k => k);
        const filterColumn = elements.filterColumn.value;
        const logic = elements.logicOperator.value;
        const useRegex = elements.regexToggle.checked;
        const caseSensitive = elements.caseSensitive.checked;

        filterState.keyword = elements.filterKeyword.value;
        filterState.filterColumn = filterColumn;
        filterState.logic = logic;
        filterState.regex = useRegex;
        filterState.caseSensitive = caseSensitive;
        saveState('filterState', filterState);

        filteredLinks = allLinks.filter(item => {
            const selectedColumns = filterColumn ? [filterColumn] : (filterState.selectedColumns || csvHeaders);
            const values = selectedColumns.map(col => caseSensitive ? item[col] || '' : (item[col] || '').toLowerCase());
            if (!keywords.length) return true;

            const searchTerms = caseSensitive ? keywords : keywords.map(k => k.toLowerCase());
            if (useRegex) {
                try {
                    const regex = new RegExp(searchTerms.join('|'), caseSensitive ? '' : 'i');
                    return values.some(val => regex.test(val));
                } catch {
                    return true;
                }
            }

            return logic === 'AND'
                ? searchTerms.every(keyword => values.some(val => val.includes(keyword)))
                : searchTerms.some(keyword => values.some(val => val.includes(keyword)));
        });

        currentPage = 1;
        filterState.filteredLinks = filteredLinks;
        filterState.currentPage = currentPage;
        saveState('filterState', filterState);
        elements.loadingIndicator.style.display = 'none';
        updateResults();
    }, 100);
}

function resetFilter() {
    elements.filterKeyword.value = '';
    elements.filterColumn.value = '';
    elements.logicOperator.value = 'AND';
    elements.regexToggle.checked = false;
    elements.caseSensitive.checked = false;
    filteredLinks = [...allLinks];
    filterState = {
        ...filterState,
        keyword: '',
        filterColumn: '',
        logic: 'AND',
        regex: false,
        caseSensitive: false,
        filteredLinks,
        selectedColumns: csvHeaders,
        selectedRows: [],
        currentPage: 1
    };
    saveState('filterState', filterState);
    currentPage = 1;
    updateColumnSelector();
    updateColumnFilter();
    updateResults();
}

function resetState() {
    allLinks = [];
    filteredLinks = [];
    csvHeaders = [];
    filterState = {};
    saveState('filterState', filterState);
    elements.csvPreview.style.display = 'none';
    updateColumnSelector();
    updateColumnFilter();
    updateResults();
}

function updateResults() {
    elements.resultsStatus.textContent = `Showing ${filteredLinks.length} rows`;
    if (elements.filterKeyword.value.trim() && filteredLinks.length < allLinks.length) {
        elements.resultsStatus.textContent += ` (filtered from ${allLinks.length})`;
    }

    elements.downloadButton.disabled = !filteredLinks.length;
    elements.downloadSelectedButton.disabled = !filterState.selectedRows?.length;

    const thead = elements.resultsTable.querySelector('thead tr');
    thead.innerHTML = '<th><input type="checkbox" id="selectAll"></th><th>#</th>';
    const selectedColumns = filterState.selectedColumns || csvHeaders;
    selectedColumns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        thead.appendChild(th);
    });

    const tbody = elements.resultsTable.querySelector('tbody');
    tbody.innerHTML = '';

    const totalPages = Math.ceil(filteredLinks.length / linksPerPage);
    const startIdx = (currentPage - 1) * linksPerPage;
    const endIdx = Math.min(startIdx + linksPerPage, filteredLinks.length);
    const pageLinks = filteredLinks.slice(startIdx, endIdx);

    pageLinks.forEach((item, index) => {
        const row = tbody.insertRow();
        const selectCell = row.insertCell();
        const indexCell = row.insertCell();
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = filterState.selectedRows?.includes(startIdx + index);
        checkbox.addEventListener('change', () => {
            filterState.selectedRows = filterState.selectedRows || [];
            if (checkbox.checked) {
                filterState.selectedRows.push(startIdx + index);
            } else {
                filterState.selectedRows = filterState.selectedRows.filter(i => i !== (startIdx + index));
            }
            saveState('filterState', filterState);
            elements.downloadSelectedButton.disabled = !filterState.selectedRows.length;
        });
        selectCell.appendChild(checkbox);
        indexCell.textContent = startIdx + index + 1;

        selectedColumns.forEach(col => {
            const cell = row.insertCell();
            if (item[col]?.startsWith('http')) {
                const link = document.createElement('a');
                link.href = item[col];
                link.textContent = item[col];
                link.target = '_blank';
                link.style.color = '#2ECC71';
                cell.appendChild(link);
            } else {
                cell.textContent = item[col] || '';
            }
        });
    });

    const selectAll = document.getElementById('selectAll');
    selectAll?.addEventListener('change', () => {
        const checkboxes = tbody.querySelectorAll('input[type="checkbox"]');
        filterState.selectedRows = selectAll.checked ? Array.from({length: endIdx - startIdx}, (_, i) => startIdx + i) : [];
        checkboxes.forEach(cb => cb.checked = selectAll.checked);
        saveState('filterState', filterState);
        elements.downloadSelectedButton.disabled = !filterState.selectedRows.length;
    });

    updatePagination(totalPages);
}

function downloadCSV(selectedOnly) {
    let data = selectedOnly ? filterState.selectedRows.map(idx => filteredLinks[idx]) : filteredLinks;
    if (!data.length) return;

    const csvData = data.map(item => {
        const row = {};
        csvHeaders.forEach(header => row[header] = item[header] || '');
        return row;
    });

    const csv = Papa.unparse(csvData, { header: true });
    downloadCsv(csv.split('\n'), selectedOnly ? 'selected_links.csv' : `filtered_links_${new Date().toISOString().slice(0,10)}.csv`);
}

function updatePagination(totalPages) {
    elements.pagination.innerHTML = '';
    if (totalPages <= 1) return;

    const prevButton = document.createElement('button');
    prevButton.textContent = '←';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            filterState.currentPage = currentPage;
            saveState('filterState', filterState);
            updateResults();
        }
    });
    elements.pagination.appendChild(prevButton);

    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    if (startPage > 1) {
        const firstButton = document.createElement('button');
        firstButton.textContent = '1';
        firstButton.addEventListener('click', () => {
            currentPage = 1;
            filterState.currentPage = currentPage;
            saveState('filterState', filterState);
            updateResults();
        });
        elements.pagination.appendChild(firstButton);
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            elements.pagination.appendChild(ellipsis);
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        if (i === currentPage) pageButton.style.background = '#27391C';
        pageButton.addEventListener('click', () => {
            currentPage = i;
            filterState.currentPage = currentPage;
            saveState('filterState', filterState);
            updateResults();
        });
        elements.pagination.appendChild(pageButton);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            elements.pagination.appendChild(ellipsis);
        }
        const lastButton = document.createElement('button');
        lastButton.textContent = totalPages;
        lastButton.addEventListener('click', () => {
            currentPage = totalPages;
            filterState.currentPage = currentPage;
            saveState('filterState', filterState);
            updateResults();
        });
        elements.pagination.appendChild(lastButton);
    }

    const nextButton = document.createElement('button');
    nextButton.textContent = '→';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            filterState.currentPage = currentPage;
            saveState('filterState', filterState);
            updateResults();
        }
    });
    elements.pagination.appendChild(nextButton);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(error => {
            console.error('Service Worker registration failed:', error);
        });
    }
}

init();
