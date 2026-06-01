const store = {
  baseUrl: localStorage.getItem("khatiyan.baseUrl") || "http://localhost:8080",
  token: localStorage.getItem("khatiyan.token") || "",
  user: readJson("khatiyan.user"),
  selectedProperty: readJson("khatiyan.selectedProperty"),
  selectedTenancy: readJson("khatiyan.selectedTenancy"),
  rooms: [],
  stagedBulkRooms: readJson("khatiyan.stagedBulkRooms") || [],
  collapsed: readJson("khatiyan.collapsed") || {},
  firebaseConfig: readJson("khatiyan.firebaseConfig"),
  firebaseIdToken: localStorage.getItem("khatiyan.firebaseIdToken") || "",
  selectedBillingCycle: null,
  managedBillingCycles: [],
  myBillingCycles: [],
  localPlaceTags: [],
  discoveryPage: 0,
  locationPicker: {
    map: null,
    targetForm: null,
  },
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const output = $("#output");
const baseUrlInput = $("#baseUrl");
const sessionDot = $("#sessionDot");
const sessionLabel = $("#sessionLabel");
const userSummary = $("#userSummary");
const selectedPropertyLabel = $("#selectedPropertyLabel");
const modulePropertyLabel = $("#modulePropertyLabel");
const concernPropertyLabel = $("#concernPropertyLabel");
const noticePropertyLabel = $("#noticePropertyLabel");
const billingPropertyLabel = $("#billingPropertyLabel");
const billingTenancyLabel = $("#billingTenancyLabel");

const roomTypeCapacity = {
  SINGLE: 1,
  DOUBLE: 2,
  TRIPLE: 3,
  FOUR_SHARING: 4,
  FIVE_SHARING: 5,
  DORMITORY: 6,
};

const propertyFacilities = [
  "WIFI",
  "WASHING_MACHINE",
  "MESS",
  "ROOM_CLEANING",
  "GYM",
  "PARKING",
  "POWER_BACKUP",
  "CCTV",
  "SECURITY",
  "DRINKING_WATER",
  "HOT_WATER",
  "COMMON_KITCHEN",
  "REFRIGERATOR",
  "STUDY_AREA",
  "LIFT",
  "AIR_CONDITIONING",
  "HOUSEKEEPING",
  "LAUNDRY_SERVICE",
];

baseUrlInput.value = store.baseUrl;

function readJson(key) {
  const value = localStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function isAdminUser() {
  return store.user?.role === "OWNER";
}

function isTenantUser() {
  return store.user?.role === "TENANT"
    || store.user?.role === "USER"
    || store.user?.activeTenant === true;
}

function isActiveTenancyStatus(status) {
  return status === "ACTIVE" || status === "ON_NOTICE" || status === "ON_PREMATURE_NOTICE";
}

function sortCyclesNewestFirst(cycles) {
  return [...(cycles || [])].sort((left, right) => {
    const leftDate = left.periodStartDate || "";
    const rightDate = right.periodStartDate || "";
    if (leftDate !== rightDate) {
      return rightDate.localeCompare(leftDate);
    }

    return Number(right.cycleNumber || 0) - Number(left.cycleNumber || 0);
  });
}

function hasAuthority(authoritySpec) {
  if (!authoritySpec) return true;

  const allowedAuthorities = authoritySpec.split(/\s+/).filter(Boolean);
  if (allowedAuthorities.includes("admin") && isAdminUser()) return true;
  if (allowedAuthorities.includes("tenant") && isTenantUser()) return true;

  return false;
}

function canUseView(viewId) {
  const navItem = $(`.nav-item[data-view="${viewId}"]`);
  return hasAuthority(navItem?.dataset.authority || "");
}

function applyAuthorityVisibility() {
  $$("[data-authority]").forEach((element) => {
    element.hidden = !hasAuthority(element.dataset.authority);
  });

  const activeView = $(".view.active");
  if (activeView && !canUseView(activeView.id)) {
    useView("auth");
  }
}

function decodeJwtPayload(token) {
  if (!token) return null;

  try {
    const payload = token.split(".")[1];
    const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getJwtExpiryMs(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return null;
  return payload.exp * 1000;
}

function isJwtExpired(token) {
  const expiresAtMs = getJwtExpiryMs(token);
  if (!expiresAtMs) return true;
  return Date.now() >= expiresAtMs;
}

function formatJwtExpiry(token) {
  const expiresAtMs = getJwtExpiryMs(token);
  if (!expiresAtMs) return "expiry unknown";
  return `expires ${new Date(expiresAtMs).toLocaleString()}`;
}

function setCollapsed(key, collapsed) {
  store.collapsed[key] = collapsed;
  writeJson("khatiyan.collapsed", store.collapsed);
  applyCollapsedState(key);
}

function applyCollapsedState(key) {
  const config = {
    rooms: {
      section: "#roomsListSection",
      button: "#toggleRoomsList",
      openText: "Minimize List",
      closedText: "Show List",
    },
    managers: {
      section: "#managersListSection",
      button: "#toggleManagersList",
      openText: "Minimize List",
      closedText: "Show List",
    },
    output: {
      section: "#outputBody",
      button: "#toggleOutput",
      openText: "Minimize",
      closedText: "Show",
      panel: ".output-panel",
    },
    ownerNotifications: {
      section: "#ownerNotificationsBody",
      button: "#toggleOwnerNotifications",
      openText: "Minimize",
      closedText: "Show",
      panel: "#ownerNotificationsPanel",
    },
  }[key];

  const isCollapsed = Boolean(store.collapsed[key]);
  const section = $(config.section);
  const button = $(config.button);
  section.classList.toggle("collapsed", isCollapsed);
  button.textContent = isCollapsed ? config.closedText : config.openText;

  if (config.panel) {
    $(config.panel).classList.toggle("minimized", isCollapsed);
  }
}

function toggleCollapsed(key) {
  setCollapsed(key, !store.collapsed[key]);
}

function setOutput(label, data) {
  output.textContent = `${label}\n${JSON.stringify(data, null, 2)}`;
}

function setSession(token, user) {
  if (token) {
    if (isJwtExpired(token)) {
      clearSession();
      setOutput("Session expired", { message: "Received an already expired token" });
      return;
    }

    store.token = token;
    localStorage.setItem("khatiyan.token", token);
  }
  if (user) {
    store.user = user;
    writeJson("khatiyan.user", user);
  }
  renderSession();
}

function clearSession() {
  store.token = "";
  store.user = null;
  store.selectedProperty = null;
  store.selectedTenancy = null;
  store.selectedBillingCycle = null;
  store.stagedBulkRooms = [];
  localStorage.removeItem("khatiyan.token");
  localStorage.removeItem("khatiyan.user");
  localStorage.removeItem("khatiyan.selectedProperty");
  localStorage.removeItem("khatiyan.selectedTenancy");
  localStorage.removeItem("khatiyan.stagedBulkRooms");
  renderSession();
  renderProperties([]);
  renderRooms([]);
  renderManagers([]);
  renderTenancies([]);
  renderPastTenancies("#pastTenanciesList", [], "admin");
  renderPastTenancies("#tenantPastTenanciesList", [], "tenant");
  renderConcerns("#tenantCurrentConcernsList", []);
  renderConcerns("#tenantConcernHistoryList", []);
  renderConcerns("#availableConcernsList", []);
  renderConcerns("#undertakenConcernsList", []);
  renderConcerns("#propertyConcernHistoryList", []);
  renderBoardCategories([]);
  renderBoardItems([]);
  renderNotices("#publishedNoticesList", []);
  renderNotices("#visibleAdminNoticesList", []);
  renderNotices("#archivedNoticesList", []);
  renderNotices("#tenantVisibleNoticesList", []);
  renderNotifications("#ownerNotificationsList", []);
  renderNotifications("#tenantNotificationsList", []);
  renderBillingCycles("#managedBillingCyclesList", []);
  renderBillingCycles("#myBillingCyclesList", []);
  renderBillingCycles("#pastTenancyBillingHistory", []);
  renderBillingCycles("#tenantPastBillingHistory", []);
  renderBillingLineItems("#managedBillingLineItemsList", [], []);
  renderBillingLineItems("#myBillingLineItemsList", [], []);
  renderDeposit("#managedDepositView", null);
  renderDeposit("#myDepositView", null);
  renderDeposit("#pastTenancyDepositHistory", null);
  renderDeposit("#tenantPastDepositHistory", null);
  renderExitRequests("#adminExitRequestsList", []);
  renderExitRequests("#exitRequestsList", []);
  updateBillingSelectionSummary();
  updateUnreadBadge("#ownerUnreadCount", 0);
  updateUnreadBadge("#tenantUnreadCount", 0);
  renderRecurringNotices([]);
  renderBulkRooms();
  renderDiscoveryProperties(null);
  renderLocalPlaces("#tenantLocalPlacesList", []);
  renderLocalPlaces("#discoveryTenantLocalPlacesList", []);
  renderLocalPlaces("#managedLocalPlacesList", []);
}

function renderSession() {
  const hasValidToken = Boolean(store.token) && !isJwtExpired(store.token);
  sessionDot.classList.toggle("online", hasValidToken);
  sessionLabel.textContent = hasValidToken ? `Token saved, ${formatJwtExpiry(store.token)}` : "Not logged in";
  if (store.user) {
    userSummary.textContent = `${store.user.fullName} | ${store.user.role} | ${store.user.phone}`;
  } else {
    userSummary.textContent = "No active user";
  }

  if (store.selectedProperty) {
    selectedPropertyLabel.textContent = `${store.selectedProperty.name} (${store.selectedProperty.id})`;
    modulePropertyLabel.textContent = `${store.selectedProperty.name} | ${store.selectedProperty.city} | ${store.selectedProperty.id}`;
    concernPropertyLabel.textContent = `${store.selectedProperty.name} | ${store.selectedProperty.city} | ${store.selectedProperty.id}`;
    noticePropertyLabel.textContent = `${store.selectedProperty.name} | ${store.selectedProperty.city} | ${store.selectedProperty.id}`;
    billingPropertyLabel.textContent = `${store.selectedProperty.name} | ${store.selectedProperty.city} | ${store.selectedProperty.id}`;
  } else {
    selectedPropertyLabel.textContent = "None";
    modulePropertyLabel.textContent = "Select a property from Owner first.";
    concernPropertyLabel.textContent = "Select a property from Owner first for owner/manager concern queues.";
    noticePropertyLabel.textContent = "Select a property from Owner first for owner/manager notice tools.";
    billingPropertyLabel.textContent = "Select a property from Owner, then select a tenancy from Modules.";
  }

  billingTenancyLabel.textContent = store.selectedTenancy
    ? `Tenancy ${store.selectedTenancy.id}`
    : "No tenancy selected";

  setBillingTenancyFields(store.selectedTenancy);
  updateBillingSelectionSummary();
  applyAuthorityVisibility();
}

function updateBillingSelectionSummary() {
  const title = $("#billingSelectedTenancyTitle");
  const meta = $("#billingSelectedTenancyMeta");
  if (!title || !meta) return;

  if (!store.selectedTenancy) {
    title.textContent = "No tenancy selected";
    meta.textContent = "Choose a tenancy from the list to load cycles, deposit ledger, and exit actions.";
    return;
  }

  const tenancy = store.selectedTenancy;
  title.textContent = `${displayEnum(tenancy.billingType)} tenancy | ${displayEnum(tenancy.status)}`;
  meta.textContent = [
    `Tenancy ${tenancy.id}`,
    `Tenant ${tenancy.userId}`,
    `Room ${tenancy.roomId}`,
    tenancy.billingType === "DAILY"
      ? `Daily ${moneyText(tenancy.dailyRatePaise)} until ${tenancy.plannedEndDate}`
      : `Rent ${moneyText(tenancy.rentAmountPaise)} | Deposit ${moneyText(tenancy.depositAmountPaise)}`,
  ].join(" | ");
}

function clearSelectedTenancy(reason) {
  store.selectedTenancy = null;
  store.selectedBillingCycle = null;
  store.managedBillingCycles = [];
  localStorage.removeItem("khatiyan.selectedTenancy");
  clearBillingForms();
  renderBillingLineItems("#managedBillingLineItemsList", [], []);
  updateBillingSelectionSummary();
  renderSession();

  if (reason) {
    setOutput("Billing tenancy unselected", { message: reason });
  }
}

function clearBillingForms() {
  const forms = [
    "#addBillingExtraChargesForm",
    "#addBillingDiscountForm",
    "#adjustBillingLineForm",
    "#recordPaymentSuccessForm",
    "#createPaymentOrderForm",
    "#depositCorrectionForm",
  ];

  forms.forEach((selector) => {
    const form = $(selector);
    if (!form) return;

    if (form.billingCycleId) {
      form.billingCycleId.value = "";
    }
    if (form.selectedTenancyLabel) {
      form.selectedTenancyLabel.value = "";
    }
    if (form.lineItemId) {
      form.lineItemId.value = "";
    }
    if (form.tenancyId) {
      form.tenancyId.value = "";
    }
    if (form.paidAmountRupees) {
      form.paidAmountRupees.value = "";
    }
    if (form.idempotencyKey) {
      form.idempotencyKey.value = "";
    }
  });
}

function reconcileSelectedBillingTenancy(tenancies) {
  if (!store.selectedTenancy) return;

  const current = (tenancies || []).find((tenancy) => tenancy.id === store.selectedTenancy.id);
  if (!current || !isActiveTenancyStatus(current.status)) {
    clearSelectedTenancy("Selected tenancy is no longer active for billing. Use Past Tenancies for history.");
    return;
  }

  store.selectedTenancy = current;
  writeJson("khatiyan.selectedTenancy", current);
  updateBillingSelectionSummary();
  renderSession();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function checkedValues(form, name) {
  return new FormData(form).getAll(name);
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function rupeesToPaise(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Math.round(Number(value) * 100);
}

function paiseToRupees(value) {
  if (value === undefined || value === null) return "";
  return (Number(value) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function paiseToRupeesNumber(value) {
  if (value === undefined || value === null) return "";
  return Number(value) / 100;
}

function moneyText(value) {
  return `Rs ${paiseToRupees(value || 0)}`;
}

function rupeesToPaiseOrCurrent(value, currentPaise) {
  const nextPaise = rupeesToPaise(value);
  return nextPaise === undefined ? currentPaise : nextPaise;
}

function newIdempotencyKey(prefix = "khatiyan") {
  if (window.crypto?.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanBody(body) {
  return Object.fromEntries(
    Object.entries(body).filter(([, value]) => value !== undefined && value !== "")
  );
}

function displayEnum(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusTone(value) {
  const status = String(value || "").toUpperCase();
  if (["PAID", "APPROVED", "EXECUTED", "ACTIVE"].includes(status)) return "good";
  if (["OVERDUE", "REJECTED", "CANCELLED", "DELETED"].includes(status)) return "bad";
  if (["REQUESTED", "UNPAID", "ON_NOTICE", "ON_PREMATURE_NOTICE"].includes(status)) return "warn";
  return "";
}

function parseCustomFacilities(value) {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map((facility) => facility.trim())
    .filter(Boolean);
}

function selectedFacilities(form) {
  return Array.from(form.querySelectorAll("input[name='facilities']:checked"))
    .map((input) => input.value);
}

function propertyBodyFromForm(form) {
  const data = formData(form);
  return cleanBody({
    ...data,
    latitude: optionalNumber(data.latitude),
    longitude: optionalNumber(data.longitude),
    facilities: selectedFacilities(form),
    customFacilities: parseCustomFacilities(data.customFacilities),
    dailyGuestAcRatePaise: rupeesToPaise(data.dailyGuestAcRateRupees),
    dailyGuestNonAcRatePaise: rupeesToPaise(data.dailyGuestNonAcRateRupees),
    rentLateFeePerDayPaise: rupeesToPaise(data.rentLateFeePerDayRupees),
    rentGraceDays: optionalNumber(data.rentGraceDays),
    standardDepositPaise: rupeesToPaise(data.standardDepositRupees),
    noticePeriodDays: optionalNumber(data.noticePeriodDays),
  });
}

function propertyAddressQueryFromForm(form) {
  const data = formData(form);
  return [data.address || data.addressText, data.city, data.pincode]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function defaultMapCenter() {
  const latitude = Number(store.selectedProperty?.latitude);
  const longitude = Number(store.selectedProperty?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return [latitude, longitude];
  }

  return [17.385044, 78.486671];
}

function openAddressInMaps(form) {
  const query = propertyAddressQueryFromForm(form);
  if (!query) {
    setOutput("Missing address", { message: "Enter address, city, or pincode before opening Maps." });
    return;
  }

  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  setOutput("Opened address in Maps", {
    query,
    note: "Use the selected Maps location to copy accurate latitude/longitude if needed.",
  });
}

function openLocationPicker(form) {
  if (!window.L) {
    setOutput("Map unavailable", { message: "Leaflet map library is still loading or unavailable." });
    return;
  }

  store.locationPicker.targetForm = form;
  $("#locationPickerOverlay").hidden = false;

  const formLatitude = Number(form.latitude.value);
  const formLongitude = Number(form.longitude.value);
  const center = Number.isFinite(formLatitude) && Number.isFinite(formLongitude)
    ? [formLatitude, formLongitude]
    : defaultMapCenter();

  if (!store.locationPicker.map) {
    const map = window.L.map("propertyLocationPickerMap").setView(center, 16);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);
    map.on("moveend", updateLocationPickerPreview);
    store.locationPicker.map = map;
  } else {
    store.locationPicker.map.setView(center, 16);
  }

  refreshLocationPickerMapSize();

  centerPickerOnCurrentLocation(false);
}

function closeLocationPicker() {
  $("#locationPickerOverlay").hidden = true;
}

function centerPickerOnCurrentLocation(showOutput = true) {
  if (!navigator.geolocation || !store.locationPicker.map) {
    if (showOutput) {
      setOutput("Location unavailable", { message: "This browser does not support geolocation." });
    }
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      store.locationPicker.map.setView([position.coords.latitude, position.coords.longitude], 17);
      refreshLocationPickerMapSize();
      updateLocationPickerPreview();
      if (showOutput) {
        setOutput("Picker centered on current location", {
          latitude: Number(position.coords.latitude.toFixed(7)),
          longitude: Number(position.coords.longitude.toFixed(7)),
          accuracyMeters: position.coords.accuracy,
        });
      }
    },
    (error) => {
      if (showOutput) {
        setOutput("Current location failed", {
          code: error.code,
          message: error.message,
        });
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    }
  );
}

function refreshLocationPickerMapSize() {
  const map = store.locationPicker.map;
  if (!map) return;

  [50, 200, 500].forEach((delay) => {
    setTimeout(() => {
      map.invalidateSize();
      updateLocationPickerPreview();
    }, delay);
  });
}

function updateLocationPickerPreview() {
  const map = store.locationPicker.map;
  if (!map) return;

  const center = map.getCenter();
  const latitude = Number(center.lat.toFixed(7));
  const longitude = Number(center.lng.toFixed(7));
  $("#locationPickerCoords").textContent = `${latitude}, ${longitude}`;
  $("#locationPickerAddress").textContent = "Move the map to adjust the pointer.";
}

async function reverseGeocodePickedLocation(latitude, longitude) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocode failed with HTTP ${response.status}`);
  }

  return response.json();
}

function applyReverseGeocodeToForm(form, result) {
  if (!result?.address) return;

  const address = result.address;
  const addressParts = [
    address.house_number,
    address.road,
    address.neighbourhood,
    address.suburb,
  ].filter(Boolean);
  const city = address.city || address.town || address.village || address.county;
  const pincode = address.postcode;

  if (form.address && !form.address.value) {
    form.address.value = addressParts.length ? addressParts.join(", ") : result.display_name || "";
  }
  if (form.addressText && !form.addressText.value) {
    form.addressText.value = result.display_name || addressParts.join(", ");
  }
  if (city && form.city && !form.city.value) {
    form.city.value = city;
  }
  if (pincode && form.pincode && !form.pincode.value) {
    form.pincode.value = pincode;
  }
}

async function usePickedLocation() {
  const map = store.locationPicker.map;
  const form = store.locationPicker.targetForm;
  if (!map || !form) return;

  const center = map.getCenter();
  const latitude = Number(center.lat.toFixed(7));
  const longitude = Number(center.lng.toFixed(7));
  form.latitude.value = latitude;
  form.longitude.value = longitude;

  let reverseGeocode = null;
  try {
    reverseGeocode = await reverseGeocodePickedLocation(latitude, longitude);
    applyReverseGeocodeToForm(form, reverseGeocode);
  } catch {
    reverseGeocode = null;
  }

  closeLocationPicker();
  setOutput("Picked location applied", {
    latitude,
    longitude,
    address: reverseGeocode?.display_name || null,
  });
}

function propertyBodyWithDailyRates(form) {
  const data = formData(form);
  const property = store.selectedProperty;

  return cleanBody({
    name: property.name,
    address: property.address,
    city: property.city,
    pincode: property.pincode,
    latitude: property.latitude,
    longitude: property.longitude,
    type: property.type,
    facilities: property.facilities || [],
    customFacilities: property.customFacilities || [],
    dailyGuestAcRatePaise: rupeesToPaiseOrCurrent(
      data.dailyGuestAcRateRupees,
      property.dailyGuestAcRatePaise
    ),
    dailyGuestNonAcRatePaise: rupeesToPaiseOrCurrent(
      data.dailyGuestNonAcRateRupees,
      property.dailyGuestNonAcRatePaise
    ),
    rentLateFeePerDayPaise: property.rentLateFeePerDayPaise,
    rentGraceDays: property.rentGraceDays,
    standardDepositPaise: property.standardDepositPaise,
    noticePeriodDays: property.noticePeriodDays,
  });
}

function dateTimeLocalToInstant(value) {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

function normalizeFirebasePhone(phone) {
  const trimmed = String(phone || "").trim();
  if (trimmed.startsWith("+")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

function firebaseClient() {
  if (!window.khatiyanFirebase) {
    throw new Error("Firebase client is still loading. Try again in a moment.");
  }
  return window.khatiyanFirebase;
}

function initFirebaseFromStore() {
  if (!store.firebaseConfig) return;
  if (!window.khatiyanFirebase) {
    return null;
  }
  return firebaseClient().init(store.firebaseConfig);
}

async function api(path, options = {}) {
  if (store.token && isJwtExpired(store.token)) {
    clearSession();
    const error = new Error("Session expired");
    error.payload = { code: "SESSION_EXPIRED", message: "JWT expired. Please log in again." };
    throw error;
  }

  const url = `${store.baseUrl}${path}`;
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(store.token ? { Authorization: `Bearer ${store.token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.payload = data;
    if (response.status === 401) {
      clearSession();
    }
    throw error;
  }

  return data;
}

async function run(label, callback) {
  try {
    const data = await callback();
    setOutput(label, data ?? { ok: true });
    return data;
  } catch (error) {
    setOutput(`${label} failed`, error.payload || error.message);
    throw error;
  }
}

function useView(id) {
  if (!canUseView(id)) {
    setOutput("Panel hidden", {
      message: "This login does not have authority for that panel.",
      requestedView: id,
      role: store.user?.role || null,
      activeTenant: store.user?.activeTenant || false,
    });
    id = "auth";
  }

  $$(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === id));
  $("#viewTitle").textContent = id[0].toUpperCase() + id.slice(1);
  applyAuthorityVisibility();

  if (id === "owner" && store.token && isAdminUser()) {
    loadProperties();
    loadOwnerNotifications();
    if (store.selectedProperty) {
      loadManagedDiscoveryProfile();
      loadManagedLocalPlaces();
    }
  }
  if (id === "discovery") {
    loadDiscoveryProperties();
    if (store.token && isTenantUser()) {
      loadTenantLocalPlaces();
    }
  }
  if (id === "modules" && store.token && store.selectedProperty && isAdminUser()) {
    loadModules();
  }
  if (id === "concerns" && store.token) {
    if (isTenantUser()) {
      loadTenantConcerns();
    }
    if (store.selectedProperty && isAdminUser()) {
      loadAdminConcerns();
    }
  }
  if (id === "notices" && store.token && store.selectedProperty && isAdminUser()) {
    loadNoticeAdmin();
  }
  if (id === "billing" && store.token) {
    loadBillingWorkspace();
  }
  if (id === "tenant" && store.token && isTenantUser()) {
    loadTenantVisibleNotices();
    loadTenantNotifications();
    loadTenantExitRequests();
    loadTenantPastTenancies();
    if (store.user?.activeTenant) {
      loadTenantLocalPlaces();
    } else {
      renderLocalPlaces("#tenantLocalPlacesList", []);
    }
  }
}

async function loadProfile() {
  const user = await run("GET /api/v1/auth/me", () => api("/api/v1/auth/me"));
  setSession(null, user);
  return user;
}

async function loadTenantActiveTenancy() {
  try {
    const profile = await run("GET /api/v1/tenancies/me/active", () => api("/api/v1/tenancies/me/active"));
    $("#tenantActiveTenancy").textContent = JSON.stringify(profile, null, 2);
    return profile;
  } catch (error) {
    $("#tenantActiveTenancy").textContent = JSON.stringify(error.payload || error.message, null, 2);
    throw error;
  }
}

async function loadProperties() {
  const properties = await run("GET /api/v1/properties", () => api("/api/v1/properties"));
  renderProperties(properties || []);
  return properties;
}

function discoverySearchParams() {
  const form = $("#discoverySearchForm");
  const data = formData(form);
  const params = new URLSearchParams();
  const page = store.discoveryPage || 0;

  if (data.city) params.set("city", data.city);
  if (data.locality) params.set("locality", data.locality);
  if (data.latitude) params.set("latitude", data.latitude);
  if (data.longitude) params.set("longitude", data.longitude);
  if (data.radiusKm) params.set("radiusKm", data.radiusKm);
  params.set("page", page);
  params.set("size", data.size || "20");

  return params;
}

function getCurrentBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support geolocation."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(new Error(error.message || "Current location permission failed.")),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}

async function fillDiscoveryCurrentLocation(force = false) {
  const form = $("#discoverySearchForm");
  if (!force && form.latitude.value && form.longitude.value) {
    return true;
  }

  try {
    const position = await getCurrentBrowserLocation();
    form.latitude.value = Number(position.coords.latitude.toFixed(7));
    form.longitude.value = Number(position.coords.longitude.toFixed(7));
    return true;
  } catch (error) {
    renderDiscoveryProperties(null);
    setOutput("Discovery location required", {
      message: error.message,
      note: "Allow location access or enter latitude/longitude manually to search nearby properties.",
    });
    return false;
  }
}

async function localPlaceLocationParams() {
  const discoveryForm = $("#discoverySearchForm");
  if (discoveryForm?.latitude.value && discoveryForm?.longitude.value) {
    const params = new URLSearchParams();
    params.set("latitude", discoveryForm.latitude.value);
    params.set("longitude", discoveryForm.longitude.value);
    return params;
  }

  const position = await getCurrentBrowserLocation();
  const params = new URLSearchParams();
  params.set("latitude", Number(position.coords.latitude.toFixed(7)));
  params.set("longitude", Number(position.coords.longitude.toFixed(7)));
  return params;
}

async function loadDiscoveryProperties() {
  const hasLocation = await fillDiscoveryCurrentLocation(false);
  if (!hasLocation) {
    return null;
  }

  const params = discoverySearchParams();
  const page = await run("GET discovery properties", () => api(`/api/v1/discovery/properties?${params.toString()}`));
  renderDiscoveryProperties(page);
  return page;
}

async function loadManagedDiscoveryProfile() {
  if (!requireProperty()) return;
  const profile = await run("GET discovery profile", () => api(`/api/v1/properties/${store.selectedProperty.id}/discovery-profile`));
  fillDiscoveryProfileForm(profile);
  return profile;
}

async function loadManagedLocalPlaces() {
  if (!requireProperty()) return;
  const params = new URLSearchParams();
  if (store.selectedProperty.latitude && store.selectedProperty.longitude) {
    params.set("latitude", store.selectedProperty.latitude);
    params.set("longitude", store.selectedProperty.longitude);
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const places = await run("GET managed local places", () => api(`/api/v1/properties/${store.selectedProperty.id}/local-places${suffix}`));
  renderLocalPlaces("#managedLocalPlacesList", places || [], "admin");
  return places;
}

async function loadTenantLocalPlaces() {
  if (!store.user?.activeTenant) {
    renderLocalPlaces("#tenantLocalPlacesList", []);
    renderLocalPlaces("#discoveryTenantLocalPlacesList", []);
    setOutput("No active tenancy", { message: "Local discovery is available after the user has an active tenancy." });
    return [];
  }

  let params;
  try {
    params = await localPlaceLocationParams();
  } catch (error) {
    renderLocalPlaces("#tenantLocalPlacesList", []);
    renderLocalPlaces("#discoveryTenantLocalPlacesList", []);
    setOutput("Local place distance unavailable", {
      message: error.message,
      note: "Allow location access or search discovery with latitude/longitude to see nearby local places.",
    });
    return [];
  }

  const places = await run("GET tenant local places", () => api(`/api/v1/discovery/me/local-places?${params.toString()}`));
  renderLocalPlaces("#tenantLocalPlacesList", places || [], "tenant");
  renderLocalPlaces("#discoveryTenantLocalPlacesList", places || [], "tenant");
  return places;
}

async function loadRooms() {
  if (!requireProperty()) return;
  const rooms = await run("GET rooms", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms`));
  renderRooms(rooms || []);
}

async function loadManagers() {
  if (!requireProperty()) return;
  const managers = await run("GET managers", () => api(`/api/v1/properties/${store.selectedProperty.id}/managers`));
  renderManagers(managers || []);
}

async function loadTenancies() {
  if (!requireProperty()) return;
  const tenancies = await run("GET tenancies", () => api(`/api/v1/tenancies?propertyId=${store.selectedProperty.id}`));
  renderTenancies(tenancies || []);
  reconcileSelectedBillingTenancy(tenancies || []);
  renderBillingTenancies(tenancies || []);
  return tenancies;
}

async function loadPastTenancies() {
  if (!requireProperty()) return;
  const tenancies = await run("GET past tenancies", () => api(`/api/v1/tenancies?propertyId=${store.selectedProperty.id}&includePast=true`));
  const pastTenancies = (tenancies || []).filter((tenancy) => !isActiveTenancyStatus(tenancy.status));
  renderPastTenancies("#pastTenanciesList", pastTenancies, "admin");
  return pastTenancies;
}

async function loadBillingTenancies() {
  if (!requireProperty()) return;
  const tenancies = await run("GET billing tenancies", () => api(`/api/v1/tenancies?propertyId=${store.selectedProperty.id}`));
  reconcileSelectedBillingTenancy(tenancies || []);
  renderBillingTenancies(tenancies || []);
  return tenancies;
}

async function loadTenantPastTenancies() {
  const tenancies = await run("GET my tenancies", () => api("/api/v1/tenancies/me"));
  const pastTenancies = (tenancies || []).filter((tenancy) => !isActiveTenancyStatus(tenancy.status));
  renderPastTenancies("#tenantPastTenanciesList", pastTenancies, "tenant");
  return pastTenancies;
}

async function loadPastTenancyHistory(tenancy, mode = "admin") {
  const cyclesSelector = mode === "tenant" ? "#tenantPastBillingHistory" : "#pastTenancyBillingHistory";
  const depositSelector = mode === "tenant" ? "#tenantPastDepositHistory" : "#pastTenancyDepositHistory";
  const cyclePath = mode === "tenant"
    ? `/api/v1/billing/me/tenancies/${tenancy.id}/cycles`
    : `/api/v1/billing/tenancies/${tenancy.id}/cycles`;
  const depositPath = mode === "tenant"
    ? `/api/v1/billing/me/tenancies/${tenancy.id}/deposit`
    : `/api/v1/billing/tenancies/${tenancy.id}/deposit`;

  const cycles = await run("GET past tenancy billing cycles", () => api(cyclePath));
  renderBillingCycles(cyclesSelector, sortCyclesNewestFirst(cycles), "history");

  if (tenancy.billingType !== "MONTHLY") {
    renderDeposit(depositSelector, null);
    setOutput("Past tenancy history loaded", {
      tenancyId: tenancy.id,
      billingCycles: cycles,
      deposit: "Daily tenancy has no deposit ledger",
    });
    return;
  }

  try {
    const deposit = await run("GET past tenancy deposit", () => api(depositPath));
    renderDeposit(depositSelector, deposit);
    setOutput("Past tenancy history loaded", { tenancyId: tenancy.id, billingCycles: cycles, deposit });
  } catch (error) {
    renderDeposit(depositSelector, null);
    setOutput("Past tenancy billing loaded without deposit", {
      tenancyId: tenancy.id,
      billingCycles: cycles,
      depositError: error.payload || error.message,
    });
  }
}

async function loadTenantCurrentConcerns() {
  const concerns = await run("GET tenant current concerns", () => api("/api/v1/concerns/me/current"));
  renderConcerns("#tenantCurrentConcernsList", concerns || [], "tenant");
}

async function loadTenantConcernHistory() {
  const concerns = await run("GET tenant concern history", () => api("/api/v1/concerns/me/history"));
  renderConcerns("#tenantConcernHistoryList", concerns || [], "tenant");
}

async function loadTenantConcerns() {
  await Promise.all([
    loadTenantCurrentConcerns(),
    loadTenantConcernHistory(),
  ]);
}

async function loadAvailableConcerns() {
  if (!requireProperty()) return;
  const concerns = await run("GET available concerns", () => api(`/api/v1/properties/${store.selectedProperty.id}/concerns/available`));
  renderConcerns("#availableConcernsList", concerns || [], "admin");
}

async function loadUndertakenConcerns() {
  const concerns = await run("GET undertaken concerns", () => api("/api/v1/concerns/undertaken"));
  renderConcerns("#undertakenConcernsList", concerns || [], "admin");
}

async function loadPropertyConcernHistory() {
  if (!requireProperty()) return;
  const concerns = await run("GET property concern history", () => api(`/api/v1/properties/${store.selectedProperty.id}/concerns/history`));
  renderConcerns("#propertyConcernHistoryList", concerns || [], "admin");
}

async function loadAdminConcerns() {
  if (!requireProperty()) return;
  await Promise.all([
    loadAvailableConcerns(),
    loadUndertakenConcerns(),
    loadPropertyConcernHistory(),
  ]);
}

async function loadBoardCategories() {
  if (!requireProperty()) return;
  const categories = await run("GET property board categories", () => api(`/api/v1/properties/${store.selectedProperty.id}/property-board/categories`));
  renderBoardCategories(categories || []);
  return categories;
}

async function loadBoardItems() {
  if (!requireProperty()) return;
  const items = await run("GET property board items", () => api(`/api/v1/properties/${store.selectedProperty.id}/property-board/items`));
  renderBoardItems(items || []);
  return items;
}

async function loadPropertyBoard() {
  if (!requireProperty()) return;
  await Promise.all([
    loadBoardCategories(),
    loadBoardItems(),
  ]);
}

async function loadPublishedNotices() {
  if (!requireProperty()) return;
  const notices = await run("GET published notices", () => api(`/api/v1/properties/${store.selectedProperty.id}/notices/published`));
  renderNotices("#publishedNoticesList", notices || [], "admin");
  return notices;
}

async function loadVisibleAdminNotices() {
  if (!requireProperty()) return;
  const notices = await run("GET visible notices", () => api(`/api/v1/properties/${store.selectedProperty.id}/notices/visible`));
  renderNotices("#visibleAdminNoticesList", notices || [], "admin");
  return notices;
}

async function loadArchivedNotices() {
  if (!requireProperty()) return;
  const notices = await run("GET archived notices", () => api(`/api/v1/properties/${store.selectedProperty.id}/notices/archived`));
  renderNotices("#archivedNoticesList", notices || [], "admin");
  return notices;
}

async function loadRecurringNotices() {
  if (!requireProperty()) return;
  const recurringNotices = await run("GET recurring notices", () => api(`/api/v1/properties/${store.selectedProperty.id}/recurring-notices`));
  renderRecurringNotices(recurringNotices || []);
  return recurringNotices;
}

async function loadNoticeAdmin() {
  if (!requireProperty()) return;
  await Promise.all([
    loadPropertyBoard(),
    loadPublishedNotices(),
    loadVisibleAdminNotices(),
    loadArchivedNotices(),
    loadRecurringNotices(),
  ]);
}

async function loadTenantVisibleNotices() {
  const notices = await run("GET tenant visible notices", () => api("/api/v1/notices/me/visible"));
  renderNotices("#tenantVisibleNoticesList", notices || [], "tenant");
  return notices;
}

async function loadNotifications(listSelector, countSelector, label) {
  const [notifications, unreadCount] = await Promise.all([
    run(`GET ${label} notifications`, () => api("/api/v1/notifications/me")),
    run(`GET ${label} unread count`, () => api("/api/v1/notifications/me/unread-count")),
  ]);

  renderNotifications(listSelector, notifications || []);
  updateUnreadBadge(countSelector, notificationCountValue(unreadCount));
  return notifications;
}

async function loadOwnerNotifications() {
  return loadNotifications("#ownerNotificationsList", "#ownerUnreadCount", "admin");
}

async function loadTenantNotifications() {
  return loadNotifications("#tenantNotificationsList", "#tenantUnreadCount", "tenant");
}

async function markAllNotificationsRead(reloadCallback) {
  await run("PATCH notifications mark all read", () => api("/api/v1/notifications/me/read-all", {
    method: "PATCH",
  }));
  await reloadCallback();
}

async function loadManagedCycles() {
  if (!requireTenancy()) return;
  const cycles = await run("GET managed billing cycles", () => api(`/api/v1/billing/tenancies/${store.selectedTenancy.id}/cycles`));
  store.managedBillingCycles = sortCyclesNewestFirst(cycles);
  renderBillingCycles("#managedBillingCyclesList", store.managedBillingCycles, "admin");
  return store.managedBillingCycles;
}

async function refreshBillingCycle(cycle, mode = "admin") {
  if (!cycle?.id) {
    setOutput("Missing billing cycle", { message: "Select a billing cycle first" });
    return null;
  }

  const path = mode === "tenant"
    ? `/api/v1/billing/me/cycles/${cycle.id}/refresh`
    : `/api/v1/billing/cycles/${cycle.id}/refresh`;

  const refreshedCycle = await run("POST refresh billing cycle", () => api(path, {
    method: "POST",
  }));
  store.selectedBillingCycle = refreshedCycle;
  fillBillingCycleForms(refreshedCycle);
  await loadBillingWorkspace();
  return refreshedCycle;
}

async function refreshSelectedBillingCycleOrWorkspace() {
  if (!store.selectedBillingCycle) {
    await loadBillingWorkspace();
    return;
  }

  const selectedInTenantCycles = store.myBillingCycles
    .some((cycle) => cycle.id === store.selectedBillingCycle.id);
  const mode = selectedInTenantCycles && !isAdminUser() ? "tenant" : "admin";
  await refreshBillingCycle(store.selectedBillingCycle, mode);
}

async function loadMyCycles() {
  try {
    const profile = await run("GET my active tenancy for billing", () => api("/api/v1/tenancies/me/active"));
    const cycles = await run("GET my active billing cycles", () => api(`/api/v1/billing/me/tenancies/${profile.tenancy.id}/cycles`));
    store.myBillingCycles = sortCyclesNewestFirst(cycles);
    renderBillingCycles("#myBillingCyclesList", store.myBillingCycles, "tenant");
    return store.myBillingCycles;
  } catch (error) {
    store.myBillingCycles = [];
    renderBillingCycles("#myBillingCyclesList", [], "tenant");
    setOutput("No active billing cycles", error.payload || { message: error.message });
    return [];
  }
}

async function loadManagedLineItems() {
  if (!requireTenancy()) return;
  const lineItems = await run("GET managed billing line items", () => api(`/api/v1/billing/tenancies/${store.selectedTenancy.id}/line-items`));
  renderBillingLineItems("#managedBillingLineItemsList", lineItems || [], store.managedBillingCycles, "admin");
  return lineItems;
}

async function loadMyLineItems() {
  try {
    const profile = await run("GET my active tenancy for line items", () => api("/api/v1/tenancies/me/active"));
    const lineItems = await run("GET my active billing line items", () => api(`/api/v1/billing/me/tenancies/${profile.tenancy.id}/line-items`));
    renderBillingLineItems("#myBillingLineItemsList", lineItems || [], store.myBillingCycles, "tenant");
    return lineItems;
  } catch (error) {
    renderBillingLineItems("#myBillingLineItemsList", [], store.myBillingCycles, "tenant");
    setOutput("No active billing line items", error.payload || { message: error.message });
    return [];
  }
}

async function loadManagedDeposit() {
  if (!requireTenancy()) return;
  const deposit = await run("GET managed deposit", () => api(`/api/v1/billing/tenancies/${store.selectedTenancy.id}/deposit`));
  renderDeposit("#managedDepositView", deposit);
  return deposit;
}

async function loadMyDeposit() {
  try {
    const profile = await run("GET my active tenancy for deposit", () => api("/api/v1/tenancies/me/active"));
    if (profile.tenancy.billingType !== "MONTHLY") {
      renderDeposit("#myDepositView", null);
      setOutput("No active deposit ledger", { message: "Daily tenancies do not have a deposit ledger in v1" });
      return null;
    }

    const deposit = await run("GET my active deposit", () => api(`/api/v1/billing/me/tenancies/${profile.tenancy.id}/deposit`));
    renderDeposit("#myDepositView", deposit);
    return deposit;
  } catch (error) {
    renderDeposit("#myDepositView", null);
    setOutput("No active deposit ledger", error.payload || { message: error.message });
    return null;
  }
}

async function loadTenantExitRequests() {
  const requests = await run("GET my exit requests", () => api("/api/v1/tenancies/me/exit-requests"));
  renderExitRequests("#exitRequestsList", requests || [], "#exitRequestActionForm");
  return requests;
}

async function loadManagedExitRequests() {
  if (!requireTenancy()) return;
  const requests = await run("GET managed exit requests", () => api(`/api/v1/tenancies/${store.selectedTenancy.id}/exit-requests`));
  renderExitRequests("#adminExitRequestsList", requests || [], "#adminExitRequestActionForm");
  return requests;
}

async function loadPropertyExitRequests() {
  if (!requireProperty()) return;
  const requests = await run("GET property exit requests", () => api(`/api/v1/tenancies/properties/${store.selectedProperty.id}/exit-requests`));
  renderExitRequests("#adminExitRequestsList", requests || [], "#adminExitRequestActionForm");
  return requests;
}

async function loadBillingWorkspace() {
  const jobs = [];
  if (isAdminUser() && store.selectedProperty) {
    await loadBillingTenancies();
  }

  if (isAdminUser() && store.selectedTenancy && isActiveTenancyStatus(store.selectedTenancy.status)) {
    await loadManagedCycles();
    jobs.push(loadManagedDeposit());
    jobs.push(loadManagedLineItems());
  } else if (isAdminUser()) {
    store.managedBillingCycles = [];
    renderBillingCycles("#managedBillingCyclesList", []);
    renderBillingLineItems("#managedBillingLineItemsList", [], []);
    renderDeposit("#managedDepositView", null);
  }
  if (isAdminUser() && store.selectedProperty) {
    jobs.push(loadPropertyExitRequests());
  }
  if (isTenantUser()) {
    await loadMyCycles();
    jobs.push(loadMyDeposit());
    jobs.push(loadMyLineItems());
  }

  await Promise.allSettled(jobs);
}

async function loadModules() {
  if (!requireProperty()) return;
  await Promise.all([
    loadRooms(),
    loadManagers(),
    loadTenancies(),
    loadPastTenancies(),
  ]);
}

function requireProperty() {
  if (!store.selectedProperty) {
    setOutput("Missing property", { message: "Select a property first" });
    return false;
  }
  return true;
}

function requireTenancy() {
  if (!store.selectedTenancy) {
    setOutput("Missing tenancy", { message: "Select a tenancy from the Billing tenancy list first" });
    return false;
  }
  return true;
}

function renderProperties(properties) {
  const list = $("#propertiesList");
  const summary = $("#propertiesSummary");
  list.innerHTML = "";
  summary.innerHTML = "";

  const selectedExists = properties.some((property) => property.id === store.selectedProperty?.id);
  if (store.selectedProperty && !selectedExists) {
    store.selectedProperty = null;
    localStorage.removeItem("khatiyan.selectedProperty");
    renderSession();
  }

  summary.innerHTML = `
    <div class="summary-tile">
      <span class="summary-value">${properties.length}</span>
      <span class="summary-label">active properties</span>
    </div>
    <div class="summary-tile">
      <span class="summary-value">${properties.filter((property) => property.type === "PG").length}</span>
      <span class="summary-label">PG properties</span>
    </div>
    <div class="summary-tile wide">
      <span class="summary-value">${store.selectedProperty ? escapeHtml(store.selectedProperty.name) : "None"}</span>
      <span class="summary-label">selected property</span>
    </div>
  `;

  if (!properties.length) {
    list.innerHTML = `
      <div class="empty-state">
        <strong>No properties yet</strong>
        <span>Create one from the left panel, then refresh this view.</span>
      </div>
    `;
    return;
  }

  properties.forEach((property) => {
    const item = document.createElement("div");
    item.className = `property-card ${store.selectedProperty?.id === property.id ? "selected" : ""}`;
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(property.name)}</span>
        <span class="badge">${property.type}</span>
      </div>
      <div class="item-meta">${escapeHtml(property.address)}</div>
      <div class="item-meta">${escapeHtml(property.city)} ${escapeHtml(property.pincode)}</div>
      <div class="item-meta">daily AC Rs ${paiseToRupees(property.dailyGuestAcRatePaise) || "-"} | daily non-AC Rs ${paiseToRupees(property.dailyGuestNonAcRatePaise) || "-"}</div>
      <div class="item-meta">deposit Rs ${paiseToRupees(property.standardDepositPaise)} | grace ${property.rentGraceDays} days | notice ${property.noticePeriodDays} days</div>
      <div class="item-meta">late fee/day Rs ${paiseToRupees(property.rentLateFeePerDayPaise)} | billing ${property.billingCollectionTiming}</div>
      <div class="item-meta">discovery profile: ${property.discoveryProfileCreated ? "created" : "missing"}</div>
      ${renderFacilityTags(property)}
      <div class="item-meta">id: ${property.id}</div>
      <div class="item-actions">
        <button class="secondary" type="button" data-action="select-property">Select</button>
      </div>
    `;
    item.querySelector("[data-action='select-property']").addEventListener("click", () => {
      selectProperty(property, properties);
    });
    list.appendChild(item);
  });
  syncTenancyRoomRentPreview();
}

function renderFacilityTags(property) {
  const facilities = [
    ...(property.facilities || []).map((facility) => displayEnum(facility)),
    ...(property.customFacilities || []),
  ];

  if (!facilities.length) {
    return `<div class="item-meta">No facilities added</div>`;
  }

  return `
    <div class="tag-row">
      ${facilities.map((facility) => `<span class="badge">${escapeHtml(facility)}</span>`).join("")}
    </div>
  `;
}

function selectProperty(property, properties) {
  store.selectedProperty = property;
  writeJson("khatiyan.selectedProperty", property);
  fillPropertyForm(property);
  renderSession();
  renderProperties(properties);
  loadRooms();
  loadManagers();
  loadTenancies();
  loadAdminConcerns();
  loadNoticeAdmin();
  loadBillingWorkspace();
  loadManagedDiscoveryProfile();
  loadManagedLocalPlaces();
}

function fillPropertyForm(property) {
  const form = $("#updatePropertyForm");
  form.name.value = property.name || "";
  form.address.value = property.address || "";
  form.city.value = property.city || "";
  form.pincode.value = property.pincode || "";
  form.latitude.value = property.latitude ?? "";
  form.longitude.value = property.longitude ?? "";
  form.type.value = property.type || "PG";
  form.customFacilities.value = (property.customFacilities || []).join(", ");
  form.dailyGuestAcRateRupees.value = property.dailyGuestAcRatePaise ? Number(property.dailyGuestAcRatePaise) / 100 : "";
  form.dailyGuestNonAcRateRupees.value = property.dailyGuestNonAcRatePaise ? Number(property.dailyGuestNonAcRatePaise) / 100 : "";
  form.standardDepositRupees.value = property.standardDepositPaise ? Number(property.standardDepositPaise) / 100 : "";
  form.rentLateFeePerDayRupees.value = property.rentLateFeePerDayPaise ? Number(property.rentLateFeePerDayPaise) / 100 : "";
  form.rentGraceDays.value = property.rentGraceDays ?? "";
  form.noticePeriodDays.value = property.noticePeriodDays ?? "";
  setFacilityCheckboxes(form, property.facilities || []);

  const dailyRatesForm = $("#updateDailyGuestRatesForm");
  dailyRatesForm.dailyGuestAcRateRupees.value = property.dailyGuestAcRatePaise ? Number(property.dailyGuestAcRatePaise) / 100 : "";
  dailyRatesForm.dailyGuestNonAcRateRupees.value = property.dailyGuestNonAcRatePaise ? Number(property.dailyGuestNonAcRatePaise) / 100 : "";
}

function fillDiscoveryProfileForm(profile) {
  const form = $("#discoveryProfileForm");
  if (!form || !profile) return;

  form.headline.value = profile.headline || "";
  form.description.value = profile.description || "";
  form.profileImageUrl.value = profile.profileImageUrl || "";
  form.showOwnerContact.checked = profile.showOwnerContact !== false;
  form.showManagerContact.checked = profile.showManagerContact !== false;

  $("#discoveryProfileStatus").textContent = profile.publicVisible
    ? `Listed ${profile.publishedAt || ""}`.trim()
    : "Unlisted";
  $("#discoveryProfileStatus").className = `badge ${profile.publicVisible ? "good" : "warn"}`;
}

function renderDiscoveryProperties(page) {
  const list = $("#discoveryPropertiesList");
  const label = $("#discoveryPageLabel");
  if (!list || !label) return;

  const items = page?.items || [];
  label.textContent = page
    ? `Page ${page.page + 1} of ${page.totalPages || 1} | ${page.totalElements} listings`
    : "No search yet";
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state">
        <strong>No data</strong>
        <span>No listed properties matched this search.</span>
      </div>
    `;
    return;
  }

  items.forEach((property) => {
    const item = document.createElement("div");
    item.className = "property-card";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(property.name)}</span>
        <span class="badge">${escapeHtml(property.type)}</span>
      </div>
      <div class="item-meta">${escapeHtml(property.headline || "No headline")}</div>
      <div class="item-meta">${escapeHtml(property.address)}</div>
      <div class="item-meta">${escapeHtml(property.city)} ${escapeHtml(property.pincode)}</div>
      <div class="item-meta">${property.distanceKm == null ? "Distance unavailable" : `${Number(property.distanceKm).toFixed(2)} km away`}</div>
      <div class="item-meta">deposit ${moneyText(property.standardDepositPaise)} | daily AC ${moneyText(property.dailyGuestAcRatePaise || 0)}</div>
      ${renderFacilityTags(property)}
      <div class="item-actions">
        ${property.directionsUrl ? `<a class="button-link" href="${escapeHtml(property.directionsUrl)}" target="_blank" rel="noreferrer">Directions</a>` : ""}
      </div>
    `;
    list.appendChild(item);
  });
}

function renderLocalPlaces(selector, places, mode = "tenant") {
  const list = $(selector);
  if (!list) return;

  list.innerHTML = "";
  if (!places.length) {
    list.innerHTML = `
      <div class="empty-state">
        <strong>No data</strong>
        <span>No local places are available yet.</span>
      </div>
    `;
    return;
  }

  places.forEach((place) => {
    const tagBadges = (place.tags || [])
      .map((tag) => `<span class="badge">${escapeHtml(displayEnum(tag))}</span>`)
      .join("");
    const item = document.createElement("div");
    item.className = "property-card";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(place.name)}</span>
        ${place.ownerRecommended ? `<span class="badge good">Owner recommended</span>` : ""}
      </div>
      <div class="item-meta">${escapeHtml(place.description || "No description")}</div>
      <div class="item-meta">${escapeHtml(place.addressText || "No address added")}</div>
      <div class="item-meta">${place.phone ? `phone: ${escapeHtml(place.phone)}` : "No phone added"}</div>
      <div class="item-meta">${place.distanceKm == null ? "Distance unavailable" : `${Number(place.distanceKm).toFixed(2)} km away`}</div>
      <div class="tag-row">
        ${tagBadges || `<span class="badge warn">No tags</span>`}
      </div>
      <div class="item-actions">
        ${place.directionsUrl ? `<a class="button-link" href="${escapeHtml(place.directionsUrl)}" target="_blank" rel="noreferrer">Directions</a>` : ""}
        ${mode === "admin" ? `<button class="danger" type="button" data-action="delete-local-place">Delete</button>` : ""}
      </div>
    `;

    const deleteButton = item.querySelector("[data-action='delete-local-place']");
    if (deleteButton) {
      deleteButton.addEventListener("click", async () => {
        await run("DELETE local place", () => api(`/api/v1/properties/${store.selectedProperty.id}/local-places/${place.id}`, {
          method: "DELETE",
        }));
        loadManagedLocalPlaces();
      });
    }

    list.appendChild(item);
  });
}

function setFacilityCheckboxes(form, facilities) {
  const selected = new Set(facilities);
  Array.from(form.querySelectorAll("input[name='facilities']")).forEach((input) => {
    input.checked = selected.has(input.value);
  });
}

function renderFacilityControls() {
  $$("[data-facilities-for]").forEach((container) => {
    container.innerHTML = propertyFacilities
      .map((facility) => `
        <label class="facility-option">
          <input type="checkbox" name="facilities" value="${facility}" />
          <span>${escapeHtml(displayEnum(facility))}</span>
        </label>
      `)
      .join("");
  });
}

function renderLocalPlaceTagControls() {
  $$("[data-local-place-tags]").forEach((container) => {
    if (!store.localPlaceTags.length) {
      container.innerHTML = `
        <div class="empty-state compact-empty">
          <strong>No tags loaded</strong>
          <span>Refresh tags before adding local places.</span>
        </div>
      `;
      return;
    }

    container.innerHTML = store.localPlaceTags
      .map((tag) => `
        <label class="facility-option">
          <input type="checkbox" name="tags" value="${tag}" />
          <span>${displayEnum(tag)}</span>
        </label>
      `)
      .join("");
  });
}

async function loadLocalPlaceTags(showOutput = false) {
  try {
    const tags = await api("/api/v1/discovery/local-place-tags");
    store.localPlaceTags = tags || [];
    renderLocalPlaceTagControls();
    if (showOutput) {
      setOutput("Local place tags refreshed", store.localPlaceTags);
    }
    return store.localPlaceTags;
  } catch (error) {
    renderLocalPlaceTagControls();
    if (showOutput) {
      setOutput("Local place tags failed", { message: error.message });
    }
    return [];
  }
}

function renderRooms(rooms) {
  store.rooms = rooms || [];
  const list = $("#roomsList");
  list.innerHTML = "";
  rooms.forEach((room) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>Room ${escapeHtml(room.roomNumber)}</span>
        <span class="badge">${room.status}</span>
      </div>
      <div class="item-meta">id: ${room.id}</div>
      <div class="item-meta">capacity ${room.capacity}, occupied ${room.occupiedCount}, vacancies ${room.availableVacancies}</div>
      <div class="item-meta">${room.roomType} | ${room.conditioning} | rent Rs ${paiseToRupees(room.baseRentPaise)}</div>
      <div class="item-actions">
        <button class="secondary" data-action="edit-room">Edit Room</button>
        <button class="secondary" data-action="copy-room">Use For Tenancy</button>
        <button class="secondary" data-action="maintenance">Maintenance</button>
        <button class="secondary" data-action="vacant">Vacant</button>
        <button class="danger" data-action="delete-room">Deactivate</button>
      </div>
    `;
    item.querySelector("[data-action='edit-room']").addEventListener("click", () => {
      fillRoomUpdateForm(room);
      setOutput("Room loaded for edit", room);
    });
    item.querySelector("[data-action='copy-room']").addEventListener("click", () => {
      $("#createTenancyForm").roomId.value = room.id;
      syncTenancyRoomRentPreview();
      setOutput("Room selected", room);
    });
    item.querySelector("[data-action='maintenance']").addEventListener("click", async () => {
      await run("PATCH room status", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms/${room.id}/status?status=MAINTENANCE`, { method: "PATCH" }));
      loadRooms();
    });
    item.querySelector("[data-action='vacant']").addEventListener("click", async () => {
      await run("PATCH room status", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms/${room.id}/status?status=VACANT`, { method: "PATCH" }));
      loadRooms();
    });
    item.querySelector("[data-action='delete-room']").addEventListener("click", async () => {
      await run("DELETE room", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms/${room.id}`, { method: "DELETE" }));
      loadRooms();
    });
    list.appendChild(item);
  });
}

function renderBulkRooms() {
  const list = $("#bulkRoomsList");
  list.innerHTML = "";

  if (!store.stagedBulkRooms.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No custom rooms staged</strong>
        <span>Add rooms one by one, then submit them together.</span>
      </div>
    `;
    return;
  }

  store.stagedBulkRooms.forEach((room, index) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(room.roomNumber)}</span>
        <span class="badge">${room.roomType}</span>
      </div>
      <div class="item-meta">floor ${escapeHtml(room.floor || "-")} | capacity ${room.capacity} | ${room.conditioning}</div>
      <div class="item-meta">rent Rs ${paiseToRupees(room.baseRentPaise)}</div>
      <div class="item-actions">
        <button class="danger" type="button" data-action="remove-staged-room">Remove</button>
      </div>
    `;
    item.querySelector("[data-action='remove-staged-room']").addEventListener("click", () => {
      store.stagedBulkRooms.splice(index, 1);
      writeJson("khatiyan.stagedBulkRooms", store.stagedBulkRooms);
      renderBulkRooms();
    });
    list.appendChild(item);
  });
}

function renderManagers(managers) {
  const list = $("#managersList");
  list.innerHTML = "";
  managers.forEach((manager) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(manager.managerFullName || manager.managerUserId)}</span>
        <span class="badge">${manager.active ? "ACTIVE" : "INACTIVE"}</span>
      </div>
      <div class="item-meta">phone: ${escapeHtml(manager.managerPhone || "")}</div>
      <div class="item-meta">user id: ${manager.managerUserId}</div>
      ${manager.managerProfilePhotoUrl ? `<div class="item-meta">photo: ${escapeHtml(manager.managerProfilePhotoUrl)}</div>` : ""}
      <div class="item-meta">assigned by ${manager.assignedByUserId}</div>
      <div class="item-actions">
        <button class="danger" data-action="remove-manager">Remove</button>
      </div>
    `;
    item.querySelector("[data-action='remove-manager']").addEventListener("click", async () => {
      await run("DELETE manager", () => api(`/api/v1/properties/${store.selectedProperty.id}/managers/${manager.managerUserId}`, { method: "DELETE" }));
      loadManagers();
    });
    list.appendChild(item);
  });
}

function renderTenancies(tenancies) {
  const list = $("#tenanciesList");
  list.innerHTML = "";
  if (!tenancies.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No active tenancies</strong>
        <span>Create a tenancy or refresh after selecting a property.</span>
      </div>
    `;
    return;
  }

  tenancies.forEach((tenancy) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${tenancy.id}</span>
        <span class="badge">${tenancy.status}</span>
      </div>
      <div class="item-meta">tenant ${tenancy.userId}</div>
      <div class="item-meta">room ${tenancy.roomId} | ${tenancy.billingType}</div>
      <div class="item-meta">${tenancy.billingType === "DAILY"
        ? `daily Rs ${paiseToRupees(tenancy.dailyRatePaise)} | checkout ${tenancy.plannedEndDate}`
        : `rent Rs ${paiseToRupees(tenancy.rentAmountPaise)} | due by billing policy`}</div>
      <div class="item-actions">
        <button class="secondary" data-action="use-tenancy">Use In Forms</button>
      </div>
    `;
    item.querySelector("[data-action='use-tenancy']").addEventListener("click", () => {
      selectTenancy(tenancy);
      setOutput("Tenancy selected", tenancy);
    });
    list.appendChild(item);
  });
}

function renderPastTenancies(selector, tenancies, mode = "admin") {
  const list = $(selector);
  if (!list) return;
  list.innerHTML = "";

  if (!tenancies.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No past tenancies</strong>
        <span>Ended tenancies will appear here with their billing and deposit history.</span>
      </div>
    `;
    return;
  }

  tenancies.forEach((tenancy) => {
    const item = document.createElement("div");
    item.className = "item tenancy-card";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(displayEnum(tenancy.billingType))} tenancy</span>
        <span class="badge ${statusTone(tenancy.status)}">${tenancy.status}</span>
      </div>
      <div class="item-meta">tenancy ${tenancy.id}</div>
      <div class="item-meta">tenant ${tenancy.userId} | room ${tenancy.roomId}</div>
      <div class="item-meta">start ${tenancy.startDate} | end ${tenancy.endDate || "-"}</div>
      <div class="item-meta">${tenancy.billingType === "DAILY"
        ? `daily ${moneyText(tenancy.dailyRatePaise)} | planned checkout ${tenancy.plannedEndDate || "-"}`
        : `rent ${moneyText(tenancy.rentAmountPaise)} | deposit ${moneyText(tenancy.depositAmountPaise)}`}</div>
      <div class="item-actions">
        <button type="button" class="secondary" data-action="load-history">Load History</button>
      </div>
    `;

    item.querySelector("[data-action='load-history']").addEventListener("click", () => {
      loadPastTenancyHistory(tenancy, mode);
    });

    item.addEventListener("dblclick", () => {
      loadPastTenancyHistory(tenancy, mode);
    });

    list.appendChild(item);
  });
}

function renderBillingTenancies(tenancies) {
  const list = $("#billingTenanciesList");
  if (!list) return;
  list.innerHTML = "";

  if (!tenancies.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No tenancies</strong>
        <span>Create a tenancy first, then select it here for billing actions.</span>
      </div>
    `;
    return;
  }

  tenancies.forEach((tenancy) => {
    const item = document.createElement("div");
    item.className = `item tenancy-card ${store.selectedTenancy?.id === tenancy.id ? "selected" : ""}`;
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(displayEnum(tenancy.billingType))} tenancy</span>
        <span class="badge ${statusTone(tenancy.status)}">${tenancy.status}</span>
      </div>
      <div class="item-meta">tenancy ${tenancy.id}</div>
      <div class="item-meta">tenant ${tenancy.userId}</div>
      <div class="item-meta">room ${tenancy.roomId}</div>
      <div class="item-meta">${tenancy.billingType === "DAILY"
        ? `daily ${moneyText(tenancy.dailyRatePaise)} | checkout ${tenancy.plannedEndDate}`
        : `rent ${moneyText(tenancy.rentAmountPaise)} | deposit ${moneyText(tenancy.depositAmountPaise)}`}</div>
      <div class="item-actions">
        <button type="button" class="${store.selectedTenancy?.id === tenancy.id ? "secondary" : ""}" data-action="use-billing-tenancy">
          ${store.selectedTenancy?.id === tenancy.id ? "Selected" : "Select"}
        </button>
      </div>
    `;

    item.querySelector("[data-action='use-billing-tenancy']").addEventListener("click", () => {
      selectTenancy(tenancy);
      setOutput("Billing tenancy selected", tenancy);
    });

    item.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }

      selectTenancy(tenancy);
      setOutput("Billing tenancy selected", tenancy);
    });

    list.appendChild(item);
  });
}

function selectTenancy(tenancy) {
  store.selectedTenancy = tenancy;
  store.selectedBillingCycle = null;
  writeJson("khatiyan.selectedTenancy", tenancy);
  $("#updateTenancyForm").tenancyId.value = tenancy.id;
  $("#endTenancyForm").tenancyId.value = tenancy.id;
  $("#depositCorrectionForm").tenancyId.value = tenancy.id;
  setBillingTenancyFields(tenancy);
  updateBillingSelectionSummary();
  renderSession();
  loadBillingWorkspace();
}

function setBillingTenancyFields(tenancy) {
  const label = tenancy
    ? `${displayEnum(tenancy.billingType)} | ${displayEnum(tenancy.status)} | ${tenancy.id}`
    : "";

  ["#addBillingExtraChargesForm", "#addBillingDiscountForm"].forEach((selector) => {
    const form = $(selector);
    if (form?.selectedTenancyLabel) {
      form.selectedTenancyLabel.value = label;
    }
  });
}

function lineItemTone(lineItem) {
  if (lineItem.type === "DISCOUNT") return "good";
  if (lineItem.type === "LATE_FEE") return "bad";
  if (lineItem.settlementAction === "ADJUSTED_FROM_DEPOSIT") return "warn";
  if (lineItem.type === "DEPOSIT") return "warn";
  return "";
}

function lineItemContributionText(lineItem) {
  if (lineItem.type === "DISCOUNT") {
    return `reduces payable by ${moneyText(lineItem.amountPaise)}`;
  }

  if (lineItem.settlementAction === "ADJUSTED_FROM_DEPOSIT") {
    return `deducts ${moneyText(lineItem.settlementAmountPaise || lineItem.amountPaise)} from deposit`;
  }

  return `adds ${moneyText(lineItem.amountPaise)} to payable`;
}

function lineItemDepositImpactAmount(lineItem) {
  if (lineItem.settlementAction !== "ADJUSTED_FROM_DEPOSIT") {
    return 0;
  }

  return Number(lineItem.settlementAmountPaise || 0);
}

function renderBillingLineItem(lineItem, mode, cycleEditable) {
  const readOnly = mode === "history";
  const canEdit = mode === "admin" && (cycleEditable || lineItem.status === "PENDING");
  const depositImpactAmount = lineItemDepositImpactAmount(lineItem);
  const statusBadge = lineItem.status ? `<span class="badge">${escapeHtml(displayEnum(lineItem.status))}</span>` : "";
  const actionBadges = `
    <span class="badge ${lineItemTone(lineItem)}">${escapeHtml(displayEnum(lineItem.type))}</span>
    <span class="badge">${escapeHtml(displayEnum(lineItem.settlementAction))}</span>
    ${statusBadge}
  `;

  return `
    <div class="line-row billing-line-row ${lineItemTone(lineItem)}" data-line-id="${lineItem.id}">
      <div class="line-main">
        <div class="line-heading">
          <strong>${escapeHtml(lineItem.label)}</strong>
          <div class="tag-row">${actionBadges}</div>
        </div>
        ${lineItem.description ? `<span>${escapeHtml(lineItem.description)}</span>` : ""}
        <span>${escapeHtml(lineItemContributionText(lineItem))}</span>
        <span>line ${escapeHtml(lineItem.id)}</span>
      </div>
      <div class="line-amount">
        <span>Payable impact</span>
        <strong>${moneyText(lineItem.amountPaise)}</strong>
        ${depositImpactAmount ? `<span>deposit impact ${moneyText(depositImpactAmount)}</span>` : ""}
      </div>
      ${readOnly ? "" : `<div class="item-actions line-actions">
        <button type="button" class="secondary" data-line-action="use">Use</button>
        ${canEdit ? `<button type="button" class="secondary" data-line-action="deposit">From Deposit</button>` : ""}
        ${canEdit ? `<button type="button" class="secondary" data-line-action="bill">To Cycle</button>` : ""}
        ${canEdit ? `<button type="button" class="secondary" data-line-action="clear">Clear</button>` : ""}
      </div>`}
    </div>
  `;
}

function billingCycleGroupKey(lineItem, cycleById) {
  if (lineItem.status === "PENDING" || !lineItem.billingCycleId) {
    return "upcoming";
  }

  const cycle = cycleById.get(lineItem.billingCycleId);
  return cycle ? `cycle-${cycle.cycleNumber}` : `cycle-${lineItem.billingCycleId}`;
}

function billingCycleGroupTitle(key, lineItems, cycleById) {
  if (key === "upcoming") {
    return {
      title: "Upcoming cycle",
      meta: "Pending rows that will be attached to the next generated billing cycle",
    };
  }

  const firstLineItem = lineItems[0];
  const cycle = cycleById.get(firstLineItem.billingCycleId);
  if (!cycle) {
    return {
      title: "Attached cycle",
      meta: `billing cycle ${firstLineItem.billingCycleId}`,
    };
  }

  return {
    title: `Cycle ${cycle.cycleNumber}`,
    meta: `${cycle.periodStartDate} to ${cycle.periodEndDate} | ${cycle.status} | due ${cycle.rentDueDate}`,
  };
}

function renderBillingLineItems(selector, lineItems, cycles = [], mode = "admin") {
  const list = $(selector);
  if (!list) return;

  list.innerHTML = "";
  if (!lineItems.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No line items</strong>
        <span>Charges, discounts, rent, deposits, and late fees for this tenancy will appear here.</span>
      </div>
    `;
    return;
  }

  const cycleById = new Map((cycles || []).map((cycle) => [cycle.id, cycle]));
  const groups = new Map();

  lineItems.forEach((lineItem) => {
    const key = billingCycleGroupKey(lineItem, cycleById);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(lineItem);
  });

  const orderedGroups = Array.from(groups.entries()).sort(([leftKey, leftItems], [rightKey, rightItems]) => {
    if (leftKey === "upcoming") return -1;
    if (rightKey === "upcoming") return 1;

    const leftCycle = cycleById.get(leftItems[0].billingCycleId);
    const rightCycle = cycleById.get(rightItems[0].billingCycleId);
    return Number(rightCycle?.cycleNumber || 0) - Number(leftCycle?.cycleNumber || 0);
  });

  orderedGroups.forEach(([key, groupedLineItems]) => {
    const group = document.createElement("div");
    group.className = "item line-group-card";
    const groupHeading = billingCycleGroupTitle(key, groupedLineItems, cycleById);
    const isUpcoming = key === "upcoming";

    group.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(groupHeading.title)}</span>
        <span class="badge ${isUpcoming ? "warn" : ""}">${isUpcoming ? "PENDING" : `${groupedLineItems.length} line${groupedLineItems.length === 1 ? "" : "s"}`}</span>
      </div>
      <div class="item-meta">${escapeHtml(groupHeading.meta)}</div>
      <div class="line-list">${groupedLineItems.map((lineItem) => {
        const cycle = cycleById.get(lineItem.billingCycleId);
        const cycleEditable = cycle ? cycle.status !== "PAID" && cycle.status !== "CANCELLED" : false;
        return renderBillingLineItem(lineItem, mode, cycleEditable);
      }).join("")}</div>
    `;

    group.querySelectorAll(".line-row").forEach((lineRow) => {
      lineRow.querySelectorAll("[data-line-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const lineItem = groupedLineItems.find((candidate) => candidate.id === lineRow.dataset.lineId);
          if (!lineItem?.billingCycleId) {
            fillBillingLineForm("", lineItem);
            if (button.dataset.lineAction === "use") {
              setOutput("Pending billing line selected", lineItem);
              return;
            }

            const basePath = `/api/v1/billing/tenancies/${lineItem.tenancyId}/line-items/${lineItem.id}`;
            const paths = {
              deposit: `${basePath}/adjust-from-deposit`,
              bill: `${basePath}/adjust-to-bill`,
              clear: `${basePath}/clear`,
            };
            await run(`PATCH pending billing line ${button.dataset.lineAction}`, () => api(paths[button.dataset.lineAction], {
              method: "PATCH",
              body: button.dataset.lineAction === "clear" ? undefined : {},
            }));
            loadBillingWorkspace();
            return;
          }

          fillBillingLineForm(lineItem.billingCycleId, lineItem);
          if (button.dataset.lineAction === "use") {
            setOutput("Billing line selected", lineItem);
            return;
          }

          const basePath = `/api/v1/billing/cycles/${lineItem.billingCycleId}/line-items/${lineItem.id}`;
          const paths = {
            deposit: `${basePath}/adjust-from-deposit`,
            bill: `${basePath}/adjust-to-bill`,
            clear: `${basePath}/clear`,
          };
          await run(`PATCH billing line ${button.dataset.lineAction}`, () => api(paths[button.dataset.lineAction], {
            method: "PATCH",
            body: button.dataset.lineAction === "clear" ? undefined : {},
          }));
          loadBillingWorkspace();
        });
      });
    });

    list.appendChild(group);
  });
}

