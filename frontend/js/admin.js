// Configuration
const API_URL = window.location.origin;
let authToken = localStorage.getItem('adminToken');

// DOM Elements
const loginContainer = document.getElementById('loginContainer');
const adminContainer = document.getElementById('adminContainer');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

// Analytics elements
const totalDocsEl = document.getElementById('totalDocs');
const totalChunksEl = document.getElementById('totalChunks');
const storageSizeEl = document.getElementById('storageSize');

// Upload elements
const fileUploadForm = document.getElementById('fileUploadForm');
const fileInput = document.getElementById('fileInput');
const fileUploadStatus = document.getElementById('fileUploadStatus');
const urlUploadForm = document.getElementById('urlUploadForm');
const urlInput = document.getElementById('urlInput');
const urlUploadStatus = document.getElementById('urlUploadStatus');

// Settings elements
const botSettingsForm = document.getElementById('botSettingsForm');
const botNameInput = document.getElementById('botName');
const welcomeMessageInput = document.getElementById('welcomeMessage');
const settingsStatus = document.getElementById('settingsStatus');
const undoIdentityBtn = document.getElementById('undoIdentityBtn');
const avatarUploadForm = document.getElementById('avatarUploadForm');
const avatarInput = document.getElementById('avatarInput');
const currentAvatarImg = document.getElementById('currentAvatar');
const avatarStatus = document.getElementById('avatarStatus');
const undoAvatarBtn = document.getElementById('undoAvatarBtn');

let originalSettings = null;
let previousAvatarUrl = null;
let previousIdentity = null;

// Documents elements
const documentsList = document.getElementById('documentsList');
const documentsToolbar = document.getElementById('documentsToolbar');
const refreshDocsBtn = document.getElementById('refreshDocsBtn');
const reindexBtn = document.getElementById('reindexBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

// Conversation elements
const conversationsList = document.getElementById('conversationsList');
const refreshConvsBtn = document.getElementById('refreshConvsBtn');
const conversationModal = document.getElementById('conversationModal');
const closeModal = document.getElementById('closeModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const downloadConvBtn = document.getElementById('downloadConvBtn');
const modalBody = document.getElementById('modalBody');
const modalTitle = document.getElementById('modalTitle');
const scrollToTopBtn = document.getElementById('scrollToTopBtn');
let currentViewedConversation = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupEventListeners();
});

// Check Authentication
function checkAuth() {
    if (authToken) {
        showAdmin();
        loadAnalytics();
        loadDocuments();
        loadSettings();
        loadConversations();
    } else {
        showLogin();
    }
}

function showLogin() {
    loginContainer.style.display = 'flex';
    adminContainer.style.display = 'none';
}

function showAdmin() {
    loginContainer.style.display = 'none';
    adminContainer.style.display = 'block';
}

// Event Listeners
function setupEventListeners() {
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);

    fileUploadForm.addEventListener('submit', handleFileUpload);
    urlUploadForm.addEventListener('submit', handleUrlUpload);

    botSettingsForm.addEventListener('submit', handleSettingsUpdate);
    avatarUploadForm.addEventListener('submit', handleAvatarUpload);
    undoIdentityBtn.addEventListener('click', handleUndoIdentity);
    undoAvatarBtn.addEventListener('click', handleUndoAvatar);

    refreshDocsBtn.addEventListener('click', loadDocuments);
    refreshConvsBtn.addEventListener('click', loadConversations);
    reindexBtn.addEventListener('click', handleReindex);
    clearAllBtn.addEventListener('click', handleClearAll);

    // Free Up DB Space button
    const purgeOriginalsBtn = document.getElementById('purgeOriginalsBtn');
    if (purgeOriginalsBtn) {
        purgeOriginalsBtn.addEventListener('click', handlePurgeOriginals);
    }

    // File input label update
    fileInput.addEventListener('change', (e) => {
        const fileName = e.target.files[0]?.name || 'Choose File';
        document.querySelector('.file-label-text').textContent = fileName;
    });

    // v1.1.0 Absolute Scroll Detection
    function handleScroll() {
        const btn = document.getElementById('scrollToTopBtn');
        if (!btn) return;

        const scrollAmount = window.pageYOffset || window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;

        if (scrollAmount > 100) {
            if (!btn.classList.contains('visible')) {
                btn.classList.add('visible');
                btn.style.display = 'flex';
            }
        } else {
            btn.classList.remove('visible');
            btn.style.display = 'none';
        }
    }

    // Attach to everything
    window.addEventListener('scroll', handleScroll, true);
    document.addEventListener('scroll', handleScroll, true);

    // Check every 1 second just in case
    setInterval(handleScroll, 1000);

    if (scrollToTopBtn) {
        scrollToTopBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Avatar input label update
    avatarInput.addEventListener('change', (e) => {
        const fileName = e.target.files[0]?.name || 'New Avatar';
        document.querySelector('.avatar-label-text').textContent = fileName;
    });

    // Password visibility toggle
    const passwordToggle = document.getElementById('passwordToggle');
    const passwordInput = document.getElementById('password');
    if (passwordToggle && passwordInput) {
        passwordToggle.addEventListener('click', () => {
            const isPassword = passwordInput.type === 'password';
            passwordInput.type = isPassword ? 'text' : 'password';
            passwordToggle.classList.toggle('visible', !isPassword);
        });
    }

    // Modal listeners
    closeModal.addEventListener('click', () => conversationModal.style.display = 'none');
    closeModalBtn.addEventListener('click', () => conversationModal.style.display = 'none');
    downloadConvBtn.addEventListener('click', handleDownloadConversation);
    window.addEventListener('click', (e) => {
        if (e.target === conversationModal) conversationModal.style.display = 'none';
    });
}

