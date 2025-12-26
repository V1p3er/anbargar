function setActiveSection(sectionId) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    const sec = document.getElementById(sectionId);
    if (sec) sec.classList.add("active");

    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    const btn = document.querySelector(`.nav-btn[data-target="${sectionId}"]`);
    if (btn) btn.classList.add("active");

    const sidebar = document.getElementById("sidebar");
    sidebar.classList.remove("open");
    window.scrollTo({ top: 0, behavior: "smooth" });
    history.replaceState(null, "", "#" + sectionId);
}

document.addEventListener("click", (e) => {
    const nav = e.target.closest(".nav-btn");
    if (nav) return setActiveSection(nav.dataset.target);

    const jump = e.target.closest("[data-jump]");
    if (jump) return setActiveSection(jump.dataset.jump);
});

document.getElementById("mobileToggle")?.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
});

const hash = (location.hash || "").replace("#", "");
if (hash) setActiveSection(hash);

const state = { token: null, items: [], folders: [], units: [], customers: [], events: [] };
const editState = { folderId: null, itemId: null, unitId: null, customerId: null };

const uiText = {
    actions: "Actions",
    edit: "Edit",
    delete: "Delete",
    cancelEdit: "Cancel edit",
    updateFolder: "Update folder",
    updateItem: "Update item",
    updateUnit: "Update unit",
    updateCustomer: "Update customer",
    updateEvent: "Edit event description",
    deleteConfirm: "Are you sure?",
};

const formatter = new Intl.NumberFormat("fa-IR");
const toast = document.getElementById("toast");

function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `dash-toast ${type}`;
    toast.style.display = "block";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => (toast.style.display = "none"), 3000);
}

async function apiFetch(path, options = {}) {
    const headers = options.headers || {};
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(path, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";
    let payload = null;
    if (contentType.includes("application/json")) {
    const text = await response.text();
    payload = text ? JSON.parse(text) : null;
    }
    if (!response.ok) {
    const message = payload && payload.detail ? payload.detail : "خطا در ارتباط با سرور";
    throw new Error(message);
    }
    return payload;
}

function updateStats(stats) {
    if (!stats) return;
    document.querySelectorAll("[data-stat]").forEach((node) => {
    const key = node.getAttribute("data-stat");
    if (stats[key] !== undefined) node.textContent = formatter.format(stats[key]);
    });
    const pill = document.getElementById("pill-low");
    if (pill && stats.low_stock_count !== undefined) pill.textContent = formatter.format(stats.low_stock_count);
}

function renderTable(tbody, rows, emptyText) {
    tbody.innerHTML = "";
    const table = tbody.closest("table");
    const columnCount = table ? table.querySelectorAll("thead th").length : rows[0]?.length || 1;
    if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columnCount;
    td.className = "text-center text-sm text-gray-400 py-6";
    td.textContent = emptyText;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
    }
    rows.forEach((cells) => {
    const tr = document.createElement("tr");
    cells.forEach((cell) => {
        const td = document.createElement("td");
        if (cell && typeof cell === "object" && "nodeType" in cell) td.appendChild(cell);
        else td.textContent = cell;
        tr.appendChild(td);
    });
    tbody.appendChild(tr);
    });
}

function ensureActionColumn(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const headRow = table.querySelector("thead tr");
    if (!headRow || headRow.querySelector('[data-role="actions"]')) return;
    const th = document.createElement("th");
    th.textContent = uiText.actions;
    th.setAttribute("data-role", "actions");
    headRow.appendChild(th);
}

function createActionButton(label, onClick, className = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `dash-action ${className}`.trim();
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function createRowActions(buttons) {
    const wrapper = document.createElement("div");
    wrapper.className = "dash-actions";
    buttons.forEach((button) => wrapper.appendChild(button));
    return wrapper;
}

function makeAsyncHandler(action) {
    return () => action().catch((error) => showToast(error.message, "error"));
}

function setupEditControls(formId, updateLabel) {
    const form = document.getElementById(formId);
    const submit = form.querySelector('button[type="submit"]');
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "dash-button-outline w-full";
    cancel.textContent = uiText.cancelEdit;
    cancel.hidden = true;
    submit.insertAdjacentElement("afterend", cancel);
    return { form, submit, cancel, defaultLabel: submit.textContent, updateLabel };
}

const folderControls = setupEditControls("folder-form", uiText.updateFolder);
const itemControls = setupEditControls("item-form", uiText.updateItem);
const unitControls = setupEditControls("unit-form", uiText.updateUnit);
const customerControls = setupEditControls("customer-form", uiText.updateCustomer);

function fillSelectOptions(select, items, placeholder) {
    select.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = placeholder;
    select.appendChild(empty);
    items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    select.appendChild(option);
    });
}