function renderBillingCycles(selector, cycles, mode = "admin") {
  const list = $(selector);
  list.innerHTML = "";

  if (!cycles.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No billing cycles</strong>
        <span>Create/start a tenancy or refresh after billing events.</span>
      </div>
    `;
    return;
  }

  cycles.forEach((cycle) => {
    const item = document.createElement("div");
    item.className = `item cycle-card ${store.selectedBillingCycle?.id === cycle.id ? "selected" : ""}`;
    const lineItems = cycle.lineItems || [];
    const depositAdjusted = lineItems
      .filter((lineItem) => lineItem.settlementAction === "ADJUSTED_FROM_DEPOSIT")
      .reduce((total, lineItem) => total + Number(lineItem.settlementAmountPaise || 0), 0);
    const depositDue = lineItems
      .filter((lineItem) => lineItem.type === "DEPOSIT")
      .reduce((total, lineItem) => total + Number(lineItem.amountPaise || 0), 0);
    const readOnly = mode === "history";
    const cycleEditable = cycle.status !== "PAID" && cycle.status !== "CANCELLED";
    const tenancySummary = [
      `tenancy ${cycle.tenancyId}`,
      `tenant ${cycle.tenantNameSnapshot || cycle.tenantUserId}`,
      `cycle ${cycle.cycleNumber}`,
    ].join(" | ");

    item.innerHTML = `
      <div class="item-title">
        <span>Billing cycle ${cycle.cycleNumber}</span>
        <span class="badge ${statusTone(cycle.status)}">${cycle.status}</span>
      </div>
      <div class="item-meta">${escapeHtml(tenancySummary)}</div>
      <div class="item-meta">id: ${cycle.id}</div>
      <div class="item-meta">period ${cycle.periodStartDate} to ${cycle.periodEndDate} | due ${cycle.rentDueDate}</div>
      <div class="metric-grid">
        <div class="metric"><span>Rent/base</span><strong>${moneyText(cycle.baseAmountPaise)}</strong></div>
        <div class="metric"><span>Deposit due</span><strong>${moneyText(depositDue)}</strong></div>
        <div class="metric"><span>Extra</span><strong>${moneyText(cycle.extraChargePaise)}</strong></div>
        <div class="metric"><span>Late fee</span><strong>${moneyText(cycle.lateFeeAmountPaise)}</strong></div>
        <div class="metric"><span>Discount</span><strong>${moneyText(cycle.discountAmountPaise)}</strong></div>
        <div class="metric total"><span>Total payable</span><strong>${moneyText(cycle.totalAmountPaise)}</strong></div>
        <div class="metric"><span>From deposit</span><strong>${moneyText(depositAdjusted)}</strong></div>
      </div>
      ${readOnly ? "" : `<div class="item-actions">
        <button class="${store.selectedBillingCycle?.id === cycle.id ? "secondary" : ""}" type="button" data-action="use-cycle">
          ${store.selectedBillingCycle?.id === cycle.id ? "Selected Cycle" : "Use Cycle"}
        </button>
        <button class="secondary" type="button" data-action="prefill-payment">Use Total For Payment</button>
        <button class="secondary" type="button" data-action="refresh-cycle">Recalculate</button>
      </div>`}
    `;

    if (!readOnly) {
      item.querySelector("[data-action='use-cycle']").addEventListener("click", () => {
        fillBillingCycleForms(cycle);
        setOutput("Billing cycle selected", cycle);
      });

      item.querySelector("[data-action='prefill-payment']").addEventListener("click", () => {
        fillBillingCycleForms(cycle);
        setOutput("Payment form filled", {
          billingCycleId: cycle.id,
          paidAmountPaise: cycle.totalAmountPaise,
        });
      });

      item.querySelector("[data-action='refresh-cycle']").addEventListener("click", () => {
        refreshBillingCycle(cycle, mode);
      });
    }

    item.querySelectorAll(".line-row").forEach((lineRow) => {
      lineRow.querySelectorAll("[data-line-action]").forEach((button) => {
        button.addEventListener("click", async () => {
          const lineItem = lineItems.find((candidate) => candidate.id === lineRow.dataset.lineId);
          fillBillingLineForm(cycle.id, lineItem);
          if (button.dataset.lineAction === "use") {
            setOutput("Billing line selected", lineItem);
            return;
          }

          const basePath = `/api/v1/billing/cycles/${cycle.id}/line-items/${lineItem.id}`;
          const paths = {
            deposit: `${basePath}/adjust-from-deposit`,
            bill: `${basePath}/adjust-to-bill`,
            clear: `${basePath}/clear`,
          };
          await run(`PATCH billing line ${button.dataset.lineAction}`, () => api(paths[button.dataset.lineAction], {
            method: "PATCH",
            body: button.dataset.lineAction === "clear" ? undefined : {},
          }));
          loadBillingWorkspace();
        });
      });
      lineRow.addEventListener("dblclick", () => {
        if (readOnly) {
          return;
        }

        const lineItem = lineItems.find((candidate) => candidate.id === lineRow.dataset.lineId);
        fillBillingLineForm(cycle.id, lineItem);
        setOutput("Billing line selected", lineItem);
      });
    });

    item.addEventListener("click", (event) => {
      if (readOnly) {
        return;
      }

      if (event.target.closest("button") || event.target.closest(".line-row")) {
        return;
      }

      fillBillingCycleForms(cycle);
      setOutput("Billing cycle selected", cycle);
    });

    list.appendChild(item);
  });
}

function renderDeposit(selector, deposit) {
  const list = $(selector);
  list.innerHTML = "";

  if (!deposit) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No deposit loaded</strong>
        <span>Select a tenancy and refresh deposit.</span>
      </div>
    `;
    return;
  }

  const item = document.createElement("div");
  item.className = "item deposit-card";
  const movements = deposit.movements || [];
  const additions = movements
    .filter((movement) => movement.type === "ADDITION")
    .reduce((total, movement) => total + Number(movement.amountPaise || 0), 0);
  const deductions = movements
    .filter((movement) => movement.type === "DEDUCTION")
    .reduce((total, movement) => total + Number(movement.amountPaise || 0), 0);
  const settlements = movements
    .filter((movement) => movement.type === "SETTLEMENT")
    .reduce((total, movement) => total + Number(movement.amountPaise || 0), 0);

  item.innerHTML = `
    <div class="item-title">
      <span>Deposit Account</span>
      <span class="badge ${statusTone(deposit.status)}">${deposit.status}</span>
    </div>
    <div class="item-meta">id: ${deposit.id}</div>
    <div class="metric-grid">
      <div class="metric total"><span>Current balance</span><strong>${moneyText(deposit.currentBalancePaise)}</strong></div>
      <div class="metric"><span>Additions</span><strong>${moneyText(additions)}</strong></div>
      <div class="metric"><span>Deductions</span><strong>${moneyText(deductions)}</strong></div>
      <div class="metric"><span>Settled</span><strong>${moneyText(settlements)}</strong></div>
    </div>
    <div class="line-list">${movements.map((movement) => `
      <div class="line-row movement ${movement.type.toLowerCase()}">
        <div>
          <strong>${escapeHtml(displayEnum(movement.type))}</strong>
          <span>${escapeHtml(movement.reason || "-")}</span>
          ${movement.billingCycleLineItemId ? `<span>linked line ${movement.billingCycleLineItemId}</span>` : ""}
        </div>
        <div class="line-amount">
          <strong>${movement.type === "ADDITION" ? "+" : "-"} ${moneyText(movement.amountPaise)}</strong>
          <span>${new Date(movement.createdAt).toLocaleString()}</span>
        </div>
      </div>
    `).join("") || `
      <div class="empty-state small">
        <strong>No deposit movements</strong>
        <span>The opening deposit movement should appear after tenancy creation.</span>
      </div>
    `}</div>
  `;
  list.appendChild(item);
}

