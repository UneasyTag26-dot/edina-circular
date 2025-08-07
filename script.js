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
        items.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'card';
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
            card.appendChild(title);
            card.appendChild(typeChip);
            card.appendChild(categoryChip);
            card.appendChild(desc);
            itemsListEl.appendChild(card);
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
    itemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('item-name').value.trim();
        const category = document.getElementById('item-category').value;
        const description = document.getElementById('item-description').value.trim();
        const type = document.getElementById('item-type').value;
        if (!name || !category || !description || !type) return;
        const id = Date.now().toString();
        items.push({ id, name, category, description, type });
        saveData();
        renderItems();
        itemSuccess.textContent = 'Item added successfully!';
        // Clear form
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
        requestSuccess.textContent = 'Request submitted!';
        requestForm.reset();
        setTimeout(() => { requestSuccess.textContent = ''; }, 3000);
    });

    // Initial render
    renderItems();
    renderRequests();

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