function updateEventItemSelects() {
    document.querySelectorAll('[data-field="item"]').forEach((select) => fillSelectOptions(select, state.items, "انتخاب کالا"));
}

function updateUnitDatalist() {
    const list = document.getElementById("units-list");
    list.innerHTML = "";
    state.units.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit.symbol || unit.name;
    list.appendChild(option);
    });
}

async function loadToken() {
    try {
    const data = await apiFetch("/api/auth/session-token/", { method: "GET" });
    if (data && data.token) {
        state.token = data.token;
        document.getElementById("token-input").value = data.token;
    }
    } catch (error) {
    showToast(error.message, "error");
    }
}

async function loadStats() {
    const data = await apiFetch("/api/dashboard/stats/");
    updateStats(data);
}

async function loadFolders() {
    const data = await apiFetch("/api/folders/");
    state.folders = data || [];
    renderTable(
    document.querySelector("#folders-table tbody"),
    state.folders.map((folder) => [
        folder.name,
        folder.description || "-",
        createRowActions([
        createActionButton(uiText.edit, () => startFolderEdit(folder)),
        createActionButton(uiText.delete, makeAsyncHandler(() => deleteFolder(folder.id)), "dash-action-danger"),
        ]),
    ]),
    "انبار ثبت نشده است."
    );
    fillSelectOptions(document.getElementById("event-folder"), state.folders, "انتخاب انبار");
    fillSelectOptions(document.getElementById("event-origin"), state.folders, "انتخاب مبدا");
    fillSelectOptions(document.getElementById("event-destination"), state.folders, "انتخاب مقصد");
}

async function loadItems() {
    const data = await apiFetch("/api/items/");
    state.items = data || [];
    renderTable(
    document.querySelector("#items-table tbody"),
    state.items.map((item) => [
        item.name,
        item.barcode || "-",
        item.value ? formatter.format(item.value) : "-",
        createRowActions([
        createActionButton(uiText.edit, () => startItemEdit(item)),
        createActionButton(uiText.delete, makeAsyncHandler(() => deleteItem(item.id)), "dash-action-danger"),
        ]),
    ]),
    "کالایی ثبت نشده است."
    );
    updateEventItemSelects();
}

async function loadUnits() {
    const data = await apiFetch("/api/units/");
    state.units = data || [];
    renderTable(
    document.querySelector("#units-table tbody"),
    state.units.map((unit) => [
        unit.name,
        unit.symbol,
        unit.description || "-",
        createRowActions([
        createActionButton(uiText.edit, () => startUnitEdit(unit)),
        createActionButton(uiText.delete, makeAsyncHandler(() => deleteUnit(unit.id)), "dash-action-danger"),
        ]),
    ]),
    "واحدی ثبت نشده است."
    );
    updateUnitDatalist();
}

async function loadCustomers() {
    const data = await apiFetch("/api/customers/");
    state.customers = data || [];
    renderTable(
    document.querySelector("#customers-table tbody"),
    state.customers.map((customer) => [
        `${customer.first_name || ""} ${customer.last_name || ""}`.trim(),
        customer.phone || "-",
        customer.email || "-",
        createRowActions([
        createActionButton(uiText.edit, () => startCustomerEdit(customer)),
        createActionButton(uiText.delete, makeAsyncHandler(() => deleteCustomer(customer.id)), "dash-action-danger"),
        ]),
    ]),
    "مشتری ثبت نشده است."
    );
    fillSelectOptions(
    document.getElementById("event-customer-select"),
    state.customers.map((customer) => ({ id: customer.id, name: `${customer.first_name || ""} ${customer.last_name || ""}`.trim() })),
    "انتخاب مشتری"
    );
}

const RECEIPT_STORAGE_KEY = "anbargaar_receipts_v1";

function getLocalReceipts() {
    try {
    const raw = localStorage.getItem(RECEIPT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
    } catch {
    return [];
    }
}

function setLocalReceipts(list) {
    localStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(list));
}