// ─── Purge Originals: Free Up DB Space ────────────────────────────────────────
async function handlePurgeOriginals() {
    if (!confirm('This will delete the stored file binaries from the database to free space.\n\nYour chatbot knowledge (text chunks) will NOT be affected.\n\nProceed?')) return;

    const btn = document.getElementById('purgeOriginalsBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Freeing space...'; }

    try {
        const response = await fetch(`${API_URL}/api/admin/purge-originals`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        const data = await response.json();

        if (response.ok) {
            showToast(`✅ ${data.message}`, 'success', 6000);
            loadAnalytics(); // Refresh the storage size card
            loadDocuments(); // IMPORTANT: Refresh UI so phantom download buttons are removed
        } else if (response.status === 401) {
            handleLogout();
        } else {
            showToast(`❌ Failed: ${data.error}`, 'error');
        }
    } catch (err) {
        console.error('Purge error:', err);
        showToast('❌ Failed to free space. Check your connection.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🗑️ Free Up DB Space'; }
    }
}


// Login
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const response = await fetch(`${API_URL}/api/admin/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('adminToken', authToken);
            showAdmin();
            loadAnalytics();
            loadDocuments();
        } else {
            showError(loginError, data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError(loginError, 'Login failed. Please try again.');
    }
}

// Logout
function handleLogout() {
    authToken = null;
    localStorage.removeItem('adminToken');
    window.location.href = 'index.html';
}

// Load Analytics
async function loadAnalytics() {
    try {
        const response = await fetch(`${API_URL}/api/admin/analytics`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            totalDocsEl.textContent = data.totalDocuments;
            totalChunksEl.textContent = data.totalChunks;
            storageSizeEl.textContent = formatBytes(data.storageSize);
        } else if (response.status === 401) {
            handleLogout();
        } else {
            const error = await response.json();
            console.error('Analytics failed:', error);
            totalDocsEl.textContent = 'Err';
            totalChunksEl.textContent = 'Err';
        }
    } catch (error) {
        console.error('Analytics error:', error);
        totalDocsEl.textContent = 'Err';
    }
}

// Load Documents
async function loadDocuments() {
    try {
        documentsList.innerHTML = '<div class="loading">Loading documents...</div>';

        const response = await fetch(`${API_URL}/api/admin/documents`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            displayDocuments(data.documents);
        } else if (response.status === 401) {
            handleLogout();
        } else {
            const error = await response.json();
            documentsList.innerHTML = `<div class="error-message">Failed to load documents: ${error.error || 'Server error'}</div>`;
        }
    } catch (error) {
        console.error('Documents error:', error);
        documentsList.innerHTML = `<div class="error-message">Failed to load documents: ${error.message}</div>`;
    }
}

// Helper: get a rich icon + label for a document based on its mime/type
function getFileTypeLabel(doc) {
    if (doc.type === 'webpage') return { icon: '🌐', label: 'Web Page' };
    const mime = (doc.mimetype || '').toLowerCase();
    if (mime.includes('pdf')) return { icon: '📕', label: 'PDF' };
    if (mime.includes('word') || mime.includes('docx') || mime.includes('doc')) return { icon: '📘', label: 'Word' };
    if (mime.includes('sheet') || mime.includes('xlsx') || mime.includes('xls')) return { icon: '📗', label: 'Excel' };
    if (mime.includes('presentation') || mime.includes('pptx') || mime.includes('ppt')) return { icon: '📙', label: 'PowerPoint' };
    if (mime.includes('text')) return { icon: '📄', label: 'Text' };
    return { icon: '📁', label: doc.mimetype || 'File' };
}

// Active filter state
let docFilter = 'all';
let docSearch = '';

// Render Document Toolbar (Search + Filters)
function renderDocumentsToolbar(documents) {
    if (!documentsToolbar) return;

    // Only render once to preserve input focus
    if (document.getElementById('docSearchInput')) {
        updateToolbarCounts(documents);
        return;
    }

    const activeCount = documents.filter(d => d.isActive).length;
    const pendingCount = documents.length - activeCount;

    documentsToolbar.innerHTML = `
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
            <input
                id="docSearchInput"
                type="text"
                placeholder="🔍 Search documents..."
                value="${escapeHtml(docSearch)}"
                style="flex:1; min-width:180px; padding:8px 12px; border:1px solid var(--border-color); border-radius:8px; font-size:0.9rem; background:var(--bg-secondary); color:var(--text-primary);"
            />
            <div style="display:flex; gap:6px;">
                <button onclick="changeDocFilter('all')" id="filter-all" class="filter-pill ${docFilter === 'all' ? 'active' : ''}" style="padding:6px 14px; border-radius:20px; border:1px solid var(--border-color); cursor:pointer; font-size:0.82rem; background:${docFilter === 'all' ? 'var(--text-accent)' : 'var(--bg-secondary)'}; color:${docFilter === 'all' ? '#fff' : 'var(--text-secondary)'}; font-weight:600;">
                    All (<span class="count">${documents.length}</span>)
                </button>
                <button onclick="changeDocFilter('active')" id="filter-active" class="filter-pill ${docFilter === 'active' ? 'active' : ''}" style="padding:6px 14px; border-radius:20px; border:1px solid var(--border-color); cursor:pointer; font-size:0.82rem; background:${docFilter === 'active' ? '#22c55e' : 'var(--bg-secondary)'}; color:${docFilter === 'active' ? '#fff' : 'var(--text-secondary)'}; font-weight:600;">
                    ✅ Active (<span class="count">${activeCount}</span>)
                </button>
                <button onclick="changeDocFilter('pending')" id="filter-pending" class="filter-pill ${docFilter === 'pending' ? 'active' : ''}" style="padding:6px 14px; border-radius:20px; border:1px solid var(--border-color); cursor:pointer; font-size:0.82rem; background:${docFilter === 'pending' ? '#f59e0b' : 'var(--bg-secondary)'}; color:${docFilter === 'pending' ? '#fff' : 'var(--text-secondary)'}; font-weight:600;">
                    ⏳ Pending (<span class="count">${pendingCount}</span>)
                </button>
            </div>
        </div>
    `;

    // Bind search input — it will stay in the DOM
    const searchInput = document.getElementById('docSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            docSearch = e.target.value;
            // IMPORTANT: We only re-render the list, NOT the toolbar
            const allDocuments = window.lastFetchedDocuments || [];
            displayDocumentsListOnly(allDocuments);
        });
    }
}

// Update counts in existing toolbar buttons without re-rendering
function updateToolbarCounts(documents) {
    const activeCount = documents.filter(d => d.isActive).length;
    const pendingCount = documents.length - activeCount;

    const allBtn = document.querySelector('#filter-all .count');
    const activeBtn = document.querySelector('#filter-active .count');
    const pendingBtn = document.querySelector('#filter-pending .count');

    if (allBtn) allBtn.textContent = documents.length;
    if (activeBtn) activeBtn.textContent = activeCount;
    if (pendingBtn) pendingBtn.textContent = pendingCount;
}

// Global filter change handler that keeps the toolbar but updates buttons and list
window.changeDocFilter = function (filter) {
    docFilter = filter;

    // Update button styles
    const buttons = documentsToolbar.querySelectorAll('.filter-pill');
    buttons.forEach(btn => {
        const id = btn.id;
        const isActive = id === `filter-${filter}`;
        btn.classList.toggle('active', isActive);

        if (id === 'filter-all') {
            btn.style.background = isActive ? 'var(--text-accent)' : 'var(--bg-secondary)';
        } else if (id === 'filter-active') {
            btn.style.background = isActive ? '#22c55e' : 'var(--bg-secondary)';
        } else if (id === 'filter-pending') {
            btn.style.background = isActive ? '#f59e0b' : 'var(--bg-secondary)';
        }
        btn.style.color = isActive ? '#fff' : 'var(--text-secondary)';
    });

    const allDocuments = window.lastFetchedDocuments || [];
    displayDocumentsListOnly(allDocuments);
};

// Main function to display documents
function displayDocuments(documents) {
    window.lastFetchedDocuments = documents; // Store for search/filter reference

    if (!documents || documents.length === 0) {
        if (documentsToolbar) documentsToolbar.innerHTML = '';
        documentsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📚</div>
                <p>No documents uploaded yet</p>
                <p style="font-size: 0.9rem; margin-top: 8px;">Upload documents to start building your knowledge base</p>
            </div>
        `;
        return;
    }

    renderDocumentsToolbar(documents);
    displayDocumentsListOnly(documents);
}

