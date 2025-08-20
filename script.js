// Script powering the Edina Circular web experience.
// Handles menu toggling, item and request storage, and basic matching
// between requested items and available listings.

document.addEventListener('DOMContentLoaded', () => {
    const navList = document.querySelector('.nav-list');
    const menuToggle = document.getElementById('menu-toggle');

    // Toggle mobile navigation
    menuToggle.addEventListener('click', () => {
        navList.classList.toggle('open');
    });

    // Data arrays.  These will be populated from the backend on page load.
    let items = [];
    let requests = [];
    let volunteers = [];
    let donations = [];

    // Track the currently logged in user (if any).  Users are persisted in
    // localStorage under the key 'ec_current_user'.  See loadCurrentUser().
    let currentUser = null;

    // --- CONFIGURATION ---
    // SHA‑256 hash of a secret phrase used to toggle admin mode.  Change this to your own hash by
    // computing the hash of your chosen passphrase (see README or prompt for instructions).
    // Use the same passphrase as the live site ("admin123") so you and Stellan can reuse the existing credentials.
    // SHA‑256 hash of "admin123" (computed via Web Crypto API).
    const ADMIN_PASSPHRASE_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    // Tracks whether admin mode is active; when true, delete buttons are visible and deletion is allowed
    let adminMode = false;

    // Items older than this number of days will be automatically removed to keep the catalogue fresh.
    const ITEM_EXPIRY_DAYS = 60;

    /**
     * Compute the SHA‑256 hash of a string and return a hex string.  Uses Web Crypto API.
     * @param {string} text
     * @returns {Promise<string>}
     */
    const toHash = async (text) => {
        const enc = new TextEncoder().encode(text);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    };

    /**
     * Compress an image file to a data URL.  This resizes the image to a maximum dimension
     * and reduces quality to save space.  Returns null if no file is provided.
     * @param {File|null} file
     * @param {number} maxDim
     * @param {number} quality
     * @returns {Promise<string|null>}
     */
    async function fileToDataUrlCompressed(file, maxDim = 1200, quality = 0.8) {
        if (!file) return null;
        return new Promise((resolve, reject) => {
            const img = document.createElement('img');
            const fr = new FileReader();
            fr.onload = () => {
                img.src = fr.result;
                img.onload = () => {
                    const { width, height } = img;
                    const scale = Math.min(maxDim / Math.max(width, height), 1);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(width * scale);
                    canvas.height = Math.round(height * scale);
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    resolve(dataUrl);
                };
            };
            fr.onerror = (err) => reject(err);
            fr.readAsDataURL(file);
        });
    }

    try {
        const savedItems = localStorage.getItem('ec_items');
        const savedReq = localStorage.getItem('ec_requests');
        if (savedItems) items = JSON.parse(savedItems);
        if (savedReq) requests = JSON.parse(savedReq);
        const savedVols = localStorage.getItem('ec_volunteers');
        const savedDon = localStorage.getItem('ec_donations');
        if (savedVols) volunteers = JSON.parse(savedVols);
        if (savedDon) donations = JSON.parse(savedDon);
    } catch (err) {
        console.warn('Could not parse stored data:', err);
    }

    // Load current user from localStorage
    function loadCurrentUser() {
        try {
            const savedUser = localStorage.getItem('ec_current_user');
            if (savedUser) {
                currentUser = JSON.parse(savedUser);
            }
        } catch (err) {
            console.warn('Could not parse saved user', err);
            currentUser = null;
        }
        updateAuthUI();
    }

    // Show/hide auth forms based on user state and prefill lender fields
    function updateAuthUI() {
        const regFormBlock = document.getElementById('register-form');
        const loginFormBlock = document.getElementById('login-form');
        const userInfoBlock = document.getElementById('user-info');
        const userNameDisplay = document.getElementById('user-name-display');
        const lenderNameRow = document.getElementById('lender-name')?.closest('.form-row');
        const lenderContactRow = document.getElementById('lender-contact')?.closest('.form-row');
        const lenderBioRow = document.getElementById('lender-bio')?.closest('.form-row');
        const lenderPhotoRow = document.getElementById('lender-photo')?.closest('.form-row');
        if (!regFormBlock || !loginFormBlock || !userInfoBlock) return;
        if (currentUser) {
            // Hide auth forms, show welcome
            regFormBlock.style.display = 'none';
            loginFormBlock.style.display = 'none';
            userInfoBlock.style.display = 'block';
            if (userNameDisplay) userNameDisplay.textContent = currentUser.name || '';
            // Prefill item form and hide lender details
            if (document.getElementById('lender-name')) {
                document.getElementById('lender-name').value = currentUser.name || '';
            }
            if (document.getElementById('lender-contact')) {
                document.getElementById('lender-contact').value = currentUser.contact || '';
            }
            if (document.getElementById('lender-bio')) {
                document.getElementById('lender-bio').value = currentUser.bio || '';
            }
            if (lenderNameRow) lenderNameRow.style.display = 'none';
            if (lenderContactRow) lenderContactRow.style.display = 'none';
            if (lenderBioRow) lenderBioRow.style.display = 'none';
            if (lenderPhotoRow) lenderPhotoRow.style.display = 'none';
        } else {
            // Show auth forms
            regFormBlock.style.display = 'block';
            loginFormBlock.style.display = 'block';
            userInfoBlock.style.display = 'none';
            // Show lender fields
            if (lenderNameRow) lenderNameRow.style.display = '';
            if (lenderContactRow) lenderContactRow.style.display = '';
            if (lenderBioRow) lenderBioRow.style.display = '';
            if (lenderPhotoRow) lenderPhotoRow.style.display = '';
            // Clear form values
            if (document.getElementById('lender-name')) document.getElementById('lender-name').value = '';
            if (document.getElementById('lender-contact')) document.getElementById('lender-contact').value = '';
            if (document.getElementById('lender-bio')) document.getElementById('lender-bio').value = '';
        }
    }

    // Display message in auth section
    function showAuthMessage(msg, isError = false) {
        const msgEl = document.getElementById('auth-message');
        if (msgEl) {
            msgEl.textContent = msg;
            msgEl.style.display = 'block';
            msgEl.style.color = isError ? 'var(--error-red)' : 'var(--dark-green)';
            setTimeout(() => {
                msgEl.style.display = 'none';
            }, 5000);
        }
    }

    // -------------------------------------------------------------------------
    // Backend integration
    // -------------------------------------------------------------------------
    // Base URL for the backend API.  When running locally this points at the
    // Express server (see backend/server.js).  Change this to your deployed
    // backend endpoint if necessary.
// Base URL for the backend API. When running locally this points at the local Express server.
// In production the frontend should point at the deployed Render backend.
const API_BASE = 'https://edina-circular-backend.onrender.com';

    /**
     * Load items and requests from the backend.  On success this will
     * overwrite the local items/requests arrays and trigger a re-render.
     */
    async function loadFromBackend() {
        try {
            const [itemsRes, reqRes] = await Promise.all([
                fetch(`${API_BASE}/items`),
                fetch(`${API_BASE}/requests`)
            ]);
            if (itemsRes.ok) {
                items = await itemsRes.json();
            }
            if (reqRes.ok) {
                requests = await reqRes.json();
            }
            // Save to localStorage for offline fallback
            saveData();
            renderItems();
            renderRequests();
            updateMetrics();
            renderAdminDashboard();
        } catch (err) {
            console.warn('Failed to fetch backend data:', err);
        }
    }


    const itemsListEl = document.getElementById('items-list');
    const requestsListEl = document.getElementById('requests-list');
    const itemSuccess = document.getElementById('item-success');
    const requestSuccess = document.getElementById('request-success');

    // volunteer & donation elements
    const volSuccess = document.getElementById('vol-success');
    const donSuccess = document.getElementById('don-success');

    // Render functions
    function renderItems() {
        // Remove expired items (older than ITEM_EXPIRY_DAYS) before rendering
        const now = Date.now();
        const expiryMs = ITEM_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        let changed = false;
        items = items.filter(it => {
            if (!it.createdAt) return true;
            const age = now - it.createdAt;
            if (age > expiryMs) {
                changed = true;
                return false;
            }
            return true;
        });
        if (changed) {
            saveData();
        }
        itemsListEl.innerHTML = '';
        if (items.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No items have been shared yet. Be the first!';
            itemsListEl.appendChild(empty);
            return;
        }
        items.forEach((item, idx) => {
            const card = document.createElement('div');
            card.className = 'card';
            // Data attributes for multi‑field search
            card.dataset.name = (item.name || '').toLowerCase();
            card.dataset.category = (item.category || '').toLowerCase();
            card.dataset.type = (item.type || '').toLowerCase();
            card.dataset.lender = (item.lenderName || '').toLowerCase();
            card.dataset.description = (item.description || '').toLowerCase();
            // Optional photo thumbnail
            if (item.photoDataUrl) {
                const img = document.createElement('img');
                img.className = 'thumb';
                img.src = item.photoDataUrl;
                img.alt = `${item.name} photo`;
                card.appendChild(img);
            }
                // Title and chips
            const title = document.createElement('h4');
            title.textContent = item.name;
            const typeChip = document.createElement('span');
            typeChip.className = 'chip';
            typeChip.textContent = item.type === 'lend' ? 'Borrow' : 'Free';
            const categoryChip = document.createElement('span');
            categoryChip.className = 'chip';
            categoryChip.textContent = item.category;
                const desc = document.createElement('p');
                desc.textContent = item.description;
                // Optional lender portrait
                if (item.lenderPhotoDataUrl) {
                    const lp = document.createElement('img');
                    lp.className = 'lender-photo';
                    lp.src = item.lenderPhotoDataUrl;
                    lp.alt = `${item.lenderName} portrait`;
                    card.appendChild(lp);
                }
                // Lender name and truncated bio (if provided)
                const lender = document.createElement('p');
                lender.className = 'lender';
                lender.textContent = `Lender: ${item.lenderName}`;
                let bioSnippet = '';
                if (item.lenderBio) {
                    bioSnippet = item.lenderBio.length > 120 ? item.lenderBio.slice(0, 120) + '…' : item.lenderBio;
                }
                const bioP = document.createElement('p');
                if (bioSnippet) bioP.textContent = bioSnippet;
                // Rating stars
                const ratingEl = document.createElement('div');
                ratingEl.className = 'rating';
                for (let s = 1; s <= 5; s++) {
                    const star = document.createElement('span');
                    star.className = 'star' + (item.rating && item.rating >= s ? ' filled' : '');
                    star.textContent = '★';
                    star.addEventListener('click', (evt) => {
                        evt.stopPropagation();
                        setItemRating(idx, s);
                    });
                    ratingEl.appendChild(star);
                }
                card.appendChild(title);
                card.appendChild(typeChip);
                card.appendChild(categoryChip);
                card.appendChild(desc);
                card.appendChild(lender);
                if (bioSnippet) card.appendChild(bioP);
                card.appendChild(ratingEl);
            // Verified badge
            if (item.verified) {
                const badge = document.createElement('span');
                badge.className = 'badge verified';
                badge.textContent = 'Verified';
                card.appendChild(badge);
            }
            // Admin delete actions
            const adminRow = document.createElement('div');
            adminRow.className = 'admin-actions';
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!adminMode) return;
                if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                    try {
                        // Attempt to delete via backend
                        await fetch(`${API_BASE}/items/${item.id}`, { method: 'DELETE' });
                    } catch (err) {
                        console.warn('Failed to delete item via backend:', err);
                    }
                    // Remove locally regardless of backend result
                    items = items.filter(it => it.id !== item.id);
                    saveData();
                    renderItems();
                    updateMetrics();
                    renderAdminDashboard();
                }
            });
            adminRow.appendChild(delBtn);
            card.appendChild(adminRow);
            // Clicking on the card shows contact modal; ignore clicks on delete button
            card.addEventListener('click', (evt) => {
                if (evt.target.closest('.delete-btn')) return;
                showContactModal(item.lenderName, item.lenderContact, item.lenderBio || '', item.lenderPhotoDataUrl || null);
            });
            itemsListEl.appendChild(card);
        });
    }

    /**
     * Render the admin dashboard table.  This view lists all items along with details and actions.
     * Only visible in admin mode.
     */
    function renderAdminDashboard() {
        const dash = document.getElementById('admin-dashboard');
        const tbody = document.getElementById('admin-table-body');
        if (!dash || !tbody) return;
        if (!adminMode) {
            dash.style.display = 'none';
            return;
        }
        dash.style.display = 'block';
        tbody.innerHTML = '';
        items.forEach((item, idx) => {
            const tr = document.createElement('tr');
            const tdName = document.createElement('td');
            tdName.textContent = item.name;
            const tdCat = document.createElement('td');
            tdCat.textContent = item.category;
            const tdType = document.createElement('td');
            tdType.textContent = item.type === 'lend' ? 'Borrow' : 'Free';
            const tdLender = document.createElement('td');
            tdLender.textContent = item.lenderName;
            const tdDate = document.createElement('td');
            const d = new Date(item.createdAt || Date.now());
            tdDate.textContent = d.toLocaleDateString();
            const tdVer = document.createElement('td');
            tdVer.textContent = item.verified ? 'Yes' : 'No';
            const tdAct = document.createElement('td');
            // Delete button
            const btnDel = document.createElement('button');
            btnDel.textContent = 'Delete';
            btnDel.addEventListener('click', async () => {
                if (!adminMode) return;
                if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                    try {
                        await fetch(`${API_BASE}/items/${item.id}`, { method: 'DELETE' });
                    } catch (err) {
                        console.warn('Failed to delete item via backend:', err);
                    }
                    items = items.filter(it => it.id !== item.id);
                    saveData();
                    renderItems();
                    updateMetrics();
                    renderAdminDashboard();
                }
            });
            // Verify/unverify button
            const btnVerify = document.createElement('button');
            btnVerify.textContent = item.verified ? 'Unverify' : 'Verify';
            btnVerify.style.marginLeft = '0.4rem';
            btnVerify.addEventListener('click', () => {
                if (!adminMode) return;
                items[idx].verified = !items[idx].verified;
                saveData();
                renderItems();
                updateMetrics();
                renderAdminDashboard();
            });
            tdAct.appendChild(btnDel);
            tdAct.appendChild(btnVerify);
            tr.appendChild(tdName);
            tr.appendChild(tdCat);
            tr.appendChild(tdType);
            tr.appendChild(tdLender);
            tr.appendChild(tdDate);
            tr.appendChild(tdVer);
            tr.appendChild(tdAct);
            tbody.appendChild(tr);
        });
    }

    function renderRequests() {
        requestsListEl.innerHTML = '';
        if (requests.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No borrowing requests yet. Looking for something? Submit a request!';
            requestsListEl.appendChild(empty);
            return;
        }
        requests.forEach((req) => {
            const card = document.createElement('div');
            card.className = 'card';
            const title = document.createElement('h4');
            title.textContent = req.name;
            const categoryChip = document.createElement('span');
            categoryChip.className = 'chip';
            categoryChip.textContent = req.category;
            const durationChip = document.createElement('span');
            durationChip.className = 'chip';
            durationChip.textContent = req.duration;
            const desc = document.createElement('p');
            desc.textContent = req.description;
            card.appendChild(title);
            card.appendChild(categoryChip);
            card.appendChild(durationChip);
            card.appendChild(desc);
            // If admin mode, show a delete button to remove this request
            if (adminMode) {
                const adminReqRow = document.createElement('div');
                adminReqRow.className = 'admin-actions';
                const delReqBtn = document.createElement('button');
                delReqBtn.className = 'delete-btn';
                delReqBtn.textContent = 'Delete';
                delReqBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (!adminMode) return;
                    if (confirm(`Delete request "${req.name}"? This cannot be undone.`)) {
                        try {
                            await fetch(`${API_BASE}/requests/${req.id}`, { method: 'DELETE' });
                        } catch (err) {
                            console.warn('Failed to delete request via backend:', err);
                        }
                        // Remove from local array regardless of backend result
                        requests = requests.filter(r => r.id !== req.id);
                        saveData();
                        renderRequests();
                        updateMetrics();
                    }
                });
                adminReqRow.appendChild(delReqBtn);
                card.appendChild(adminReqRow);
            }
            // Match results
            if (req.matches && req.matches.length > 0) {
                const matchEl = document.createElement('p');
                matchEl.className = 'match';
                // Determine the first matching item.  If matches are stored as
                // indices into the items array, use that.  Otherwise if they are
                // item IDs (strings), find the corresponding item by ID.
                let matchItem = null;
                const firstMatch = req.matches[0];
                if (typeof firstMatch === 'number') {
                    matchItem = items[firstMatch];
                } else if (typeof firstMatch === 'string') {
                    matchItem = items.find(it => it.id === firstMatch);
                }
                if (matchItem) {
                    matchEl.textContent = `Suggested item: ${matchItem.name} (${matchItem.category})`;
                    card.appendChild(matchEl);
                }
            }
            requestsListEl.appendChild(card);
        });
    }

    // Store functions
    function saveData() {
        localStorage.setItem('ec_items', JSON.stringify(items));
        localStorage.setItem('ec_requests', JSON.stringify(requests));
        localStorage.setItem('ec_volunteers', JSON.stringify(volunteers));
        localStorage.setItem('ec_donations', JSON.stringify(donations));
    }

    function findMatches(req) {
        const results = [];
        const targetName = req.name.toLowerCase();
        items.forEach((item, index) => {
            const itemName = item.name.toLowerCase();
            if (itemName.includes(targetName) || targetName.includes(itemName)) {
                results.push(index);
            } else if (item.category === req.category) {
                results.push(index);
            }
        });
        return results;
    }

    // Event handlers
    const itemForm = document.getElementById('item-form');
    itemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('item-name').value.trim();
        const category = document.getElementById('item-category').value;
        const description = document.getElementById('item-description').value.trim();
        const type = document.getElementById('item-type').value;
        // Use currentUser details if logged in, otherwise read from form
        const lenderName = currentUser ? (currentUser.name || '') : document.getElementById('lender-name').value.trim();
        const lenderContact = currentUser ? (currentUser.contact || '') : document.getElementById('lender-contact').value.trim();
        const lenderBio = currentUser ? (currentUser.bio || '') : (document.getElementById('lender-bio')?.value.trim() || '');
        const lenderPhotoFile = document.getElementById('lender-photo')?.files?.[0] || null;
        const photoFile = document.getElementById('item-photo')?.files?.[0] || null;
        // Basic validation: require key fields
        if (!name || !category || !description || !type || !lenderName || !lenderContact) return;
        // Compress optional images
        let photoDataUrl = null;
        let lenderPhotoDataUrl = null;
        try {
            photoDataUrl = await fileToDataUrlCompressed(photoFile);
        } catch (err) {
            console.warn('Item photo compression failed', err);
        }
        try {
            lenderPhotoDataUrl = await fileToDataUrlCompressed(lenderPhotoFile, 600, 0.8);
        } catch (err) {
            console.warn('Lender photo compression failed', err);
        }
        // Build an item object.  'createdAt' is included so that expiry logic
        // still functions when rendering locally.  The server will assign its
        // own id.
        const newItem = {
            name,
            category,
            description,
            type,
            lenderName,
            lenderContact,
            lenderBio,
            lenderPhotoDataUrl,
            photoDataUrl,
            rating: 0,
            createdAt: Date.now(),
            verified: false
        };
        try {
            // Persist to backend
            const resp = await fetch(`${API_BASE}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newItem)
            });
            if (resp.ok) {
                const saved = await resp.json();
                items.push(saved);
            } else {
                // If backend call fails, fall back to local addition
                console.warn('Backend failed to save item, falling back to local.');
                newItem.id = Date.now().toString();
                items.push(newItem);
            }
        } catch (err) {
            console.warn('Error saving item to backend:', err);
            newItem.id = Date.now().toString();
            items.push(newItem);
        }
        saveData();
        renderItems();
        updateMetrics();
        renderAdminDashboard();
        itemSuccess.textContent = 'Item added successfully!';
        itemForm.reset();
        setTimeout(() => { itemSuccess.textContent = ''; }, 3000);
    });

    const requestForm = document.getElementById('request-form');
    /**
     * Submit a new borrowing request.  The request is persisted to the backend and
     * matched against existing items via the /match endpoint.  The returned
     * matches are converted to indices into the current items array.  If the
     * backend is unreachable the request is stored locally and simple
     * matching is performed on the client.
     */
    requestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('request-name').value.trim();
        const category = document.getElementById('request-category').value;
        const duration = document.getElementById('request-duration').value;
        const description = document.getElementById('request-description').value.trim();
        if (!name || !category || !duration || !description) return;
        const id = Date.now().toString();
        const reqObj = { id, name, category, duration, description };
        let matches = [];
        // Attempt to persist to backend and get matches
        try {
            // Save request to backend
            const saveResp = await fetch(`${API_BASE}/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqObj)
            });
            if (!saveResp.ok) {
                console.warn('Backend failed to save request');
            }
            // Call match endpoint to get matching items by name/category
            const matchResp = await fetch(`${API_BASE}/match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, category })
            });
            if (matchResp.ok) {
                const matchItems = await matchResp.json();
                // Convert matched item IDs into indices in the current items array
                matches = matchItems.map(matchItem => {
                    // Some backends may return objects with id property; if so, map to index
                    if (typeof matchItem === 'string') {
                        const idx = items.findIndex(it => it.id === matchItem);
                        return idx >= 0 ? idx : null;
                    } else if (matchItem && matchItem.id) {
                        const idx = items.findIndex(it => it.id === matchItem.id);
                        return idx >= 0 ? idx : null;
                    }
                    return null;
                }).filter(idx => idx !== null);
            }
        } catch (err) {
            console.warn('Failed to reach backend for requests/matching:', err);
            // Fallback: perform simple local matching
            matches = findMatches(reqObj);
        }
        reqObj.matches = matches;
        requests.push(reqObj);
        saveData();
        renderRequests();
        updateMetrics();
        requestSuccess.textContent = 'Request submitted!';
        requestForm.reset();
        setTimeout(() => { requestSuccess.textContent = ''; }, 3000);
    });

    // Initial render
    renderItems();
    renderRequests();
    updateMetrics();
    // Render admin dashboard on load if admin mode is active
    renderAdminDashboard();

    // Improved search filtering across multiple fields with debounce
    const searchInput = document.getElementById('search-input');
    function filterCards() {
        const q = (searchInput?.value || '').trim().toLowerCase();
        const filterVal = (document.getElementById('category-filter')?.value || 'all').toLowerCase();
        const cards = itemsListEl.querySelectorAll('.card');
        cards.forEach(card => {
            const haystack = [
                card.dataset.name,
                card.dataset.category,
                card.dataset.type,
                card.dataset.lender,
                card.dataset.description
            ].join(' ');
            const matchesSearch = haystack.includes(q);
            const matchesCategory = filterVal === 'all' || card.dataset.category === filterVal.toLowerCase();
            card.style.display = (matchesSearch && matchesCategory) ? '' : 'none';
        });
    }
    let searchTimer = null;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(filterCards, 180);
        });
    }

    // Category filter change triggers card filtering
    const categoryFilterEl = document.getElementById('category-filter');
    if (categoryFilterEl) {
        categoryFilterEl.addEventListener('change', () => {
            filterCards();
        });
    }

    // Admin mode toggle
    const adminToggle = document.getElementById('admin-toggle');
    /**
     * Refresh UI elements when admin mode changes.
     */
    function refreshAdminUI() {
        document.body.classList.toggle('admin-mode', adminMode);
        if (adminToggle) {
            adminToggle.classList.toggle('admin-on', adminMode);
            adminToggle.textContent = adminMode ? '🔓 Admin' : '🔒 Admin';
        }
        // Show or hide dashboard accordingly
        renderAdminDashboard();
    }
    // Restore admin mode from previous session if stored
    (function restoreAdmin() {
        if (localStorage.getItem('ec_admin') === '1') {
            adminMode = true;
            refreshAdminUI();
        }
    })();
    if (adminToggle) {
        adminToggle.addEventListener('click', async () => {
            if (adminMode) {
                adminMode = false;
                localStorage.removeItem('ec_admin');
                refreshAdminUI();
                return;
            }
            const pass = prompt('Enter admin passphrase:');
            if (!pass) return;
            const h = await toHash(pass);
            if (h === ADMIN_PASSPHRASE_HASH) {
                adminMode = true;
                localStorage.setItem('ec_admin', '1');
                refreshAdminUI();
            } else {
                alert('Incorrect passphrase.');
            }
        });
    }

    /**
     * Update the metrics banner with counts of items, types and requests.
     */
    function updateMetrics() {
        const total = items.length;
        const lendCount = items.filter(i => i.type === 'lend').length;
        const giveCount = items.filter(i => i.type !== 'lend').length;
        const reqCount = requests.length;
        // Count number of requests with at least one match
        const matchCount = requests.reduce((acc, r) => {
            const q = (r.name || '').toLowerCase();
            const cat = (r.category || '').toLowerCase();
            const m = items.filter(i =>
                (i.name || '').toLowerCase().includes(q) ||
                (i.category || '').toLowerCase() === cat
            ).length;
            return acc + (m > 0 ? 1 : 0);
        }, 0);
        const setMetric = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        };
        setMetric('metric-total', total);
        setMetric('metric-lend', lendCount);
        setMetric('metric-give', giveCount);
        setMetric('metric-requests', reqCount);
        setMetric('metric-matches', matchCount);
    }

    /**
     * Set the rating for a given item by index. Updates the stored list and re-renders
     * the items and metrics. Rating values range from 1 (lowest) to 5 (highest).
     * @param {number} index
     * @param {number} rating
     */
    function setItemRating(index, rating) {
        const item = items[index];
        if (!item) return;
        // Update via backend
        (async () => {
            try {
                await fetch(`${API_BASE}/ratings/${item.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rating })
                });
                // Refresh items from backend to get updated averages
                await loadFromBackend();
            } catch (err) {
                console.warn('Failed to save rating to backend:', err);
                // Fallback: update local rating only
                item.rating = rating;
                saveData();
                renderItems();
                updateMetrics();
            }
        })();
    }

    // Modal logic for displaying lender contact information
    const contactModal = document.getElementById('contact-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const contactInfoEl = document.getElementById('contact-info');
    /**
     * Show a modal with the lender’s contact details. Called when an item card is clicked.
     * @param {string} lenderName
     * @param {string} lenderContact
     */
    function showContactModal(lenderName, lenderContact, lenderBio = '', lenderPhotoDataUrl = null) {
        if (!contactModal || !contactInfoEl) return;
        // Clear existing content
        contactInfoEl.innerHTML = '';
        // Optional photo
        if (lenderPhotoDataUrl) {
            const img = document.createElement('img');
            img.src = lenderPhotoDataUrl;
            img.alt = `${lenderName} portrait`;
            img.style.width = '80px';
            img.style.height = '80px';
            img.style.borderRadius = '50%';
            img.style.objectFit = 'cover';
            img.style.marginBottom = '0.5rem';
            contactInfoEl.appendChild(img);
        }
        const nameEl = document.createElement('strong');
        nameEl.textContent = lenderName;
        contactInfoEl.appendChild(nameEl);
        const contactP = document.createElement('p');
        contactP.textContent = `Contact: ${lenderContact}`;
        contactInfoEl.appendChild(contactP);
        if (lenderBio) {
            const bioP = document.createElement('p');
            bioP.textContent = lenderBio;
            contactInfoEl.appendChild(bioP);
        }
        contactModal.style.display = 'flex';
    }
    // Make the modal closing functionality accessible globally
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            contactModal.style.display = 'none';
        });
    }
    // Hide modal when clicking outside the modal content
    window.addEventListener('click', (evt) => {
        if (evt.target === contactModal) {
            contactModal.style.display = 'none';
        }
    });

    // On initial load fetch items and requests from the backend.  If the
    // backend is unreachable the UI will fall back to any data in
    // localStorage.  The call is asynchronous and will update the UI
    // once complete.
    loadFromBackend();

    // Volunteer form handler
    const volForm = document.getElementById('volunteer-form');
    if (volForm) {
        volForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('vol-name').value.trim();
            const email = document.getElementById('vol-email').value.trim();
            const phone = document.getElementById('vol-phone').value.trim();
            const interests = document.getElementById('vol-interests').value;
            const message = document.getElementById('vol-message').value.trim();
            if (!name || !email || !phone || !interests) return;
            volunteers.push({ id: Date.now().toString(), name, email, phone, interests, message });
            saveData();
            if (volSuccess) {
                volSuccess.textContent = 'Thank you for signing up to volunteer! We will contact you soon.';
                setTimeout(() => { volSuccess.textContent = ''; }, 4000);
            }
            volForm.reset();
        });
    }

    // Donation form handler
    const donForm = document.getElementById('donate-form');
    if (donForm) {
        donForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('don-name').value.trim();
            const email = document.getElementById('don-email').value.trim();
            const item = document.getElementById('don-item').value.trim();
            const condition = document.getElementById('don-condition').value;
            const message = document.getElementById('don-message').value.trim();
            if (!name || !email || !item || !condition) return;
            donations.push({ id: Date.now().toString(), name, email, item, condition, message });
            saveData();
            if (donSuccess) {
                donSuccess.textContent = 'Thank you for your generous donation! We will follow up with you soon.';
                setTimeout(() => { donSuccess.textContent = ''; }, 4000);
            }
            donForm.reset();
        });
    }

    // Load current user from localStorage and update UI
    loadCurrentUser();

    // User registration handler
    const signUpForm = document.getElementById('sign-up-form');
    if (signUpForm) {
        signUpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value.trim();
            const name = document.getElementById('signup-name').value.trim();
            const contact = document.getElementById('signup-contact').value.trim();
            const bio = document.getElementById('signup-bio').value.trim();
            if (!email || !password || !name || !contact) {
                showAuthMessage('Please fill in all required fields', true);
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password, name, contact, bio })
                });
                if (res.ok) {
                    const user = await res.json();
                    currentUser = user;
                    localStorage.setItem('ec_current_user', JSON.stringify(user));
                    updateAuthUI();
                    showAuthMessage('Account created. You are now logged in.');
                } else {
                    const err = await res.json();
                    showAuthMessage(err.error || 'Sign up failed', true);
                }
            } catch (err) {
                showAuthMessage('Sign up failed. Please try again.', true);
            }
            signUpForm.reset();
        });
    }

    // User login handler
    const signInForm = document.getElementById('sign-in-form');
    if (signInForm) {
        signInForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();
            if (!email || !password) {
                showAuthMessage('Please provide email and password', true);
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                if (res.ok) {
                    const user = await res.json();
                    currentUser = user;
                    localStorage.setItem('ec_current_user', JSON.stringify(user));
                    updateAuthUI();
                    showAuthMessage('Logged in successfully.');
                } else {
                    const err = await res.json();
                    showAuthMessage(err.error || 'Login failed', true);
                }
            } catch (err) {
                showAuthMessage('Login failed. Please try again.', true);
            }
            signInForm.reset();
        });
    }

    // Logout handler
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            currentUser = null;
            localStorage.removeItem('ec_current_user');
            updateAuthUI();
            showAuthMessage('You have been logged out.');
        });
    }
});