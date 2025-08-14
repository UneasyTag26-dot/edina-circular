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

    // Data arrays loaded from localStorage if present
    let items = [];
    let requests = [];
    let volunteers = [];
    let donations = [];

    // --- CONFIGURATION ---
    // SHA‑256 hash of a secret phrase used to toggle admin mode.  Change this to your own hash by
    // computing the hash of your chosen passphrase (see README or prompt for instructions).
    // Admin passphrase hash for "admin123".  To change the passphrase,
    // replace this value with the SHA‑256 hash of your desired phrase.  The
    // current hash corresponds to the passphrase "admin123".
    const ADMIN_PASSPHRASE_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    // Tracks whether admin mode is active; when true, delete buttons are visible and deletion is allowed
    let adminMode = false;

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

    const itemsListEl = document.getElementById('items-list');
    const requestsListEl = document.getElementById('requests-list');
    const itemSuccess = document.getElementById('item-success');
    const requestSuccess = document.getElementById('request-success');

    // volunteer & donation elements
    const volSuccess = document.getElementById('vol-success');
    const donSuccess = document.getElementById('don-success');

    // Render functions
    function renderItems() {
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
            const lender = document.createElement('p');
            lender.className = 'lender';
            lender.textContent = `Lender: ${item.lenderName}`;
            card.appendChild(title);
            card.appendChild(typeChip);
            card.appendChild(categoryChip);
            card.appendChild(desc);
            card.appendChild(lender);
            // Admin delete actions
            const adminRow = document.createElement('div');
            adminRow.className = 'admin-actions';
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.textContent = 'Delete';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!adminMode) return;
                if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
                    items.splice(idx, 1);
                    saveData();
                    renderItems();
                    updateMetrics();
                }
            });
            adminRow.appendChild(delBtn);
            card.appendChild(adminRow);
            // Clicking on the card shows contact modal; ignore clicks on delete button
            card.addEventListener('click', (evt) => {
                if (evt.target.closest('.delete-btn')) return;
                showContactModal(item.lenderName, item.lenderContact);
            });
            itemsListEl.appendChild(card);
        });
        // Reapply current search filter after items are rendered.  Without this call,
        // newly added or removed items would always show regardless of the current
        // search query.  This ensures the list respects the active filter string.
        filterCards();
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
            // Match results
            if (req.matches && req.matches.length > 0) {
                const matchEl = document.createElement('p');
                matchEl.className = 'match';
                const first = items[req.matches[0]];
                matchEl.textContent = `Suggested item: ${first.name} (${first.category})`;
                card.appendChild(matchEl);
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
        const lenderName = document.getElementById('lender-name').value.trim();
        const lenderContact = document.getElementById('lender-contact').value.trim();
        const photoFile = document.getElementById('item-photo')?.files?.[0] || null;
        if (!name || !category || !description || !type || !lenderName || !lenderContact) return;
        let photoDataUrl = null;
        try {
            photoDataUrl = await fileToDataUrlCompressed(photoFile);
        } catch (err) {
            console.warn('Photo compression failed', err);
        }
        const id = Date.now().toString();
        items.push({ id, name, category, description, type, lenderName, lenderContact, photoDataUrl, createdAt: Date.now() });
        saveData();
        renderItems();
        updateMetrics();
        itemSuccess.textContent = 'Item added successfully!';
        itemForm.reset();
        setTimeout(() => { itemSuccess.textContent = ''; }, 3000);
    });

    const requestForm = document.getElementById('request-form');
    requestForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('request-name').value.trim();
        const category = document.getElementById('request-category').value;
        const duration = document.getElementById('request-duration').value;
        const description = document.getElementById('request-description').value.trim();
        if (!name || !category || !duration || !description) return;
        const id = Date.now().toString();
        const reqObj = { id, name, category, duration, description };
        // Compute matches via simple AI (string match & category)
        const matches = findMatches(reqObj);
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

    // Improved search filtering across multiple fields with debounce
    const searchInput = document.getElementById('search-input');
    function filterCards() {
        const q = (searchInput?.value || '').trim().toLowerCase();
        const cards = itemsListEl.querySelectorAll('.card');
        cards.forEach(card => {
            const haystack = [
                card.dataset.name,
                card.dataset.category,
                card.dataset.type,
                card.dataset.lender,
                card.dataset.description
            ].join(' ');
            card.style.display = haystack.includes(q) ? '' : 'none';
        });
    }
    let searchTimer = null;
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(filterCards, 180);
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

    // Modal logic for displaying lender contact information
    const contactModal = document.getElementById('contact-modal');
    const closeModalBtn = document.getElementById('close-modal');
    const contactInfoEl = document.getElementById('contact-info');
    /**
     * Show a modal with the lender’s contact details. Called when an item card is clicked.
     * @param {string} lenderName
     * @param {string} lenderContact
     */
    function showContactModal(lenderName, lenderContact) {
        if (!contactModal || !contactInfoEl) return;
        contactInfoEl.textContent = `${lenderName} can be reached at: ${lenderContact}`;
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
});