function uid() {
    return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function escapeHtml(s = "") {
    return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
    return formatter.format(Number(n));
}

async function fetchEventDetailIfNeeded(eventObj) {
    if (eventObj && Array.isArray(eventObj.items)) return eventObj;
    try {
    const detail = await apiFetch(`/api/events/${eventObj.id}/`, { method: "GET" });
    return detail || eventObj;
    } catch {
    return eventObj;
    }
}

function buildReceiptHtml({ kind, eventData }) {
    const isBuy = kind === "buyer";
    const typeLabel = isBuy ? "رسید خرید" : "رسید فروش";
    const created = eventData?.createdAt ? new Date(eventData.createdAt).toLocaleString("fa-IR") : "-";

    const customerName = eventData?.customer_name || eventData?.customerName || "-";
    const customerPhone = eventData?.customer_phone || eventData?.customerPhone || "-";
    const customerAddress = eventData?.customer_address || eventData?.customerAddress || "-";
    const description = eventData?.description || "-";

    const items = Array.isArray(eventData?.items) ? eventData.items : [];

    let total = 0;
    let hasTotal = false;

    const rowsHtml = items.length
    ? items.map((it) => {
        const name = it.name || it.item_name || "-";
        const qty = Number(it.quantity);
        const val = it.value !== undefined && it.value !== null ? Number(it.value) : null;
        const line = (Number.isFinite(qty) && Number.isFinite(val)) ? qty * val : null;

        if (line !== null && Number.isFinite(line)) {
            total += line;
            hasTotal = true;
        }

        return `
            <tr>
            <td style="padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">${escapeHtml(name)}</td>
            <td style="padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">${money(qty)}</td>
            <td style="padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">${it.unit ? escapeHtml(it.unit) : "-"}</td>
            <td style="padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">${val === null ? "-" : money(val)}</td>
            <td style="padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">${line === null ? "-" : money(line)}</td>
            </tr>
        `;
        }).join("")
    : `<tr><td colspan="5" style="padding:12px;color:#6b7280">آیتمی برای این رویداد موجود نیست (اگر API جزئیات آیتم‌ها را برنگرداند).</td></tr>`;

    const totalHtml = hasTotal
    ? `<div style="margin-top:12px;font-weight:900;font-size:18px">جمع کل: ${money(total)} ریال</div>`
    : `<div style="margin-top:12px;color:#6b7280;font-size:13px">جمع کل قابل محاسبه نیست (ارزش/تعداد کافی نیست).</div>`;

    return `
    <div style="font-family:IRANYekan, system-ui; direction:rtl; color:#111827">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; border:1px solid rgba(148,163,184,.22); border-radius:18px; background:#fff;">
        <div>
        <div style="font-size:20px; font-weight:900; color: oklch(55% .25 25.331)">${typeLabel}</div>
        <div style="font-size:12px; color:#6b7280; margin-top:4px">تاریخ: ${escapeHtml(created)}</div>
        <div style="font-size:12px; color:#6b7280; margin-top:2px">شناسه رویداد: ${escapeHtml(eventData?.id || "-")}</div>
        </div>
        <div style="text-align:left">
        <div style="font-size:12px; color:#6b7280">انبارگر</div>
        <div style="font-size:14px; font-weight:800">رسید رسمی</div>
        </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
        <div style="border:1px solid rgba(148,163,184,.2); border-radius:16px; padding:12px; background:#fff;">
        <div style="font-weight:800; margin-bottom:8px;">اطلاعات مشتری</div>
        <div style="font-size:13px; color:#374151">نام: <b>${escapeHtml(customerName)}</b></div>
        <div style="font-size:13px; color:#374151; margin-top:6px;">شماره: <b>${escapeHtml(customerPhone)}</b></div>
        <div style="font-size:13px; color:#374151; margin-top:6px;">آدرس: <b>${escapeHtml(customerAddress)}</b></div>
        </div>

        <div style="border:1px solid rgba(148,163,184,.2); border-radius:16px; padding:12px; background:#fff;">
        <div style="font-weight:800; margin-bottom:8px;">جزئیات رویداد</div>
        <div style="font-size:13px; color:#374151">نوع: <b>${escapeHtml(eventData?.type || "-")}</b></div>
        <div style="font-size:13px; color:#374151; margin-top:6px;">توضیح: <b>${escapeHtml(description)}</b></div>
        </div>
    </div>

    <div style="margin-top:12px; border:1px solid rgba(148,163,184,.2); border-radius:16px; overflow:hidden; background:#fff;">
        <div style="padding:12px; font-weight:900; border-bottom:1px solid rgba(148,163,184,.2); background: oklch(96% .03 25.331); color: oklch(55% .25 25.331);">
        آیتم‌ها
        </div>
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
            <tr style="color:#6b7280">
            <th style="text-align:right;padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">کالا</th>
            <th style="text-align:right;padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">تعداد</th>
            <th style="text-align:right;padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">واحد</th>
            <th style="text-align:right;padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">ارزش</th>
            <th style="text-align:right;padding:10px;border-bottom:1px solid rgba(148,163,184,.2)">جمع</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
        </table>
        <div style="padding:12px">
        ${totalHtml}
        <div style="margin-top:10px; display:flex; justify-content:space-between; gap:10px; color:#6b7280; font-size:12px;">
            <div>امضا مشتری: ____________</div>
            <div>امضا انبار: ____________</div>
        </div>
        </div>
    </div>
    </div>
    `;
}

function receiptGetSelectedKind() {
    return document.querySelector('input[name="receipt-kind"]:checked')?.value || "seller";
}

function receiptRenderSavedList() {
    const wrap = document.getElementById("receipt-saved-list");
    if (!wrap) return;

    const list = getLocalReceipts().slice().reverse();
    if (!list.length) {
    wrap.innerHTML = `<div class="text-sm text-gray-400">رسیدی ذخیره نشده است.</div>`;
    return;
    }

    wrap.innerHTML = "";
    list.slice(0, 12).forEach((r) => {
    const row = document.createElement("div");
    row.className = "dash-card p-3 border border-gray-100";
    row.innerHTML = `
        <div class="flex items-center justify-between gap-3">
        <div>
            <div class="text-sm font-extrabold text-gray-900">${escapeHtml(r.title || "رسید")}</div>
            <div class="text-xs text-gray-500 mt-1">${escapeHtml(r.created || "-")}</div>
        </div>
        <div class="dash-actions">
            <button class="dash-action" type="button" data-receipt-view="${r.id}">نمایش</button>
            <button class="dash-action dash-action-danger" type="button" data-receipt-del="${r.id}">حذف</button>
        </div>
        </div>
    `;
    wrap.appendChild(row);
    });
}

function receiptDownloadHtml(filename, html) {
    const fullDoc = `<!doctype html><html lang="fa" dir="rtl"><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(filename)}</title>
    </head><body style="margin:18px;background:#fff">${html}</body></html>`;

    const blob = new Blob([fullDoc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".html") ? filename : `${filename}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function receiptPrint(html) {
    const w = window.open("", "_blank");
    if (!w) return showToast("پاپ‌آپ مسدود شده است.", "error");

    w.document.open();
    w.document.write(`<!doctype html><html lang="fa" dir="rtl"><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Receipt</title>
    <style>@media print { body { margin: 0; } }</style>
    </head><body style="margin:18px;background:#fff">${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
}

function receiptPopulateEvents() {
    const select = document.getElementById("receipt-event-select");
    if (!select) return;

    const current = select.value;
    select.innerHTML = `<option value="">انتخاب رویداد...</option>`;

    const filtered = (state.events || []).filter(e => e.type === "BUY" || e.type === "SELL");

    filtered.forEach((e) => {
    const opt = document.createElement("option");
    opt.value = e.id;

    const when = e.createdAt ? new Date(e.createdAt).toLocaleString("fa-IR") : "";
    const typ = e.type === "BUY" ? "ورود" : "خروج";
    const desc = e.description ? ` — ${e.description}` : "";
    opt.textContent = `${typ} | ${when}${desc}`;
    select.appendChild(opt);
    });

    if (current) select.value = current;
}

async function loadEvents() {
    const data = await apiFetch("/api/events/");
    state.events = data || [];

    const rows = state.events.map((event) => [
    event.type === "BUY" ? "ورود" : event.type === "SELL" ? "خروج" : "جابجایی",
    event.description || "-",
    new Date(event.createdAt).toLocaleString("fa-IR"),
    createRowActions([
        createActionButton(uiText.edit, makeAsyncHandler(() => editEvent(event))),
        createActionButton(uiText.delete, makeAsyncHandler(() => deleteEvent(event.id)), "dash-action-danger"),
    ]),
    ]);
    renderTable(document.querySelector("#events-table tbody"), rows, "رویدادی ثبت نشده است.");

    renderDashboardFeed();
    receiptPopulateEvents();
    receiptRenderSavedList();
}

async function loadInventory() {
    const data = await apiFetch("/api/inventory/");
    const rows = (data || []).map((entry) => [
    entry.item_name,
    entry.folder_name,
    formatter.format(entry.quantity),
    entry.unit || "-",
    ]);
    renderTable(document.querySelector("#inventory-table tbody"), rows, "موجودی ثبت نشده است.");
}

function renderDashboardFeed() {
    const feed = document.getElementById("dashboard-feed");
    if (!feed) return;

    feed.innerHTML = "";

    const latestEvents = (state.events || []).slice(0, 6);
    const blocks = [];

    if (latestEvents.length) {
    latestEvents.forEach((ev) => {
        const title =
        (ev.type === "BUY" ? "ورود کالا" : ev.type === "SELL" ? "خروج کالا" : "جابه‌جایی کالا") +
        (ev.description ? ` — ${ev.description}` : "");
        blocks.push({ title, meta: new Date(ev.createdAt).toLocaleString("fa-IR") });
    });
    }

    if (state.items?.length) blocks.push({ title: `در سیستم ${formatter.format(state.items.length)} کالا ثبت شده است.`, meta: "وضعیت سیستم" });
    if (state.folders?.length) blocks.push({ title: `در سیستم ${formatter.format(state.folders.length)} انبار ثبت شده است.`, meta: "وضعیت سیستم" });

    if (!blocks.length) {
    feed.innerHTML = `<div class="text-sm text-gray-400 py-4">هنوز داده‌ای برای نمایش وجود ندارد. یک کالا یا رویداد ثبت کنید.</div>`;
    return;
    }

    blocks.slice(0, 8).forEach((b) => {
    const row = document.createElement("div");
    row.className = "feed-item";
    row.innerHTML = `
        <div class="feed-dot"></div>
        <div>
        <div class="feed-title">${b.title}</div>
        <div class="feed-meta">${b.meta}</div>
        </div>
    `;
    feed.appendChild(row);
    });
}
function resetFolderEdit() {
    editState.folderId = null;
    folderControls.form.reset();
    folderControls.submit.textContent = folderControls.defaultLabel;
    folderControls.cancel.hidden = true;
}

function startFolderEdit(folder) {
    editState.folderId = folder.id;
    folderControls.form.name.value = folder.name || "";
    folderControls.form.description.value = folder.description || "";
    folderControls.submit.textContent = folderControls.updateLabel;
    folderControls.cancel.hidden = false;
    folderControls.form.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveSection("sec-create");
}

function resetItemEdit() {
    editState.itemId = null;
    itemControls.form.reset();
    itemControls.submit.textContent = itemControls.defaultLabel;
    itemControls.cancel.hidden = true;
}

function startItemEdit(item) {
    editState.itemId = item.id;
    itemControls.form.name.value = item.name || "";
    itemControls.form.sku.value = item.sku || "";
    itemControls.form.barcode.value = item.barcode || "";
    itemControls.form.value.value = item.value ?? "";
    itemControls.form.description.value = item.description || "";
    itemControls.form.has_qr_code.checked = !!item.has_qr_code;
    itemControls.submit.textContent = itemControls.updateLabel;
    itemControls.cancel.hidden = false;
    itemControls.form.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveSection("sec-create");
}

function resetUnitEdit() {
    editState.unitId = null;
    unitControls.form.reset();
    unitControls.submit.textContent = unitControls.defaultLabel;
    unitControls.cancel.hidden = true;
}

function startUnitEdit(unit) {
    editState.unitId = unit.id;
    unitControls.form.name.value = unit.name || "";
    unitControls.form.symbol.value = unit.symbol || "";
    unitControls.form.description.value = unit.description || "";
    unitControls.submit.textContent = unitControls.updateLabel;
    unitControls.cancel.hidden = false;
    unitControls.form.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveSection("sec-create");
}

function resetCustomerEdit() {
    editState.customerId = null;
    customerControls.form.reset();
    customerControls.submit.textContent = customerControls.defaultLabel;
    customerControls.cancel.hidden = true;
}

function startCustomerEdit(customer) {
    editState.customerId = customer.id;
    customerControls.form.first_name.value = customer.first_name || "";
    customerControls.form.last_name.value = customer.last_name || "";
    customerControls.form.phone.value = customer.phone || "";
    customerControls.form.email.value = customer.email || "";
    customerControls.form.address.value = customer.address || "";
    customerControls.submit.textContent = customerControls.updateLabel;
    customerControls.cancel.hidden = false;
    customerControls.form.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveSection("sec-customers-events");
}

async function deleteFolder(folderId) {
    if (!confirm(uiText.deleteConfirm)) return;
    await apiFetch(`/api/folders/${folderId}/`, { method: "DELETE" });
    showToast("Folder deleted.");
    await loadFolders();
    await loadInventory();
    await loadStats();
    renderDashboardFeed();
}

async function deleteItem(itemId) {
    if (!confirm(uiText.deleteConfirm)) return;
    await apiFetch(`/api/items/${itemId}/`, { method: "DELETE" });
    showToast("Item deleted.");
    await loadItems();
    await loadInventory();
    await loadStats();
    renderDashboardFeed();
}

async function deleteUnit(unitId) {
    if (!confirm(uiText.deleteConfirm)) return;
    await apiFetch(`/api/units/${unitId}/`, { method: "DELETE" });
    showToast("Unit deleted.");
    await loadUnits();
    renderDashboardFeed();
}

async function deleteCustomer(customerId) {
    if (!confirm(uiText.deleteConfirm)) return;
    await apiFetch(`/api/customers/${customerId}/`, { method: "DELETE" });
    showToast("Customer deleted.");
    await loadCustomers();
    renderDashboardFeed();
}

async function editEvent(event) {
    const nextDescription = prompt(uiText.updateEvent, event.description || "");
    if (nextDescription === null) return;
    await apiFetch(`/api/events/${event.id}/`, {
    method: "PATCH",
    body: JSON.stringify({ description: nextDescription.trim() || null }),
    });
    showToast("Event updated.");
    await loadEvents();
}

async function deleteEvent(eventId) {
    if (!confirm(uiText.deleteConfirm)) return;
    await apiFetch(`/api/events/${eventId}/`, { method: "DELETE" });
    showToast("Event deleted.");
    await loadEvents();
    await loadInventory();
    await loadStats();
    renderDashboardFeed();
}

function addEventItemRow() {
    const template = document.getElementById("event-item-template");
    const clone = template.content.cloneNode(true);
    const row = clone.querySelector(".item-row");

    row.querySelector('[data-action="remove-row"]').addEventListener("click", () => row.remove());

    row.querySelector('[data-field="item"]').addEventListener("change", (event) => {
    const selected = state.items.find((item) => item.id === event.target.value);
    if (selected) {
        const nameInput = row.querySelector('[data-field="name"]');
        if (!nameInput.value.trim()) nameInput.value = selected.name;
        const valueInput = row.querySelector('[data-field="value"]');
        if (!valueInput.value && selected.value) valueInput.value = selected.value;
    }
    });

    document.getElementById("event-items").appendChild(clone);
    updateEventItemSelects();
}

function collectEventItems(eventType) {
    const rows = Array.from(document.querySelectorAll(".item-row"));
    const items = rows.map((row) => {
    const itemId = row.querySelector('[data-field="item"]').value || null;
    const nameInput = row.querySelector('[data-field="name"]').value.trim();
    const quantity = parseFloat(row.querySelector('[data-field="quantity"]').value);
    const unit = row.querySelector('[data-field="unit"]').value.trim();
    const value = row.querySelector('[data-field="value"]').value;
    const selected = state.items.find((item) => item.id === itemId);
    const name = nameInput || (selected ? selected.name : "");
    return {
        item_id: itemId,
        name,
        quantity,
        unit: unit || null,
        value: value ? parseFloat(value) : null,
        sku: selected ? selected.sku : null,
        barcode: selected ? selected.barcode : null,
    };
    });

    const requiresInventory = ["BUY", "SELL", "MOVE"].includes(eventType);
    const missingItemIds = [];

    if (requiresInventory) {
    items.forEach((item) => {
        if (!item.item_id && item.name) {
        const normalized = item.name.trim().toLowerCase();
        const matches = state.items.filter((candidate) => (candidate.name || "").trim().toLowerCase() === normalized);
        if (matches.length === 1) {
            item.item_id = matches[0].id;
            item.sku = matches[0].sku;
            item.barcode = matches[0].barcode;
            if (!item.value && matches[0].value) item.value = matches[0].value;
        }
        }
        if (!item.item_id) missingItemIds.push(item.name || "");
    });
    }
    return { items, missingItemIds };
}

function updateEventFields() {
    const type = document.getElementById("event-type").value;
    const folderRow = document.getElementById("event-folder-row");
    const moveRow = document.getElementById("event-move-row");
    if (type === "MOVE") { folderRow.classList.add("hidden"); moveRow.classList.remove("hidden"); }
    else { folderRow.classList.remove("hidden"); moveRow.classList.add("hidden"); }
}

folderControls.cancel.addEventListener("click", resetFolderEdit);
itemControls.cancel.addEventListener("click", resetItemEdit);
unitControls.cancel.addEventListener("click", resetUnitEdit);
customerControls.cancel.addEventListener("click", resetCustomerEdit);

document.getElementById("event-type").addEventListener("change", updateEventFields);
document.getElementById("add-item-row").addEventListener("click", addEventItemRow);

document.getElementById("token-apply").addEventListener("click", () => {
    const value = document.getElementById("token-input").value.trim();
    if (value) { state.token = value; showToast("توکن فعال شد."); }
});

document.getElementById("event-customer-select").addEventListener("change", (event) => {
    const selected = state.customers.find((customer) => customer.id === event.target.value);
    if (selected) {
    document.querySelector('[name="customer_name"]').value = `${selected.first_name || ""} ${selected.last_name || ""}`.trim();
    document.querySelector('[name="customer_phone"]').value = selected.phone || "";
    document.querySelector('[name="customer_address"]').value = selected.address || "";
    }
});

document.getElementById("folder-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = { name: form.name.value.trim(), description: form.description.value.trim() || null };
    try {
    const isEditing = Boolean(editState.folderId);
    const url = isEditing ? `/api/folders/${editState.folderId}/` : "/api/folders/";
    const method = isEditing ? "PATCH" : "POST";
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (isEditing) { showToast("Folder updated."); resetFolderEdit(); }
    else { form.reset(); showToast("Folder saved."); }
    await loadFolders(); await loadInventory(); await loadStats();
    renderDashboardFeed();
    } catch (error) { showToast(error.message, "error"); }
});

document.getElementById("item-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
    name: form.name.value.trim(),
    sku: form.sku.value.trim() || null,
    barcode: form.barcode.value.trim() || null,
    description: form.description.value.trim() || null,
    value: form.value.value ? parseFloat(form.value.value) : null,
    has_qr_code: form.has_qr_code.checked,
    };
    try {
    const isEditing = Boolean(editState.itemId);
    const url = isEditing ? `/api/items/${editState.itemId}/` : "/api/items/";
    const method = isEditing ? "PATCH" : "POST";
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (isEditing) { showToast("Item updated."); resetItemEdit(); }
    else { form.reset(); showToast("Item saved."); }
    await loadItems(); await loadInventory(); await loadStats();
    renderDashboardFeed();
    } catch (error) { showToast(error.message, "error"); }
});