function renderExitRequests(selector, requests, formSelector = "#exitRequestActionForm") {
  const list = $(selector);
  if (!list) return;
  list.innerHTML = "";

  if (!requests.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No exit requests</strong>
        <span>Create or refresh exit requests for tenant/admin testing.</span>
      </div>
    `;
    return;
  }

  requests.forEach((request) => {
    const item = document.createElement("div");
    item.className = "item exit-card";
    item.innerHTML = `
      <div class="item-title">
        <span>${displayEnum(request.type)}</span>
        <span class="badge ${statusTone(request.status)}">${request.status}</span>
      </div>
      <div class="item-meta">id: ${request.id}</div>
      <div class="item-meta">tenancy ${request.tenancyId}</div>
      <div class="item-meta">requested ${request.requestedCheckoutDate} | approved ${request.approvedCheckoutDate || "-"}</div>
      <div class="metric-grid compact-metrics">
        <div class="metric"><span>Approved cycle total</span><strong>${moneyText(request.finalBillingAmountPaise)}</strong></div>
        <div class="metric"><span>Deposit deduction</span><strong>${moneyText(request.depositSettlementAmountPaise)}</strong></div>
        <div class="metric"><span>Deposit payable</span><strong>${request.depositPayable === null || request.depositPayable === undefined ? "Not decided" : request.depositPayable ? "Yes" : "No"}</strong></div>
      </div>
      ${request.tenantReason ? `<div class="item-meta">tenant: ${escapeHtml(request.tenantReason)}</div>` : ""}
      ${request.adminNotes ? `<div class="item-meta">admin: ${escapeHtml(request.adminNotes)}</div>` : ""}
      <div class="item-actions">
        <button class="secondary" type="button" data-action="use-exit">Use Request</button>
      </div>
    `;
    item.querySelector("[data-action='use-exit']").addEventListener("click", () => {
      fillExitRequestForm(request, formSelector);
      setOutput("Exit request selected", request);
    });
    list.appendChild(item);
  });
}

function setBillingCycleIdFields(billingCycleId) {
  const extraChargeForm = $("#addBillingExtraChargesForm");
  const discountForm = $("#addBillingDiscountForm");
  if (extraChargeForm?.billingCycleId) {
    extraChargeForm.billingCycleId.value = billingCycleId;
  }
  if (discountForm?.billingCycleId) {
    discountForm.billingCycleId.value = billingCycleId;
  }
  $("#adjustBillingLineForm").billingCycleId.value = billingCycleId;
  $("#recordPaymentSuccessForm").billingCycleId.value = billingCycleId;
  const paymentOrderForm = $("#createPaymentOrderForm");
  if (paymentOrderForm?.billingCycleId) {
    paymentOrderForm.billingCycleId.value = billingCycleId;
  }
}

function fillBillingCycleForms(cycle) {
  store.selectedBillingCycle = cycle;
  setBillingCycleIdFields(cycle.id);
  $("#recordPaymentSuccessForm").paidAmountRupees.value = paiseToRupeesNumber(cycle.totalAmountPaise);
  const paymentOrderForm = $("#createPaymentOrderForm");
  if (paymentOrderForm?.idempotencyKey) {
    paymentOrderForm.idempotencyKey.value = newIdempotencyKey("pay");
  }

  const adminExitForm = $("#adminExitRequestActionForm");
  if (adminExitForm?.finalBillingAmountRupees) {
    adminExitForm.finalBillingAmountRupees.disabled = cycle.status === "PAID";
    adminExitForm.finalBillingAmountRupees.placeholder = cycle.status === "PAID"
      ? "Paid cycle is locked"
      : "Leave blank to keep current total";
    if (cycle.status === "PAID") {
      adminExitForm.finalBillingAmountRupees.value = "";
    }
  }
}

function fillBillingLineForm(billingCycleId, lineItem) {
  if (!lineItem) return;
  $("#adjustBillingLineForm").billingCycleId.value = billingCycleId;
  $("#adjustBillingLineForm").lineItemId.value = lineItem.id;
  $("#adjustBillingLineForm").amountRupees.value = paiseToRupeesNumber(lineItem.settlementAmountPaise || lineItem.amountPaise);
}

function fillExitRequestForm(request, formSelector = "#exitRequestActionForm") {
  const form = $(formSelector);
  if (!form) return;
  form.requestId.value = request.id;
  form.approvedCheckoutDate.value = request.approvedCheckoutDate || request.requestedCheckoutDate || "";
  form.adminNotes.value = request.adminNotes || "";
  if (form.finalBillingAmountRupees) {
    form.finalBillingAmountRupees.value = request.finalBillingAmountPaise ? paiseToRupeesNumber(request.finalBillingAmountPaise) : "";
  }
  if (form.depositPayable) {
    form.depositPayable.checked = Boolean(request.depositPayable);
  }
  updateDepositSettlementInput(form);
  form.depositSettlementAmountRupees.value = request.depositPayable && request.depositSettlementAmountPaise
    ? paiseToRupeesNumber(request.depositSettlementAmountPaise)
    : "";
}

function updateDepositSettlementInput(form) {
  if (!form?.depositPayable || !form?.depositSettlementAmountRupees) {
    return;
  }

  const depositPayable = form.depositPayable.checked;
  form.depositSettlementAmountRupees.disabled = !depositPayable;
  form.depositSettlementAmountRupees.placeholder = depositPayable
    ? "Premature exit deposit settlement"
    : "0 when deposit is not payable";

  if (!depositPayable) {
    form.depositSettlementAmountRupees.value = "";
  }
}

function renderConcerns(selector, concerns, mode = "tenant") {
  const list = $(selector);
  list.innerHTML = "";

  if (!concerns.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No concerns</strong>
        <span>Refresh after creating or updating a concern.</span>
      </div>
    `;
    return;
  }

  concerns.forEach((concern) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(concern.title)}</span>
        <span class="badge">${concern.status}${concern.reopened ? " | REOPENED" : ""}</span>
      </div>
      <div class="item-meta">id: ${concern.id}</div>
      <div class="item-meta">${concern.category} | ${concern.priority} | room ${concern.roomId}</div>
      <div class="item-meta">${escapeHtml(concern.description)}</div>
      ${concern.assignedToUserId ? `<div class="item-meta">assigned to ${concern.assignedToUserId}</div>` : ""}
      ${concern.resolutionNote ? `<div class="item-meta">resolution: ${escapeHtml(concern.resolutionNote)}</div>` : ""}
      ${concern.reopenReason ? `<div class="item-meta">reopen reason: ${escapeHtml(concern.reopenReason)}</div>` : ""}
      ${concern.reopenUntil ? `<div class="item-meta">reopen until ${escapeHtml(concern.reopenUntil)}</div>` : ""}
      <div class="item-meta">photos: ${(concern.photos || []).length}</div>
      <div class="item-actions">
        <button class="secondary" type="button" data-action="use-concern">Use In Forms</button>
        ${mode === "admin" && concern.status === "OPEN" ? `<button class="secondary" type="button" data-action="take-concern">Take</button>` : ""}
        ${mode === "admin" && concern.status === "IN_PROGRESS" ? `<button class="secondary" type="button" data-action="release-concern">Release</button>` : ""}
        ${mode === "admin" && concern.status !== "RESOLVED" && concern.status !== "CLOSED" ? `<button class="secondary" type="button" data-action="fill-resolve">Fill Resolve</button>` : ""}
        ${mode === "tenant" && concern.status === "RESOLVED" ? `<button class="secondary" type="button" data-action="fill-reopen">Fill Reopen</button>` : ""}
      </div>
    `;

    item.querySelector("[data-action='use-concern']").addEventListener("click", () => {
      fillConcernActionForms(concern);
      setOutput("Concern selected", concern);
    });

    const takeButton = item.querySelector("[data-action='take-concern']");
    if (takeButton) {
      takeButton.addEventListener("click", async () => {
        await updateConcernStatus(concern.id, "IN_PROGRESS");
        loadAdminConcerns();
      });
    }

    const releaseButton = item.querySelector("[data-action='release-concern']");
    if (releaseButton) {
      releaseButton.addEventListener("click", async () => {
        await updateConcernStatus(concern.id, "OPEN");
        loadAdminConcerns();
      });
    }

    const resolveButton = item.querySelector("[data-action='fill-resolve']");
    if (resolveButton) {
      resolveButton.addEventListener("click", () => {
        fillConcernActionForms(concern);
        $("#resolveConcernForm").resolutionNote.focus();
      });
    }

    const reopenButton = item.querySelector("[data-action='fill-reopen']");
    if (reopenButton) {
      reopenButton.addEventListener("click", () => {
        fillConcernActionForms(concern);
        $("#reopenConcernForm").reopenReason.focus();
      });
    }

    list.appendChild(item);
  });
}

function renderBoardCategories(categories) {
  const list = $("#boardCategoriesList");
  list.innerHTML = "";

  if (!categories.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No board categories</strong>
        <span>Create a category before adding board items.</span>
      </div>
    `;
    return;
  }

  categories.forEach((category) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(category.name)}</span>
        <span class="badge">${escapeHtml(category.slug)}</span>
      </div>
      <div class="item-meta">id: ${category.id}</div>
      <div class="item-meta">display order ${category.displayOrder}</div>
      <div class="item-actions">
        <button class="secondary" type="button" data-action="use-category">Use For Item</button>
        <button class="danger" type="button" data-action="delete-category">Deactivate</button>
      </div>
    `;
    item.querySelector("[data-action='use-category']").addEventListener("click", () => {
      $("#createBoardItemForm").categoryId.value = category.id;
      setOutput("Board category selected", category);
    });
    item.querySelector("[data-action='delete-category']").addEventListener("click", async () => {
      await run("DELETE board category", () => api(`/api/v1/properties/${store.selectedProperty.id}/property-board/categories/${category.id}`, { method: "DELETE" }));
      loadPropertyBoard();
    });
    list.appendChild(item);
  });
}

function renderBoardItems(items) {
  const list = $("#boardItemsList");
  list.innerHTML = "";

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No board items</strong>
        <span>Add stable rules, timings, contacts, or instructions here.</span>
      </div>
    `;
    return;
  }

  items.forEach((boardItem) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(boardItem.title)}</span>
        <span class="badge">order ${boardItem.displayOrder}</span>
      </div>
      <div class="item-meta">id: ${boardItem.id}</div>
      <div class="item-meta">category: ${boardItem.categoryId}</div>
      <div class="item-meta">${escapeHtml(boardItem.body)}</div>
      <div class="item-actions">
        <button class="secondary" type="button" data-action="copy-category">Use Category</button>
        <button class="danger" type="button" data-action="delete-item">Deactivate</button>
      </div>
    `;
    item.querySelector("[data-action='copy-category']").addEventListener("click", () => {
      $("#createBoardItemForm").categoryId.value = boardItem.categoryId;
      setOutput("Board item selected", boardItem);
    });
    item.querySelector("[data-action='delete-item']").addEventListener("click", async () => {
      await run("DELETE board item", () => api(`/api/v1/properties/${store.selectedProperty.id}/property-board/items/${boardItem.id}`, { method: "DELETE" }));
      loadBoardItems();
    });
    list.appendChild(item);
  });
}

function renderNotices(selector, notices, mode = "admin") {
  const list = $(selector);
  list.innerHTML = "";

  if (!notices.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No notices</strong>
        <span>${mode === "tenant" ? "Visible notices will show here." : "Create or refresh notices for this property."}</span>
      </div>
    `;
    return;
  }

  notices.forEach((notice) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(notice.title)}</span>
        <span class="badge">${notice.priority} | ${notice.status}</span>
      </div>
      <div class="item-meta">id: ${notice.id}</div>
      <div class="item-meta">${escapeHtml(notice.body)}</div>
      <div class="item-meta">visible from ${formatDateTime(notice.visibleFrom)}</div>
      <div class="item-meta">visible until ${notice.visibleUntil ? formatDateTime(notice.visibleUntil) : "no end time"}</div>
      <div class="item-meta">published ${formatDateTime(notice.publishedAt)}</div>
      ${notice.archivedAt ? `<div class="item-meta">archived ${formatDateTime(notice.archivedAt)}</div>` : ""}
      ${mode === "admin" ? `
        <div class="item-actions">
          <button class="secondary" type="button" data-action="use-notice">Use In Update</button>
          ${notice.status === "PUBLISHED" ? `<button class="danger" type="button" data-action="archive-notice">Archive</button>` : ""}
          <button class="danger" type="button" data-action="delete-notice">Delete</button>
        </div>
      ` : ""}
    `;

    const useButton = item.querySelector("[data-action='use-notice']");
    if (useButton) {
      useButton.addEventListener("click", () => {
        fillNoticeForm(notice);
        setOutput("Notice selected", notice);
      });
    }

    const archiveButton = item.querySelector("[data-action='archive-notice']");
    if (archiveButton) {
      archiveButton.addEventListener("click", async () => {
        await archiveNoticeById(notice.id);
        loadNoticeAdmin();
      });
    }

    const deleteButton = item.querySelector("[data-action='delete-notice']");
    if (deleteButton) {
      deleteButton.addEventListener("click", async () => {
        await deleteNoticeById(notice.id);
        loadNoticeAdmin();
      });
    }

    list.appendChild(item);
  });
}

function renderNotifications(selector, notifications) {
  const list = $(selector);
  list.innerHTML = "";

  if (!notifications.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No notifications</strong>
        <span>Notifications generated by module events will show here.</span>
      </div>
    `;
    return;
  }

  notifications.forEach((notification) => {
    const item = document.createElement("div");
    item.className = `item ${notification.readAt ? "" : "unread"}`;
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(notification.title)}</span>
        <span class="badge">${notification.category} | ${notification.priority}</span>
      </div>
      <div class="item-meta">recipient id: ${notification.recipientId}</div>
      <div class="item-meta">source id: ${notification.sourceId || "none"}</div>
      <div class="item-meta">${escapeHtml(notification.body)}</div>
      <div class="item-meta">created ${formatDateTime(notification.createdAt)}</div>
      <div class="item-meta">${notification.readAt ? `read ${formatDateTime(notification.readAt)}` : "unread"}</div>
      <div class="item-actions">
        ${notification.readAt ? "" : `<button class="secondary" type="button" data-action="mark-read">Mark Read</button>`}
        <button class="secondary" type="button" data-action="archive-notification">Archive</button>
      </div>
    `;

    const markReadButton = item.querySelector("[data-action='mark-read']");
    if (markReadButton) {
      markReadButton.addEventListener("click", async () => {
        await run("PATCH notification read", () => api(`/api/v1/notifications/${notification.recipientId}/read`, {
          method: "PATCH",
        }));
        await reloadNotificationsForSelector(selector);
      });
    }

    item.querySelector("[data-action='archive-notification']").addEventListener("click", async () => {
      await run("PATCH notification archive", () => api(`/api/v1/notifications/${notification.recipientId}/archive`, {
        method: "PATCH",
      }));
      await reloadNotificationsForSelector(selector);
    });

    list.appendChild(item);
  });
}

async function reloadNotificationsForSelector(selector) {
  if (selector === "#tenantNotificationsList") {
    await loadTenantNotifications();
    return;
  }

  await loadOwnerNotifications();
}

function updateUnreadBadge(selector, count) {
  const badge = $(selector);
  if (badge) {
    badge.textContent = `Unread ${count}`;
  }
}

function notificationCountValue(value) {
  if (typeof value === "number") return value;
  return value?.unreadCount ?? value?.count ?? 0;
}

function fillNoticeForm(notice) {
  const form = $("#updateNoticeForm");
  form.noticeId.value = notice.id;
  form.title.value = notice.title || "";
  form.body.value = notice.body || "";
  form.priority.value = notice.priority || "NORMAL";
  form.visibleFrom.value = instantToDateTimeLocal(notice.visibleFrom);
  form.visibleUntil.value = instantToDateTimeLocal(notice.visibleUntil);
}

function renderRecurringNotices(recurringNotices) {
  const list = $("#recurringNoticesList");
  list.innerHTML = "";

  if (!recurringNotices.length) {
    list.innerHTML = `
      <div class="empty-state small">
        <strong>No recurring notices</strong>
        <span>Create a recurring template for daily property reminders.</span>
      </div>
    `;
    return;
  }

  recurringNotices.forEach((recurringNotice) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item-title">
        <span>${escapeHtml(recurringNotice.title)}</span>
        <span class="badge">${recurringNotice.priority} | ${recurringNotice.status}</span>
      </div>
      <div class="item-meta">id: ${recurringNotice.id}</div>
      <div class="item-meta">${escapeHtml(recurringNotice.body)}</div>
      <div class="item-meta">${recurringNotice.frequency} from ${recurringNotice.startTime} to ${recurringNotice.endTime}</div>
      <div class="item-meta">active from ${recurringNotice.activeFrom || "today/default"} until ${recurringNotice.activeUntil || "deleted"}</div>
      <div class="item-meta">last generated for ${recurringNotice.lastGeneratedForDate || "not generated yet"}</div>
      <div class="item-meta">last processed for ${recurringNotice.lastProcessedForDate || "not processed yet"}</div>
      <div class="item-actions">
        <button class="secondary" type="button" data-action="use-recurring">Use In Update</button>
        <button class="danger" type="button" data-action="delete-recurring">Delete</button>
      </div>
    `;

    item.querySelector("[data-action='use-recurring']").addEventListener("click", () => {
      fillRecurringNoticeForm(recurringNotice);
      setOutput("Recurring notice selected", recurringNotice);
    });

    item.querySelector("[data-action='delete-recurring']").addEventListener("click", async () => {
      await deleteRecurringNoticeById(recurringNotice.id);
      loadRecurringNotices();
    });

    list.appendChild(item);
  });
}