// Separate function that ONLY updates the list of document items
function displayDocumentsListOnly(documents) {
    // Sort documents: pending first, then active, then by creation date
    const sortedDocs = [...documents].sort((a, b) => {
        if (a.isActive === b.isActive) {
            return new Date(b.createdAt) - new Date(a.createdAt); // Newest first
        }
        return a.isActive ? 1 : -1; // Pending (false) comes before active (true)
    });

    // Apply filter + search
    const filtered = sortedDocs.filter(doc => {
        if (docFilter === 'active' && !doc.isActive) return false;
        if (docFilter === 'pending' && doc.isActive) return false;
        if (docSearch) {
            const q = docSearch.toLowerCase();
            return (doc.filename || '').toLowerCase().includes(q) ||
                (doc.source || '').toLowerCase().includes(q) ||
                (doc.category || '').toLowerCase().includes(q);
        }
        return true;
    });

    if (filtered.length === 0) {
        documentsList.innerHTML = `<div class="empty-state"><p>No documents match your search or filter.</p></div>`;
        return;
    }

    const itemsHtml = filtered.map(doc => {
        const ft = getFileTypeLabel(doc);
        return `
        <div class="document-item ${doc.isActive ? 'active-border' : 'pending-border'}">
            <div class="document-info">
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                    <span style="font-size:1.4rem;">${ft.icon}</span>
                    <div class="document-title" style="flex:1;">${escapeHtml(doc.filename || doc.source)}</div>
                    <span class="status-badge ${doc.isActive ? 'active' : 'pending'}">
                        ${doc.isActive ? '✅ Active' : '⏳ Pending'}
                    </span>
                </div>
                <div class="document-meta">
                    <span style="background:rgba(0,0,0,0.06);padding:2px 8px;border-radius:12px;font-size:0.78rem;font-weight:600;">${ft.label}</span>
                    ${doc.category ? `<span class="category-badge">${escapeHtml(doc.category)}</span>` : ''}
                    <span>🧩 ${doc.chunks} chunks</span>
                    <span>🕒 ${formatDate(doc.createdAt)}</span>
                </div>
                ${doc.summary ? `
                <div class="document-summary" style="margin-top:6px;">
                    <strong>🤖 AI Summary:</strong>
                    <p>${escapeHtml(doc.summary)}</p>
                </div>
                ` : ''}
            </div>
            <div class="document-actions">
                ${!doc.isActive ? `
                <button class="btn-icon approve" title="Include in Chatbot" data-source="${escapeHtml(doc.source)}" onclick="approveDocumentBySource(this.getAttribute('data-source'))">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M20 6L9 17L4 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                ` : `
                <button class="btn-icon deactivate" title="Exclude from Chatbot" data-source="${escapeHtml(doc.source)}" onclick="deactivateDocumentBySource(this.getAttribute('data-source'))">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M18 6L6 18M6 6l12 12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                `}
                ${doc.type !== 'webpage' ? (doc.hasOriginal ? `
                <button class="btn-icon download" title="Download Original File" data-source="${escapeHtml(doc.source)}" onclick="downloadDocumentBySource(this.getAttribute('data-source'))">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                ` : `
                <button class="btn-icon" title="Re-upload this document to enable download" disabled style="opacity:0.3; cursor:not-allowed;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                `) : ''}
                <button class="btn-icon delete" title="Delete Document" data-source="${escapeHtml(doc.source)}" onclick="deleteDocumentBySource(this.getAttribute('data-source'))">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        </div>
        `;
    }).join('');

    documentsList.innerHTML = itemsHtml;
}




// Download Document By Source
async function downloadDocumentBySource(source) {
    // Find and update the download button to show loading state
    const buttons = document.querySelectorAll('.btn-icon.download');
    let clickedBtn = null;
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(source.replace(/'/g, "\\'"))) {
            clickedBtn = btn;
        }
    });

    if (clickedBtn) {
        clickedBtn.disabled = true;
        clickedBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10" stroke-width="2"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></circle></svg>`;
    }

    try {
        const response = await fetch(`${API_URL}/api/admin/document/download?source=${encodeURIComponent(source)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;

            // Try to get filename from content-disposition header
            const contentDisposition = response.headers.get('content-disposition');
            let filename = source.split('/').pop() || source;
            if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
                filename = contentDisposition.split('filename=')[1].replace(/['"]/g, '').trim();
            }

            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            showToast('✅ Download started!', 'success');
        } else if (response.status === 404) {
            const errData = await response.json().catch(() => ({}));
            showToast(`⚠️ ${errData.error || 'Original file not available. Please re-upload to enable download.'}`, 'warning', 8000);
        } else if (response.status === 401) {
            handleLogout();
        } else {
            const error = await response.json().catch(() => ({ error: 'Server error' }));
            showToast(`❌ Download failed: ${error.error || 'Server error'}`, 'error', 8000);
        }
    } catch (error) {
        console.error('Download error:', error);
        showToast('❌ Failed to download document. Please check your connection.', 'error');
    } finally {
        // Restore button
        if (clickedBtn) {
            clickedBtn.disabled = false;
            clickedBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }
    }
}

// Approve Document By Source
async function approveDocumentBySource(source) {
    try {
        const response = await fetch(`${API_URL}/api/admin/document/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ source })
        });

        if (response.ok) {
            loadAnalytics();
            loadDocuments();
        } else if (response.status === 401) {
            handleLogout();
        } else {
            alert('Failed to approve document');
        }
    } catch (error) {
        console.error('Approve error:', error);
        alert('Failed to approve document');
    }
}