document.getElementById("unit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = { name: form.name.value.trim(), symbol: form.symbol.value.trim(), description: form.description.value.trim() || null };
    try {
    const isEditing = Boolean(editState.unitId);
    const url = isEditing ? `/api/units/${editState.unitId}/` : "/api/units/";
    const method = isEditing ? "PATCH" : "POST";
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (isEditing) { showToast("Unit updated."); resetUnitEdit(); }
    else { form.reset(); showToast("Unit saved."); }
    await loadUnits();
    renderDashboardFeed();
    } catch (error) { showToast(error.message, "error"); }
});

document.getElementById("customer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
    first_name: form.first_name.value.trim(),
    last_name: form.last_name.value.trim() || null,
    phone: form.phone.value.trim() || null,
    email: form.email.value.trim() || null,
    address: form.address.value.trim() || null,
    };
    try {
    const isEditing = Boolean(editState.customerId);
    const url = isEditing ? `/api/customers/${editState.customerId}/` : "/api/customers/";
    const method = isEditing ? "PATCH" : "POST";
    await apiFetch(url, { method, body: JSON.stringify(payload) });
    if (isEditing) { showToast("Customer updated."); resetCustomerEdit(); }
    else { form.reset(); showToast("Customer saved."); }
    await loadCustomers();
    renderDashboardFeed();
    } catch (error) { showToast(error.message, "error"); }
});