function fillRecurringNoticeForm(recurringNotice) {
  const form = $("#updateRecurringNoticeForm");
  form.recurringNoticeId.value = recurringNotice.id;
  form.title.value = recurringNotice.title || "";
  form.body.value = recurringNotice.body || "";
  form.priority.value = recurringNotice.priority || "NORMAL";
  form.frequency.value = recurringNotice.frequency || "DAILY";
  form.startTime.value = timeToInputValue(recurringNotice.startTime);
  form.endTime.value = timeToInputValue(recurringNotice.endTime);
  form.activeFrom.value = recurringNotice.activeFrom || "";
  form.activeUntil.value = recurringNotice.activeUntil || "";
}

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function instantToDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function timeToInputValue(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function fillConcernActionForms(concern) {
  $("#assignConcernForm").concernId.value = concern.id;
  $("#updateConcernStatusForm").concernId.value = concern.id;
  $("#resolveConcernForm").concernId.value = concern.id;
  $("#reopenConcernForm").concernId.value = concern.id;
}

function concernPhotosFromForm(data) {
  const photos = [];

  [1, 2].forEach((index) => {
    const photoUrl = data[`photoUrl${index}`]?.trim();
    if (photoUrl) {
      photos.push(cleanBody({
        photoUrl,
        photoPublicId: data[`photoPublicId${index}`]?.trim(),
      }));
    }
  });

  return photos;
}

async function updateConcernStatus(concernId, status) {
  return run("PATCH concern status", () => api(`/api/v1/concerns/${concernId}/status`, {
    method: "PATCH",
    body: { status },
  }));
}

async function archiveNoticeById(noticeId) {
  return run("PATCH notice archive", () => api(`/api/v1/notices/${noticeId}/archive`, {
    method: "PATCH",
  }));
}

async function deleteNoticeById(noticeId) {
  return run("DELETE notice", () => api(`/api/v1/notices/${noticeId}`, {
    method: "DELETE",
  }));
}

async function deleteRecurringNoticeById(recurringNoticeId) {
  return run("DELETE recurring notice", () => api(`/api/v1/recurring-notices/${recurringNoticeId}`, {
    method: "DELETE",
  }));
}

function recurringNoticeBodyFromForm(form) {
  const data = formData(form);

  return cleanBody({
    notice: {
      title: data.title,
      body: data.body,
      priority: data.priority,
    },
    frequency: data.frequency,
    startTime: data.startTime,
    endTime: data.endTime,
    activeFrom: data.activeFrom,
    activeUntil: data.activeUntil,
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncRoomCapacityFromType() {
  const form = $("#createRoomForm");
  const capacity = roomTypeCapacity[form.roomType.value];
  if (capacity) {
    form.capacity.value = capacity;
  }
}

function syncBulkRoomCapacityFromType() {
  const form = $("#createRoomRangeForm");
  const capacity = roomTypeCapacity[form.roomType.value];
  if (capacity) {
    form.capacity.value = capacity;
  }
}

function syncStagedRoomCapacityFromType() {
  const form = $("#stageBulkRoomForm");
  const capacity = roomTypeCapacity[form.roomType.value];
  if (capacity) {
    form.capacity.value = capacity;
  }
}

function syncUpdateRoomCapacityFromType() {
  const form = $("#updateRoomForm");
  const capacity = roomTypeCapacity[form.roomType.value];
  if (capacity) {
    form.capacity.value = capacity;
  }
}

function syncTenancyBillingFields() {
  const form = $("#createTenancyForm");
  const isDaily = form.billingType.value === "DAILY";

  $$("[data-tenancy-monthly]").forEach((element) => element.classList.toggle("hidden", isDaily));
  $$("[data-tenancy-daily]").forEach((element) => element.classList.toggle("hidden", !isDaily));

  form.depositAmountRupees.required = !isDaily;
  form.plannedEndDate.required = isDaily;
  syncTenancyRoomRentPreview();
}

function fillRoomUpdateForm(room) {
  const form = $("#updateRoomForm");
  form.roomId.value = room.id;
  form.roomNumber.value = room.roomNumber || "";
  form.floor.value = room.floor || "";
  form.capacity.value = room.capacity ?? "";
  form.baseRentRupees.value = paiseToRupeesNumber(room.baseRentPaise);
  form.roomType.value = room.roomType || "SINGLE";
  form.conditioning.value = room.conditioning || "NON_AC";
}

function syncTenancyRoomRentPreview() {
  const form = $("#createTenancyForm");
  const room = store.rooms.find((candidate) => candidate.id === form.roomId.value);

  if (!room) {
    form.roomRentPreviewRupees.value = "";
    form.dailyRatePreviewRupees.value = "";
    form.depositAmountRupees.value = store.selectedProperty
      ? paiseToRupeesNumber(store.selectedProperty.standardDepositPaise)
      : "";
    return;
  }

  form.roomRentPreviewRupees.value = paiseToRupeesNumber(room.baseRentPaise);
  form.depositAmountRupees.value = store.selectedProperty
    ? paiseToRupeesNumber(store.selectedProperty.standardDepositPaise)
    : "";

  if (!store.selectedProperty) {
    form.dailyRatePreviewRupees.value = "";
    return;
  }

  const ratePaise = room.conditioning === "AC"
    ? store.selectedProperty.dailyGuestAcRatePaise
    : store.selectedProperty.dailyGuestNonAcRatePaise;

  form.dailyRatePreviewRupees.value = paiseToRupeesNumber(ratePaise);
}

$$(".nav-item").forEach((button) => {
  button.addEventListener("click", () => useView(button.dataset.view));
});

$("#saveBaseUrl").addEventListener("click", () => {
  store.baseUrl = baseUrlInput.value.replace(/\/$/, "");
  localStorage.setItem("khatiyan.baseUrl", store.baseUrl);
  setOutput("Base URL saved", { baseUrl: store.baseUrl });
});

$("#logout").addEventListener("click", clearSession);
$("#loadProfile").addEventListener("click", loadProfile);
$("#clearOutput").addEventListener("click", () => (output.textContent = ""));
$("#toggleRoomsList").addEventListener("click", () => toggleCollapsed("rooms"));
$("#toggleManagersList").addEventListener("click", () => toggleCollapsed("managers"));
$("#toggleOutput").addEventListener("click", () => toggleCollapsed("output"));
$("#toggleOwnerNotifications").addEventListener("click", () => toggleCollapsed("ownerNotifications"));
$("#tenantLoadProfile").addEventListener("click", async () => {
  const user = await loadProfile();
  $("#tenantProfile").textContent = JSON.stringify(user, null, 2);
});
$("#tenantLoadActiveTenancy").addEventListener("click", loadTenantActiveTenancy);

$("#registerUserForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await run("POST /api/v1/auth/user/register", () => api("/api/v1/auth/user/register", { method: "POST", body: data }));
});

$("#registerOwnerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await run("POST /api/v1/auth/owner/register", () => api("/api/v1/auth/owner/register", { method: "POST", body: data }));
});

$("#requestOtpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await run("POST /api/v1/auth/otp/request", () => api("/api/v1/auth/otp/request", { method: "POST", body: formData(event.currentTarget) }));
});

$("#verifyOtpForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await run("POST /api/v1/auth/otp/verify", () => api("/api/v1/auth/otp/verify", { method: "POST", body: formData(event.currentTarget) }));
});