// Deactivate Document By Source
async function deactivateDocumentBySource(source) {
    try {
        const response = await fetch(`${API_URL}/api/admin/document/deactivate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ source })
        });

        if (response.ok) {
            loadAnalytics();
            loadDocuments();
        } else if (response.status === 401) {
            handleLogout();
        } else {
            alert('Failed to deactivate document');
        }
    } catch (error) {
        console.error('Deactivate error:', error);
        alert('Failed to deactivate document');
    }
}

// Delete Document By Source
async function deleteDocumentBySource(source) {
    if (!confirm(`Are you sure you want to delete "${source}" and all its parts?`)) return;

    try {
        const response = await fetch(`${API_URL}/api/admin/document/source?source=${encodeURIComponent(source)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            loadAnalytics();
            loadDocuments();
        } else if (response.status === 401) {
            handleLogout();
        } else {
            alert('Failed to delete document');
        }
    } catch (error) {
        console.error('Delete error:', error);
        alert('Failed to delete document');
    }
}

// This function is replaced by deleteDocumentBySource

// File Upload
async function handleFileUpload(e) {
    e.preventDefault();

    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    showStatus(fileUploadStatus, 'Uploading and processing...', 'loading');

    try {
        const response = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(fileUploadStatus, `✅ ${data.message} (${data.chunks} chunks created)`, 'success');
            fileUploadForm.reset();
            document.querySelector('.file-label-text').textContent = 'Choose File';

            // Wait a moment for the server to finish all tasks before refreshing
            console.log('Upload successful, refreshing dashboard in 500ms...');
            setTimeout(() => {
                loadAnalytics();
                loadDocuments();
            }, 500);
        } else {
            let errorMsg = 'Upload failed';
            try {
                const data = await response.json();
                errorMsg = data.error || data.message || errorMsg;
            } catch (e) {
                if (response.status === 413) errorMsg = 'File too large (Server limit exceeded)';
                else errorMsg = `Server error ${response.status}: ${response.statusText}`;
            }
            showStatus(fileUploadStatus, `❌ ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showStatus(fileUploadStatus, '❌ Upload failed — check your connection and try again', 'error');
    }
}

// URL Upload
async function handleUrlUpload(e) {
    e.preventDefault();

    const urlRaw = urlInput.value.trim();
    if (!urlRaw) return;

    // Split by newlines and filter empty lines
    const urlList = urlRaw.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (urlList.length === 0) return;

    const autoApprove = document.getElementById('urlAutoApprove')?.checked || false;

    showStatus(urlUploadStatus, urlList.length > 1
        ? `Fetching and processing ${urlList.length} URLs...`
        : 'Fetching and processing...', 'loading');

    try {
        const response = await fetch(`${API_URL}/api/upload/url`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                urls: urlList,
                autoApprove: autoApprove
            })
        });

        const data = await response.json();

        if (response.ok) {
            let msg = '✅ URL(s) processed';
            if (data.errors && data.errors.length > 0) {
                msg = `✅ Processed ${data.results.length} URLs, but ${data.errors.length} failed.`;
            } else if (autoApprove) {
                msg = `✅ ${urlList.length} URL(s) indexed and active!`;
            } else {
                msg = `✅ ${urlList.length} URL(s) pending review.`;
            }

            showStatus(urlUploadStatus, msg, 'success');
            urlInput.value = '';

            // Refresh counts and lists
            setTimeout(() => {
                loadDocuments();
                loadAnalytics();
            }, 800);
        } else {
            showStatus(urlUploadStatus, `❌ ${data.error || 'Failed to process URLs'}`, 'error');
        }
    } catch (error) {
        console.error('URL upload error:', error);
        showStatus(urlUploadStatus, '❌ Processing failed. Check your connection.', 'error');
    }
}

// This function is replaced by deleteDocumentBySource

// Re-index
async function handleReindex() {
    if (!confirm('Re-indexing will regenerate embeddings for all documents. This may take some time. Continue?')) return;

    reindexBtn.disabled = true;
    reindexBtn.textContent = 'Re-indexing...';

    try {
        const response = await fetch(`${API_URL}/api/admin/reindex`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            alert('Re-indexing completed successfully!');
        } else if (response.status === 401) {
            handleLogout();
        } else {
            alert('Re-indexing failed');
        }
    } catch (error) {
        console.error('Reindex error:', error);
        alert('Re-indexing failed');
    } finally {
        reindexBtn.disabled = false;
        reindexBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 20V10M12 10L8 14M12 10l4 4M3 3l18 18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Re-index All
        `;
    }
}

// Clear All
async function handleClearAll() {
    if (!confirm('⚠️ WARNING: This will delete ALL documents from the knowledge base. This action cannot be undone. Are you sure?')) return;

    try {
        const response = await fetch(`${API_URL}/api/admin/clear-all`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            loadAnalytics();
            loadDocuments();
            alert('All documents cleared successfully');
        } else if (response.status === 401) {
            handleLogout();
        } else {
            alert('Failed to clear documents');
        }
    } catch (error) {
        console.error('Clear all error:', error);
        alert('Failed to clear documents');
    }
}

// Utility Functions
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = `upload-status ${type}`;

    if (type === 'success') {
        setTimeout(() => {
            element.className = 'upload-status';
        }, 5000);
    }
}

function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Load Settings
async function loadSettings() {
    try {
        const response = await fetch(`${API_URL}/api/settings`);
        if (response.ok) {
            const settings = await response.json();
            originalSettings = { ...settings }; // Store original state

            botNameInput.value = settings.botName || 'MelissAI';
            welcomeMessageInput.value = settings.welcomeMessage || '';
            currentAvatarImg.src = settings.avatarUrl || 'images/bot-silhouette.svg';

            // Initialize previous states
            previousAvatarUrl = null;
            previousIdentity = null;

            // Show undo buttons
            undoIdentityBtn.style.display = 'block';
            undoAvatarBtn.style.display = 'block';
        }
    } catch (error) {
        console.error('Settings load error:', error);
    }
}

// Update Settings
async function handleSettingsUpdate(e) {
    e.preventDefault();

    const botName = botNameInput.value.trim();
    const welcomeMessage = welcomeMessageInput.value.trim();

    showStatus(settingsStatus, 'Updating settings...', 'loading');

    try {
        const response = await fetch(`${API_URL}/api/settings/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ botName, welcomeMessage })
        });

        if (response.ok) {
            const data = await response.json();

            // Store previous identity before updating
            previousIdentity = {
                botName: originalSettings.botName,
                welcomeMessage: originalSettings.welcomeMessage
            };

            // Update our local memory of the current settings
            originalSettings = { ...data.settings };

            // Update preview
            currentAvatarImg.src = data.settings.avatarUrl;
            showStatus(settingsStatus, '✅ Identity saved', 'success');
        } else {
            showStatus(settingsStatus, '❌ Update failed', 'error');
        }
    } catch (error) {
        console.error('Update settings error:', error);
        showStatus(settingsStatus, '❌ Error updating settings', 'error');
    }
}

// Upload Avatar
async function handleAvatarUpload(e) {
    e.preventDefault();

    const file = avatarInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    showStatus(avatarStatus, 'Uploading avatar...', 'loading');

    try {
        const response = await fetch(`${API_URL}/api/settings/avatar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        if (response.ok) {
            const data = await response.json();

            // The NEW previous becomes the one we had right before this upload
            previousAvatarUrl = originalSettings.avatarUrl;

            // The NEW current is what the server just gave us
            originalSettings.avatarUrl = data.avatarUrl;

            showStatus(avatarStatus, '✅ Avatar updated', 'success');
            currentAvatarImg.src = data.avatarUrl;

            avatarUploadForm.reset();
            document.querySelector('.avatar-label-text').textContent = 'Select New Photo';
        } else {
            let errorMsg = 'Upload failed';
            try {
                const data = await response.json();
                errorMsg = data.error || errorMsg;
            } catch (e) {
                if (response.status === 413) errorMsg = 'File too large (Server limit exceeded)';
                else errorMsg = `Server error ${response.status}: ${response.statusText}`;
            }
            showStatus(avatarStatus, `❌ ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Avatar upload error:', error);
        showStatus(avatarStatus, '❌ Error connecting to server', 'error');
    }
}

async function handleUndoAvatar() {
    if (!previousAvatarUrl) {
        showStatus(avatarStatus, 'ℹ️ No previous photo in this session', 'error');
        return;
    }

    showStatus(avatarStatus, 'Restoring previous photo...', 'loading');

    try {
        const response = await fetch(`${API_URL}/api/settings/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ avatarUrl: previousAvatarUrl })
        });

        if (response.ok) {
            const data = await response.json();

            // Swap them so another "Undo" toggles back
            const oldCurrent = originalSettings.avatarUrl;
            originalSettings.avatarUrl = previousAvatarUrl;
            previousAvatarUrl = oldCurrent;

            currentAvatarImg.src = originalSettings.avatarUrl;

            showStatus(avatarStatus, '✅ Photo restored', 'success');
        } else {
            showStatus(avatarStatus, '❌ Restore failed', 'error');
        }
    } catch (error) {
        console.error('Undo avatar error:', error);
        showStatus(avatarStatus, '❌ Error connecting to server', 'error');
    }
}