document.getElementById("event-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const eventType = form.type.value;

    const folderId = form.folder_id ? form.folder_id.value || null : null;
    const originId = form.origin_folder_id ? form.origin_folder_id.value || null : null;
    const destinationId = form.destination_folder_id ? form.destination_folder_id.value || null : null;

    if (eventType === "MOVE") {
    if (!originId || !destinationId) return showToast("برای جابه‌جایی، انبار مبدا و مقصد را انتخاب کنید.", "error");
    } else if (!folderId) {
    return showToast("برای ورود یا خروج، انبار را انتخاب کنید.", "error");
    }

    const { items, missingItemIds } = collectEventItems(eventType);
    if (!items.length || items.some((item) => !item.name || !item.quantity || Number.isNaN(item.quantity))) {
    return showToast("برای رویداد حداقل یک کالا با نام و تعداد وارد کنید.", "error");
    }
    if (missingItemIds.length) return showToast("برای بروزرسانی موجودی، کالا را از لیست انتخاب کنید.", "error");

    const payload = {
    type: eventType,
    description: form.description.value.trim() || null,
    folder_id: folderId,
    origin_folder_id: originId,
    destination_folder_id: destinationId,
    customer_name: form.customer_name.value.trim() || null,
    customer_phone: form.customer_phone.value.trim() || null,
    customer_address: form.customer_address.value.trim() || null,
    items,
    };

    await apiFetch("/api/events/", { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    document.getElementById("event-items").innerHTML = "";
    addEventItemRow();
    showToast("رویداد ثبت شد.");

    await loadEvents(); await loadInventory(); await loadStats();
    setActiveSection("sec-dashboard");
});

document.getElementById("upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fileInput = document.getElementById("upload-file");
    if (!fileInput.files.length) return showToast("فایلی انتخاب نشده است.", "error");
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    const data = await apiFetch("/api/upload/", { method: "POST", body: formData });
    const url = data.url || "";
    document.getElementById("upload-url").textContent = url;

    const preview = document.getElementById("upload-preview");
    if (url) {
    preview.src = url;
    preview.classList.remove("hidden");
    preview.classList.add("mt-3");
    }
    showToast("فایل آپلود شد.");
});