$("#setPinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await run("POST /api/v1/auth/pin/set", () => api("/api/v1/auth/pin/set", { method: "POST", body: formData(event.currentTarget) }));
  setSession(response.accessToken || response.token, response.user);
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await run("POST /api/v1/auth/pin/login", () => api("/api/v1/auth/pin/login", { method: "POST", body: formData(event.currentTarget) }));
  setSession(response.accessToken || response.token, response.user);
});

$("#resetPinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await run("POST /api/v1/auth/pin/reset/confirm", () => api("/api/v1/auth/pin/reset/confirm", { method: "POST", body: formData(event.currentTarget) }));
  setSession(response.accessToken || response.token, response.user);
});

$("#firebaseConfigForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(event.currentTarget);
    const config = JSON.parse(data.config);
    store.firebaseConfig = config;
    writeJson("khatiyan.firebaseConfig", config);
    const initialized = initFirebaseFromStore();

    if (!initialized) {
      setOutput("Firebase config saved", {
        saved: true,
        initialized: false,
        message: "Firebase browser SDK is still loading. Try Send Firebase OTP again in a few seconds.",
      });
      return;
    }

    setOutput("Firebase config saved", initialized);
  } catch (error) {
    setOutput("Firebase config save failed", {
      message: error.message,
      hint: "Paste only the JSON object, not `const firebaseConfig =` or a trailing semicolon.",
    });
  }
});