// Dedicated function to restore a specific avatar URL (used as helper)
async function restoreAvatar(url) {
    if (!url) return;
    showStatus(avatarStatus, 'Restoring photo...', 'loading');
    try {
        const response = await fetch(`${API_URL}/api/settings/update`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ avatarUrl: url })
        });

        if (response.ok) {
            currentAvatarImg.src = url;
            previousAvatarUrl = originalSettings.avatarUrl;
            originalSettings.avatarUrl = url;
            showStatus(avatarStatus, '✅ Photo restored', 'success');
        } else {
            showStatus(avatarStatus, '❌ Restore failed', 'error');
        }
    } catch (error) {
        console.error('Restore error:', error);
        showStatus(avatarStatus, '❌ Error restoring photo', 'error');
    }
}

// Undo Identity Changes
function handleUndoIdentity() {
    if (!previousIdentity) {
        // If no previous save, just reset to original loaded state
        botNameInput.value = originalSettings.botName || 'MelissAI';
        welcomeMessageInput.value = originalSettings.welcomeMessage || '';
        showStatus(settingsStatus, 'Restored to last saved values', 'success');
        return;
    }

    // Toggle/Restore logic
    const currentName = botNameInput.value.trim();
    const currentMsg = welcomeMessageInput.value.trim();

    botNameInput.value = previousIdentity.botName;
    welcomeMessageInput.value = previousIdentity.welcomeMessage;

    // Allow toggling back
    previousIdentity = {
        botName: currentName,
        welcomeMessage: currentMsg
    };

    showStatus(settingsStatus, 'Restored previous identity values', 'success');
}