document.getElementById("ai-run").addEventListener("click", async () => {
    const days = document.getElementById("ai-days").value || 30;
    const data = await apiFetch(`/api/ai/predict-stockout/?days_history=${days}`);
    const rows = (data.predictions || []).map((item) => [
    item.item_name,
    formatter.format(item.current_quantity),
    formatter.format(item.avg_daily_sales),
    formatter.format(item.days_until_stockout),
    item.suggestion,
    ]);
    renderTable(document.querySelector("#ai-table tbody"), rows, "داده‌ای برای نمایش وجود ندارد.");
    showToast("پیش‌بینی به‌روز شد.");
});

document.getElementById("receipt-generate")?.addEventListener("click", makeAsyncHandler(async () => {
    const select = document.getElementById("receipt-event-select");
    const eventId = select?.value;
    if (!eventId) return showToast("رویدادی انتخاب نشده است.", "error");

    const kind = receiptGetSelectedKind();
    const base = state.events.find(e => e.id === eventId);
    if (!base) return showToast("رویداد یافت نشد.", "error");

    const detailed = await fetchEventDetailIfNeeded(base);
    const html = buildReceiptHtml({ kind, eventData: detailed });

    const preview = document.getElementById("receipt-preview");
    preview.innerHTML = html;

    preview.dataset.receiptHtml = html;
    preview.dataset.receiptTitle = `${kind === "buyer" ? "receipt-buy" : "receipt-sell"}-${eventId}`;
    showToast("رسید ساخته شد.");
}));