$("#sendFirebaseOtp").addEventListener("click", async () => {
  const form = $("#firebasePhoneForm");
  const data = formData(form);
  const phone = normalizeFirebasePhone(data.phone);
  await run("Firebase send OTP", () => firebaseClient().sendOtp(phone, "firebaseRecaptcha"));
});

$("#verifyFirebaseOtp").addEventListener("click", async () => {
  const form = $("#firebasePhoneForm");
  const data = formData(form);
  const verification = await run("Firebase verify OTP", () => firebaseClient().verifyOtp(data.otp));
  store.firebaseIdToken = verification.idToken;
  localStorage.setItem("khatiyan.firebaseIdToken", verification.idToken);
});

$("#registerWithFirebase").addEventListener("click", async () => {
  const form = $("#firebasePhoneForm");
  const data = formData(form);
  let idToken = store.firebaseIdToken;

  if (!idToken) {
    const verification = await run("Firebase verify OTP", () => firebaseClient().verifyOtp(data.otp));
    idToken = verification.idToken;
    store.firebaseIdToken = idToken;
    localStorage.setItem("khatiyan.firebaseIdToken", idToken);
  }

  const endpoint = data.accountType === "OWNER"
    ? "/api/v1/auth/firebase/owner/register"
    : "/api/v1/auth/firebase/user/register";

  const response = await run(`POST ${endpoint}`, () => api(endpoint, {
    method: "POST",
    body: {
      idToken,
      fullName: data.fullName,
    },
  }));
  setOutput("Firebase registration complete", {
    ...response,
    next: "Enter PIN and click Set PIN And Login",
  });
});