// ─── Conversations logic moved to bottom of file ───

// ─── Toast Notification System ────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
    // Create container if it doesn't exist
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('toast-visible'));

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.remove('toast-visible');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMessage(text) {
    if (!text) return '';

    // Un-escape markdown brackets if they were escaped by OpenAI
    text = text.replace(/\\\[/g, '[').replace(/\\\]/g, ']').replace(/\\\(/g, '(').replace(/\\\)/g, ')');

    // 1. Convert markdown links: [text](url) -> <a href="url" target="_blank">text</a>
    text = text.replace(/\[([\s\S]*?)\]\s*\(\s*(https?:\/\/[^\s)"]+)\s*\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #22c55e; text-decoration: underline;">$1</a>');

    // 2. Handle bare URLs
    text = text.replace(/(^|\s)(https?:\/\/[^\s<]+[^.,\s<])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color: #22c55e; text-decoration: underline;">$2</a>');

    // 2. Convert bold markdown **text** to <strong>text</strong>
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 3. Handle simple lists
    const lines = text.split('\n');
    let formattedLines = [];
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('- ')) {
            formattedLines.push(`<li style="margin-left: 20px;">${trimmed.substring(2)}</li>`);
        } else if (/^\d+\. /.test(trimmed)) {
            formattedLines.push(`<li style="margin-left: 20px;">${trimmed}</li>`);
        } else {
            formattedLines.push(line.trim() ? `<p style="margin: 4px 0;">${line}</p>` : '<br>');
        }
    });

    return formattedLines.join('');
}

// ─── Conversations ────────────────────────────────────────────────────────────

async function loadConversations() {
    if (!conversationsList) return;
    conversationsList.innerHTML = '<div class="loading">Loading conversations...</div>';

    try {
        const response = await fetch(`${API_URL}/api/chat/conversations`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            conversationsList.innerHTML = '<div class="empty-state"><p>No recent conversations</p></div>';
            return;
        }

        const data = await response.json();
        const convs = data.conversations || [];

        if (convs.length === 0) {
            conversationsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <p>No recent conversations</p>
                    <p style="font-size:0.85rem;color:#6b7280;margin-top:6px;">Conversations will appear here once users start chatting</p>
                </div>`;
            return;
        }

        conversationsList.innerHTML = convs.map(conv => {
            const lastMsg = conv.lastMessage;
            const preview = lastMsg
                ? (lastMsg.content || '').substring(0, 80) + (lastMsg.content?.length > 80 ? '...' : '')
                : 'No messages';
            const role = lastMsg?.role === 'user' ? '👤' : '🤖';
            const updatedAt = conv.updatedAt ? new Date(conv.updatedAt).toLocaleString() : '';

            return `
            <div class="conversation-item" style="background:white;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;" onclick="viewConversation('${escapeHtml(conv.id)}')">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="font-weight:600;font-size:13px;color:#111827;">Conv: ${escapeHtml(conv.id).substring(0, 20)}...</span>
                        <span style="background:#dbeafe;color:#1e40af;font-size:11px;padding:2px 8px;border-radius:20px;">${conv.messageCount || 0} msgs</span>
                    </div>
                    <div style="font-size:13px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${role} ${escapeHtml(preview)}</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:4px;">${updatedAt}</div>
                </div>
                <button onclick="event.stopPropagation(); deleteConversation('${escapeHtml(conv.id)}')" style="background:none;border:1px solid #fca5a5;color:#ef4444;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;flex-shrink:0;">Delete</button>
            </div>`;
        }).join('');

    } catch (err) {
        console.error('Load conversations error:', err);
        conversationsList.innerHTML = '<div class="empty-state"><p>No recent conversations</p></div>';
    }
}

async function viewConversation(convId) {
    try {
        const response = await fetch(`${API_URL}/api/chat/conversation/${encodeURIComponent(convId)}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) { showToast('Could not load conversation', 'error'); return; }

        const data = await response.json();
        const messages = data.conversation || [];
        currentViewedConversation = { id: convId, messages };

        modalTitle.textContent = `Conversation: ${convId.substring(0, 30)}...`;
        modalBody.innerHTML = messages.length === 0
            ? '<p style="color:#6b7280;text-align:center;padding:20px;">No messages</p>'
            : messages.map(m => `
                <div style="display:flex;gap:10px;margin-bottom:14px;flex-direction:${m.role === 'user' ? 'row-reverse' : 'row'};">
                    <div style="width:32px;height:32px;border-radius:50%;background:${m.role === 'user' ? '#6b7280' : '#22c55e'};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">${m.role === 'user' ? '👤' : '🤖'}</div>
                    <div style="max-width:75%;background:${m.role === 'user' ? '#f3f4f6' : 'white'};border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;font-size:13px;line-height:1.5;">${formatMessage(m.content || '')}</div>
                </div>`).join('');

        conversationModal.style.display = 'flex';
    } catch (err) {
        showToast('Failed to load conversation details', 'error');
    }
}

async function deleteConversation(convId) {
    if (!confirm('Delete this conversation?')) return;
    try {
        await fetch(`${API_URL}/api/chat/conversation/${encodeURIComponent(convId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        showToast('Conversation deleted', 'success');
        loadConversations();
    } catch (err) {
        showToast('Failed to delete conversation', 'error');
    }
}

function handleDownloadConversation() {
    if (!currentViewedConversation) return;
    const blob = new Blob([JSON.stringify(currentViewedConversation, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${currentViewedConversation.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