document.getElementById("receipt-clear")?.addEventListener("click", () => {
    const preview = document.getElementById("receipt-preview");
    preview.innerHTML = `<div class="text-sm text-gray-400">هنوز رسیدی ساخته نشده است.</div>`;
    delete preview.dataset.receiptHtml;
    delete preview.dataset.receiptTitle;
});

document.getElementById("receipt-save-local")?.addEventListener("click", () => {
    const preview = document.getElementById("receipt-preview");
    const html = preview?.dataset?.receiptHtml;
    const title = preview?.dataset?.receiptTitle || "receipt";
    if (!html) return showToast("ابتدا رسید را بسازید.", "error");

    const list = getLocalReceipts();
    const now = new Date().toLocaleString("fa-IR");
    list.push({ id: uid(), title, created: now, html });
    setLocalReceipts(list);
    receiptRenderSavedList();
    showToast("رسید در مرورگر ذخیره شد.");
});

document.getElementById("receipt-download")?.addEventListener("click", () => {
    const preview = document.getElementById("receipt-preview");
    const html = preview?.dataset?.receiptHtml;
    const title = preview?.dataset?.receiptTitle || "receipt";
    if (!html) return showToast("ابتدا رسید را بسازید.", "error");
    receiptDownloadHtml(title, html);
    showToast("دانلود شروع شد.");
});