$("#setFirebasePin").addEventListener("click", async () => {
  const form = $("#firebasePhoneForm");
  const data = formData(form);

  if (!store.firebaseIdToken) {
    setOutput("Missing Firebase proof", { message: "Verify Firebase OTP before setting PIN" });
    return;
  }

  const response = await run("POST /api/v1/auth/firebase/pin/set", () => api("/api/v1/auth/firebase/pin/set", {
    method: "POST",
    body: {
      idToken: store.firebaseIdToken,
      pin: data.pin,
    },
  }));

  setSession(response.accessToken || response.token, response.user);
});

$("#updateProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const user = await run("PATCH /api/v1/auth/me", () => api("/api/v1/auth/me", { method: "PATCH", body: { fullName: data.fullName } }));
  setSession(null, user);
});

$("#refreshProperties").addEventListener("click", loadProperties);
$("#refreshDiscoveryProperties").addEventListener("click", loadDiscoveryProperties);
$("#useCurrentLocationDiscovery").addEventListener("click", async () => {
  const hasLocation = await fillDiscoveryCurrentLocation(true);
  if (hasLocation) {
    setOutput("Discovery location updated", {
      latitude: $("#discoverySearchForm").latitude.value,
      longitude: $("#discoverySearchForm").longitude.value,
    });
  }
});
$("#discoveryLoadLocalPlaces").addEventListener("click", loadTenantLocalPlaces);
$("#refreshLocalPlaceTags").addEventListener("click", () => loadLocalPlaceTags(true));
$("#refreshOwnerNotifications").addEventListener("click", loadOwnerNotifications);
$("#markAllOwnerNotificationsRead").addEventListener("click", () => markAllNotificationsRead(loadOwnerNotifications));
$("#loadDiscoveryProfile").addEventListener("click", loadManagedDiscoveryProfile);
$("#refreshRooms").addEventListener("click", loadRooms);
$("#refreshManagers").addEventListener("click", loadManagers);
$("#refreshTenancies").addEventListener("click", loadTenancies);
$("#refreshPastTenancies").addEventListener("click", loadPastTenancies);
$("#refreshModules").addEventListener("click", loadModules);
$("#refreshTenantConcerns").addEventListener("click", loadTenantConcerns);
$("#refreshAdminConcerns").addEventListener("click", loadAdminConcerns);
$("#refreshPropertyBoard").addEventListener("click", loadPropertyBoard);
$("#refreshNotices").addEventListener("click", loadNoticeAdmin);
$("#refreshBilling").addEventListener("click", refreshSelectedBillingCycleOrWorkspace);
$("#loadManagedCycles").addEventListener("click", loadManagedCycles);
$("#loadManagedDeposit").addEventListener("click", loadManagedDeposit);
$("#loadManagedLineItems").addEventListener("click", loadManagedLineItems);
$("#loadMyCycles").addEventListener("click", loadMyCycles);
$("#loadMyDeposit").addEventListener("click", loadMyDeposit);
$("#loadMyLineItems").addEventListener("click", loadMyLineItems);
$("#tenantLoadPastTenancies").addEventListener("click", loadTenantPastTenancies);
$("#loadTenantExitRequests").addEventListener("click", loadTenantExitRequests);
$("#loadManagedExitRequests").addEventListener("click", loadManagedExitRequests);
$("#loadPropertyExitRequests").addEventListener("click", loadPropertyExitRequests);
$("#loadTenantCurrentConcerns").addEventListener("click", loadTenantCurrentConcerns);
$("#loadTenantConcernHistory").addEventListener("click", loadTenantConcernHistory);
$("#loadAvailableConcerns").addEventListener("click", loadAvailableConcerns);
$("#loadUndertakenConcerns").addEventListener("click", loadUndertakenConcerns);
$("#loadPropertyConcernHistory").addEventListener("click", loadPropertyConcernHistory);
$("#loadBoardCategories").addEventListener("click", loadBoardCategories);
$("#loadBoardItems").addEventListener("click", loadBoardItems);
$("#loadPublishedNotices").addEventListener("click", loadPublishedNotices);
$("#loadVisibleAdminNotices").addEventListener("click", loadVisibleAdminNotices);
$("#loadArchivedNotices").addEventListener("click", loadArchivedNotices);
$("#loadRecurringNotices").addEventListener("click", loadRecurringNotices);
$("#tenantLoadVisibleNotices").addEventListener("click", loadTenantVisibleNotices);
$("#tenantLoadLocalPlaces").addEventListener("click", loadTenantLocalPlaces);
$("#refreshTenantNotifications").addEventListener("click", loadTenantNotifications);
$("#markAllTenantNotificationsRead").addEventListener("click", () => markAllNotificationsRead(loadTenantNotifications));
$("#createRoomForm").roomType.addEventListener("change", syncRoomCapacityFromType);
$("#createRoomRangeForm").roomType.addEventListener("change", syncBulkRoomCapacityFromType);
$("#stageBulkRoomForm").roomType.addEventListener("change", syncStagedRoomCapacityFromType);
$("#updateRoomForm").roomType.addEventListener("change", syncUpdateRoomCapacityFromType);
$("#createTenancyForm").billingType.addEventListener("change", syncTenancyBillingFields);
$("#createTenancyForm").roomId.addEventListener("input", syncTenancyRoomRentPreview);
renderFacilityControls();
renderLocalPlaceTagControls();
loadLocalPlaceTags(false);

$("#loadBillingTenancies")?.addEventListener("click", loadBillingTenancies);
$("#clearBillingTenancy")?.addEventListener("click", () => {
  clearSelectedTenancy("Selection cleared manually.");
  renderBillingTenancies([]);
  loadBillingWorkspace();
});
$("#clearBillingTenancyInline")?.addEventListener("click", () => {
  clearSelectedTenancy("Selection cleared manually.");
  renderBillingTenancies([]);
  loadBillingWorkspace();
});

$("#createPropertyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = propertyBodyFromForm(event.currentTarget);
  await run("POST /api/v1/properties", () => api("/api/v1/properties", { method: "POST", body }));
  event.currentTarget.reset();
  await loadProperties();
  window.setTimeout(() => {
    loadProperties();
  }, 500);
});

$("#updatePropertyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const body = propertyBodyFromForm(event.currentTarget);
  const updated = await run("PATCH property", () => api(`/api/v1/properties/${store.selectedProperty.id}`, { method: "PATCH", body }));
  store.selectedProperty = updated;
  writeJson("khatiyan.selectedProperty", updated);
  renderSession();
  loadProperties();
});

$("#updateDailyGuestRatesForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const body = propertyBodyWithDailyRates(event.currentTarget);
  const updated = await run("PATCH property daily guest rates", () => api(`/api/v1/properties/${store.selectedProperty.id}`, { method: "PATCH", body }));
  store.selectedProperty = updated;
  writeJson("khatiyan.selectedProperty", updated);
  fillPropertyForm(updated);
  renderSession();
  loadProperties();
});

$("#deleteProperty").addEventListener("click", async () => {
  if (!requireProperty()) return;
  await run("DELETE property", () => api(`/api/v1/properties/${store.selectedProperty.id}`, { method: "DELETE" }));
  store.selectedProperty = null;
  localStorage.removeItem("khatiyan.selectedProperty");
  renderSession();
  loadProperties();
});

$("#useCurrentLocationCreate").addEventListener("click", () => {
  openLocationPicker($("#createPropertyForm"));
});

$("#openCreateAddressMap").addEventListener("click", () => {
  openAddressInMaps($("#createPropertyForm"));
});

$("#useCurrentLocationUpdate").addEventListener("click", () => {
  openLocationPicker($("#updatePropertyForm"));
});

$("#openUpdateAddressMap").addEventListener("click", () => {
  openAddressInMaps($("#updatePropertyForm"));
});

$("#pickLocalPlaceLocation").addEventListener("click", () => {
  openLocationPicker($("#createLocalPlaceForm"));
});

$("#openLocalPlaceAddressMap").addEventListener("click", () => {
  openAddressInMaps($("#createLocalPlaceForm"));
});

$("#closeLocationPicker").addEventListener("click", closeLocationPicker);
$("#centerPickerOnCurrentLocation").addEventListener("click", () => centerPickerOnCurrentLocation(true));
$("#usePickedLocation").addEventListener("click", usePickedLocation);

$("#discoverySearchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  store.discoveryPage = 0;
  await loadDiscoveryProperties();
});

$("#discoveryProfileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const profile = await run("PATCH discovery profile", () => api(`/api/v1/properties/${store.selectedProperty.id}/discovery-profile`, {
    method: "PATCH",
    body: cleanBody({
      headline: data.headline,
      description: data.description,
      profileImageUrl: data.profileImageUrl,
      showOwnerContact: Boolean(data.showOwnerContact),
      showManagerContact: Boolean(data.showManagerContact),
    }),
  }));
  fillDiscoveryProfileForm(profile);
});

$("#publishDiscoveryProfile").addEventListener("click", async () => {
  if (!requireProperty()) return;
  const profile = await run("POST discovery profile publish", () => api(`/api/v1/properties/${store.selectedProperty.id}/discovery-profile/publish`, {
    method: "POST",
  }));
  fillDiscoveryProfileForm(profile);
  loadDiscoveryProperties();
});

$("#unpublishDiscoveryProfile").addEventListener("click", async () => {
  if (!requireProperty()) return;
  const profile = await run("POST discovery profile unpublish", () => api(`/api/v1/properties/${store.selectedProperty.id}/discovery-profile/unpublish`, {
    method: "POST",
  }));
  fillDiscoveryProfileForm(profile);
  loadDiscoveryProperties();
});

$("#loadManagedLocalPlaces").addEventListener("click", loadManagedLocalPlaces);

$("#createLocalPlaceForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const body = cleanBody({
    name: data.name,
    tags: checkedValues(event.currentTarget, "tags"),
    description: data.description,
    phone: data.phone,
    addressText: data.addressText,
    latitude: optionalNumber(data.latitude),
    longitude: optionalNumber(data.longitude),
    photoUrl: data.photoUrl,
    ownerRecommended: Boolean(data.ownerRecommended),
  });

  await run("POST local place", () => api(`/api/v1/properties/${store.selectedProperty.id}/local-places`, {
    method: "POST",
    body,
  }));

  event.currentTarget.reset();
  loadManagedLocalPlaces();
});

$("#createRoomForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const body = {
    roomNumber: data.roomNumber,
    floor: data.floor,
    capacity: Number(data.capacity),
    roomType: data.roomType,
    conditioning: data.conditioning,
    baseRentPaise: rupeesToPaise(data.baseRentRupees),
  };
  await run("POST room", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms`, { method: "POST", body }));
  event.currentTarget.reset();
  syncRoomCapacityFromType();
  loadRooms();
});

$("#updateRoomForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const body = {
    roomNumber: data.roomNumber,
    floor: data.floor,
    capacity: Number(data.capacity),
    roomType: data.roomType,
    conditioning: data.conditioning,
    baseRentPaise: rupeesToPaise(data.baseRentRupees),
  };

  await run("PATCH room", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms/${data.roomId}`, {
    method: "PATCH",
    body,
  }));

  loadRooms();
});