document.getElementById("receipt-print")?.addEventListener("click", () => {
    const preview = document.getElementById("receipt-preview");
    const html = preview?.dataset?.receiptHtml;
    if (!html) return showToast("ابتدا رسید را بسازید.", "error");
    receiptPrint(html);
});

document.addEventListener("click", (e) => {
    const viewId = e.target?.dataset?.receiptView;
    const delId = e.target?.dataset?.receiptDel;
    if (!viewId && !delId) return;

    const list = getLocalReceipts();

    if (viewId) {
    const r = list.find(x => x.id === viewId);
    if (!r) return showToast("رسید پیدا نشد.", "error");
    const preview = document.getElementById("receipt-preview");
    preview.innerHTML = r.html;
    preview.dataset.receiptHtml = r.html;
    preview.dataset.receiptTitle = r.title || "receipt";
    setActiveSection("sec-receipt");
    return;
    }

    if (delId) {
    const next = list.filter(x => x.id !== delId);
    setLocalReceipts(next);
    receiptRenderSavedList();
    showToast("رسید حذف شد.");
    }
});

async function initDashboard() {
    await loadToken();
    if (!state.token) return;

    ["folders-table","items-table","units-table","customers-table","events-table"].forEach(ensureActionColumn);

    await Promise.all([
    loadStats(),
    loadFolders(),
    loadItems(),
    loadUnits(),
    loadCustomers(),
    loadEvents(),
    loadInventory(),
    ]);

    if (!document.querySelector(".item-row")) addEventItemRow();

    renderDashboardFeed();
    receiptPopulateEvents();
    receiptRenderSavedList();
}

initDashboard().catch((error) => showToast(error.message, "error"));