$("#createRoomRangeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const range = cleanBody({
    prefix: data.prefix,
    startNumber: Number(data.startNumber),
    endNumber: Number(data.endNumber),
    floor: data.floor,
    capacity: Number(data.capacity),
    roomType: data.roomType,
    conditioning: data.conditioning,
    baseRentPaise: rupeesToPaise(data.baseRentRupees),
  });
  await run("POST room bulk range", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms/bulk`, {
    method: "POST",
    body: {
      ranges: [range],
    },
  }));
  event.currentTarget.reset();
  syncBulkRoomCapacityFromType();
  loadRooms();
});

$("#stageBulkRoomForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const room = cleanBody({
    roomNumber: data.roomNumber,
    floor: data.floor,
    capacity: Number(data.capacity),
    roomType: data.roomType,
    conditioning: data.conditioning,
    baseRentPaise: rupeesToPaise(data.baseRentRupees),
  });
  store.stagedBulkRooms.push(room);
  writeJson("khatiyan.stagedBulkRooms", store.stagedBulkRooms);
  event.currentTarget.reset();
  syncStagedRoomCapacityFromType();
  renderBulkRooms();
});

$("#submitBulkRooms").addEventListener("click", async () => {
  if (!requireProperty()) return;
  if (!store.stagedBulkRooms.length) {
    setOutput("No custom rooms", { message: "Add at least one room to the bulk list first" });
    return;
  }

  await run("POST custom bulk rooms", () => api(`/api/v1/properties/${store.selectedProperty.id}/rooms/bulk`, {
    method: "POST",
    body: {
      rooms: store.stagedBulkRooms,
    },
  }));

  store.stagedBulkRooms = [];
  localStorage.removeItem("khatiyan.stagedBulkRooms");
  renderBulkRooms();
  loadRooms();
});

$("#clearBulkRooms").addEventListener("click", () => {
  store.stagedBulkRooms = [];
  localStorage.removeItem("khatiyan.stagedBulkRooms");
  renderBulkRooms();
});

$("#addManagerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  await run("POST manager", () => api(`/api/v1/properties/${store.selectedProperty.id}/managers`, { method: "POST", body: formData(event.currentTarget) }));
  event.currentTarget.reset();
  loadManagers();
});

$("#createTenancyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const isDaily = data.billingType === "DAILY";
  const body = cleanBody({
    tenantPhone: data.tenantPhone,
    propertyId: store.selectedProperty.id,
    roomId: data.roomId,
    billingType: data.billingType,
    startDate: data.startDate,
    plannedEndDate: isDaily ? data.plannedEndDate : undefined,
  });
  await run("POST tenancy", () => api("/api/v1/tenancies", { method: "POST", body }));
  loadTenancies();
  loadRooms();
});

$("#updateTenancyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const body = cleanBody({
    rentAmountPaise: rupeesToPaise(data.rentAmountRupees),
  });
  await run("PATCH tenancy", () => api(`/api/v1/tenancies/${data.tenancyId}`, { method: "PATCH", body }));
  loadTenancies();
});

$("#endTenancyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setOutput("Tenancy end blocked", {
    message: "Use Billing > Exit Requests. Direct tenancy end is blocked so billing checks cannot be bypassed.",
  });
});

$("#raiseConcernForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const photos = concernPhotosFromForm(data);
  const body = {
    category: data.category,
    priority: data.priority,
    title: data.title,
    description: data.description,
    ...(photos.length ? { photos } : {}),
  };

  await run("POST concern", () => api("/api/v1/concerns", { method: "POST", body }));
  event.currentTarget.reset();
  loadTenantConcerns();
});

$("#assignConcernForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await run("PATCH concern assign", () => api(`/api/v1/concerns/${data.concernId}/assign`, {
    method: "PATCH",
    body: { assignedToUserId: data.assignedToUserId },
  }));
  loadAdminConcerns();
});

$("#updateConcernStatusForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await updateConcernStatus(data.concernId, data.status);
  loadAdminConcerns();
});

$("#resolveConcernForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await run("PATCH concern resolve", () => api(`/api/v1/concerns/${data.concernId}/resolve`, {
    method: "PATCH",
    body: { resolutionNote: data.resolutionNote },
  }));
  loadAdminConcerns();
});

$("#reopenConcernForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await run("POST concern reopen", () => api(`/api/v1/concerns/${data.concernId}/reopen`, {
    method: "POST",
    body: { reopenReason: data.reopenReason },
  }));
  loadTenantConcerns();
});

$("#addBillingExtraChargesForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireTenancy()) return;
  const data = formData(event.currentTarget);
  const body = [{
    label: data.label,
    description: data.description,
    amountPaise: rupeesToPaise(data.amountRupees),
    adjustFromDeposit: Boolean(data.adjustFromDeposit),
  }];

  await run("POST billing tenancy extra charge", () => api(`/api/v1/billing/tenancies/${store.selectedTenancy.id}/extra-charges`, {
    method: "POST",
    body,
  }));

  loadBillingWorkspace();
});

$("#addBillingDiscountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireTenancy()) return;
  const data = formData(event.currentTarget);
  const body = {
    label: data.label,
    description: data.description,
    amountPaise: rupeesToPaise(data.amountRupees),
  };

  await run("POST billing tenancy discount", () => api(`/api/v1/billing/tenancies/${store.selectedTenancy.id}/discounts`, {
    method: "POST",
    body,
  }));

  loadBillingWorkspace();
});

$("#adjustBillingLineForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const action = submitter?.value || "adjust";
  const data = formData(event.currentTarget);
  const body = cleanBody({
    amountPaise: rupeesToPaise(data.amountRupees),
  });
  const hasCycleId = Boolean(data.billingCycleId);
  if (!hasCycleId && !store.selectedTenancy) {
    setOutput("Missing tenancy", { message: "Select a tenancy before editing a pending billing line" });
    return;
  }

  const basePath = hasCycleId
    ? `/api/v1/billing/cycles/${data.billingCycleId}/line-items/${data.lineItemId}`
    : `/api/v1/billing/tenancies/${store.selectedTenancy.id}/line-items/${data.lineItemId}`;
  const actionPath = {
    adjust: basePath,
    clear: `${basePath}/clear`,
    deposit: `${basePath}/adjust-from-deposit`,
    bill: `${basePath}/adjust-to-bill`,
  }[action];

  await run(`PATCH billing line ${action}`, () => api(actionPath, {
    method: "PATCH",
    body: action === "clear" ? undefined : body,
  }));

  loadBillingWorkspace();
});

$("#recordPaymentSuccessForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const path = isTenantUser() && !isAdminUser()
    ? `/api/v1/billing/me/cycles/${data.billingCycleId}/payment-success`
    : `/api/v1/billing/cycles/${data.billingCycleId}/payment-success`;

  await run("POST record payment success", () => api(path, {
    method: "POST",
    body: {
      paidAmountPaise: rupeesToPaise(data.paidAmountRupees),
    },
  }));

  loadBillingWorkspace();
});

$("#generatePaymentIdempotencyKey").addEventListener("click", () => {
  $("#createPaymentOrderForm").idempotencyKey.value = newIdempotencyKey("pay");
});

$("#createPaymentOrderForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const idempotencyKey = String(data.idempotencyKey || "").trim();

  if (!idempotencyKey) {
    setOutput("Missing idempotency key", {
      message: "Generate or enter an idempotency key before creating a provider order.",
    });
    return;
  }

  const order = await run("POST Razorpay payment order", () => api(`/api/v1/payments/billing-cycles/${data.billingCycleId}/orders`, {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: {
      provider: data.provider,
    },
  }));

  if (!window.Razorpay) {
    setOutput("Razorpay checkout unavailable", {
      message: "Razorpay checkout script is not loaded.",
      order,
    });
    return;
  }

  const razorpayKeyId = String(data.razorpayKeyId || "").trim();
  if (!razorpayKeyId) {
    setOutput("Missing Razorpay key ID", {
      message: "Enter the Razorpay test key id before opening checkout.",
      order,
    });
    return;
  }

  const checkout = new window.Razorpay({
    key: razorpayKeyId,
    amount: order.amountPaise,
    currency: order.currency,
    name: "Khatiyan",
    description: `Billing cycle ${order.billingCycleId}`,
    order_id: order.providerOrderId,
    handler: async (response) => {
      await run("POST verify Razorpay payment", () => api("/api/v1/payments/orders/verify", {
        method: "POST",
        body: {
          providerOrderId: response.razorpay_order_id,
          providerPaymentId: response.razorpay_payment_id,
          signature: response.razorpay_signature,
        },
      }));

      $("#createPaymentOrderForm").idempotencyKey.value = newIdempotencyKey("pay");
      await loadBillingWorkspace();
    },
    modal: {
      ondismiss: () => {
        setOutput("Razorpay checkout closed", order);
      },
    },
  });

  checkout.on("payment.failed", async (response) => {
    const error = response?.error || {};
    const metadata = error.metadata || {};

    await run("POST Razorpay client failure", () => api(`/api/v1/payments/orders/${order.id}/client-failure`, {
      method: "POST",
      body: {
        providerOrderId: metadata.order_id || order.providerOrderId,
        providerPaymentId: metadata.payment_id || null,
        errorCode: error.code || "CLIENT_PAYMENT_FAILED",
        errorDescription: error.description || "Razorpay checkout reported payment failure",
        errorSource: error.source || null,
        errorStep: error.step || null,
        errorReason: error.reason || null,
      },
    }));

    $("#createPaymentOrderForm").idempotencyKey.value = newIdempotencyKey("pay");
    await loadBillingWorkspace();
  });

  checkout.open();
});

$("#depositCorrectionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitter = event.submitter;
  const action = submitter?.value || "add";
  const data = formData(event.currentTarget);
  const tenancyId = data.tenancyId || store.selectedTenancy?.id;
  const body = {
    reason: data.reason,
    amountPaise: rupeesToPaise(data.amountRupees),
  };

  if (action === "settle") {
    await run("POST settle deposit", () => api(`/api/v1/billing/tenancies/${tenancyId}/deposit/settle`, {
      method: "POST",
      body: { reason: data.reason },
    }));
  } else {
    await run(`POST deposit ${action} correction`, () => api(`/api/v1/billing/tenancies/${tenancyId}/deposit/corrections/${action}`, {
      method: "POST",
      body,
    }));
  }

  loadBillingWorkspace();
});

$("#requestNormalExitForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await run("POST normal exit request", () => api("/api/v1/tenancies/me/exit-requests/normal", {
    method: "POST",
    body: cleanBody({ reason: data.reason }),
  }));
  loadTenantExitRequests();
});

$("#requestPrematureExitForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  await run("POST premature exit request", () => api("/api/v1/tenancies/me/exit-requests/premature", {
    method: "POST",
    body: cleanBody({
      requestedCheckoutDate: data.requestedCheckoutDate,
      reason: data.reason,
    }),
  }));
  loadTenantExitRequests();
});

async function submitExitRequestAction(form, submitter) {
  const action = submitter?.value || "approve";
  const data = formData(form);
  const requestId = data.requestId;
  const selectedCycle = store.selectedBillingCycle;
  const depositPayable = Boolean(data.depositPayable);
  const approvedTotalAmountPaise = selectedCycle?.status === "PAID"
    ? undefined
    : rupeesToPaise(data.finalBillingAmountRupees);
  const paths = {
    approve: `/api/v1/tenancies/exit-requests/${requestId}/approve`,
    reject: `/api/v1/tenancies/exit-requests/${requestId}/reject`,
    cancel: `/api/v1/tenancies/exit-requests/${requestId}/cancel`,
    execute: `/api/v1/tenancies/exit-requests/${requestId}/execute`,
  };
  const body = action === "approve"
    ? cleanBody({
      approvedCheckoutDate: data.approvedCheckoutDate,
      finalBillingAmountPaise: approvedTotalAmountPaise,
      depositPayable,
      depositSettlementAmountPaise: depositPayable ? rupeesToPaise(data.depositSettlementAmountRupees) || 0 : 0,
      adminNotes: data.adminNotes,
    })
    : cleanBody({ adminNotes: data.adminNotes });

  await run(`POST exit request ${action}`, () => api(paths[action], {
    method: "POST",
    body: action === "cancel" || action === "execute" ? undefined : body,
  }));

  loadBillingWorkspace();
  loadTenancies();
  loadRooms();
}

$("#exitRequestActionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitExitRequestAction(event.currentTarget, event.submitter);
});

$("#adminExitRequestActionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  await submitExitRequestAction(event.currentTarget, event.submitter);
});

$("#adminExitRequestActionForm").depositPayable.addEventListener("change", (event) => {
  updateDepositSettlementInput(event.currentTarget.form);
});
updateDepositSettlementInput($("#adminExitRequestActionForm"));

$("#createBoardCategoryForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const body = cleanBody({
    name: data.name,
    slug: data.slug,
    displayOrder: optionalNumber(data.displayOrder),
  });

  await run("POST board category", () => api(`/api/v1/properties/${store.selectedProperty.id}/property-board/categories`, {
    method: "POST",
    body,
  }));

  event.currentTarget.reset();
  loadBoardCategories();
});

$("#createBoardItemForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const body = cleanBody({
    categoryId: data.categoryId,
    title: data.title,
    body: data.body,
    displayOrder: optionalNumber(data.displayOrder),
  });

  await run("POST board item", () => api(`/api/v1/properties/${store.selectedProperty.id}/property-board/items`, {
    method: "POST",
    body,
  }));

  event.currentTarget.reset();
  loadBoardItems();
});

$("#publishNoticeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const data = formData(event.currentTarget);
  const body = cleanBody({
    title: data.title,
    body: data.body,
    priority: data.priority,
    visibleFrom: dateTimeLocalToInstant(data.visibleFrom),
    visibleUntil: dateTimeLocalToInstant(data.visibleUntil),
  });

  await run("POST notice", () => api(`/api/v1/properties/${store.selectedProperty.id}/notices`, {
    method: "POST",
    body,
  }));

  event.currentTarget.reset();
  loadNoticeAdmin();
});

$("#updateNoticeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const body = cleanBody({
    title: data.title,
    body: data.body,
    priority: data.priority,
    visibleFrom: dateTimeLocalToInstant(data.visibleFrom),
    visibleUntil: dateTimeLocalToInstant(data.visibleUntil),
  });

  await run("PATCH notice", () => api(`/api/v1/notices/${data.noticeId}`, {
    method: "PATCH",
    body,
  }));

  loadNoticeAdmin();
});

$("#archiveNotice").addEventListener("click", async () => {
  const noticeId = $("#updateNoticeForm").noticeId.value;
  if (!noticeId) {
    setOutput("Missing notice", { message: "Select or enter a notice id first" });
    return;
  }

  await archiveNoticeById(noticeId);
  loadNoticeAdmin();
});

$("#deleteNotice").addEventListener("click", async () => {
  const noticeId = $("#updateNoticeForm").noticeId.value;
  if (!noticeId) {
    setOutput("Missing notice", { message: "Select or enter a notice id first" });
    return;
  }

  await deleteNoticeById(noticeId);
  loadNoticeAdmin();
});

$("#createRecurringNoticeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireProperty()) return;
  const body = recurringNoticeBodyFromForm(event.currentTarget);

  await run("POST recurring notice", () => api(`/api/v1/properties/${store.selectedProperty.id}/recurring-notices`, {
    method: "POST",
    body,
  }));

  event.currentTarget.reset();
  loadNoticeAdmin();
});

$("#updateRecurringNoticeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  const body = recurringNoticeBodyFromForm(event.currentTarget);

  await run("PATCH recurring notice", () => api(`/api/v1/recurring-notices/${data.recurringNoticeId}`, {
    method: "PATCH",
    body,
  }));

  loadNoticeAdmin();
});

$("#deleteRecurringNotice").addEventListener("click", async () => {
  const recurringNoticeId = $("#updateRecurringNoticeForm").recurringNoticeId.value;
  if (!recurringNoticeId) {
    setOutput("Missing recurring notice", { message: "Select or enter a recurring notice id first" });
    return;
  }

  await deleteRecurringNoticeById(recurringNoticeId);
  loadNoticeAdmin();
});

$("#rawRequestForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = formData(event.currentTarget);
  let body;
  if (data.body.trim()) {
    body = JSON.parse(data.body);
  }
  await run(`${data.method} ${data.path}`, () => api(data.path, { method: data.method, body }));
});

if (store.token && isJwtExpired(store.token)) {
  clearSession();
} else {
  renderSession();
}
initFirebaseFromStore();
window.addEventListener("load", initFirebaseFromStore);
window.addEventListener("khatiyan:firebase-ready", () => {
  const initialized = initFirebaseFromStore();
  if (initialized) {
    setOutput("Firebase SDK ready", initialized);
  }
});
if (store.selectedProperty) fillPropertyForm(store.selectedProperty);
syncRoomCapacityFromType();
syncBulkRoomCapacityFromType();
syncStagedRoomCapacityFromType();
syncTenancyBillingFields();
renderBulkRooms();
applyCollapsedState("rooms");
applyCollapsedState("managers");
applyCollapsedState("output");
applyCollapsedState("ownerNotifications");
