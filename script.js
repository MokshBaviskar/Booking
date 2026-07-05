/**
 * Appointment Booking — client logic
 * --------------------------------------------------------------------------
 * 1. CONFIG           — everything you're likely to tweak lives here.
 * 2. DATE / TIME UTILS — building the list of bookable slots.
 * 3. VALIDATION        — required fields + phone format + past-date/time guard.
 * 4. SUBMIT HANDLER    — talks to the Google Apps Script Web App via fetch().
 * --------------------------------------------------------------------------
 */

/* ============================== 1. CONFIG ============================== */
const CONFIG = {
  GAS_WEB_APP_URL  : "https://script.google.com/macros/s/AKfycbyPn4-iyxhVjyn8EJ5hRmXixPSf6AF2LfetlC_tZDw4FfEd_KYjc0VAXunt2ZlKOt1Zew/exec",
  WORKING_HOURS_START: 9,
  WORKING_HOURS_END: 18,

  // Slot length in minutes. Change to 15, 45, 60, etc. as needed.
  SLOT_DURATION_MINUTES: 30,

  // If booking for "today", require slots to start at least this many
  // minutes from now (gives a little lead time instead of a slot starting
  // the instant the clock ticks over).
  MIN_LEAD_TIME_MINUTES: 15,
};

/* ============================ 2. DATE / TIME UTILS ======================= */

/** Returns YYYY-MM-DD for a Date, in local time (not UTC). */
function toDateInputValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Formats minutes-since-midnight as "9:00 AM" / "1:30 PM". */
function formatMinutesAsClock(totalMinutes) {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, "0")} ${period}`;
}

/**
 * Builds the list of bookable slot start-times (in minutes-since-midnight)
 * for a single day, given CONFIG's working hours + slot duration.
 * The last slot starts early enough to still finish by closing time.
 */
function buildDailySlots() {
  const startMin = CONFIG.WORKING_HOURS_START * 60;
  const endMin = CONFIG.WORKING_HOURS_END * 60;
  const slots = [];
  for (let t = startMin; t + CONFIG.SLOT_DURATION_MINUTES <= endMin; t += CONFIG.SLOT_DURATION_MINUTES) {
    slots.push(t);
  }
  return slots;
}

/**
 * Repopulates the #appointmentTime <select> based on the chosen date.
 * If the date is today, slots earlier than (now + lead time) are dropped.
 */
function refreshTimeSlots() {
  const dateInput = document.getElementById("appointmentDate");
  const timeSelect = document.getElementById("appointmentTime");
  const selectedValue = dateInput.value;

  timeSelect.innerHTML = "";

  if (!selectedValue) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Select date first";
    opt.disabled = true;
    opt.selected = true;
    timeSelect.appendChild(opt);
    return;
  }

  const now = new Date();
  const todayStr = toDateInputValue(now);
  const isToday = selectedValue === todayStr;
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + CONFIG.MIN_LEAD_TIME_MINUTES;

  const allSlots = buildDailySlots();
  const availableSlots = isToday
    ? allSlots.filter((minutes) => minutes > nowMinutes)
    : allSlots;

  if (availableSlots.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No slots left today";
    opt.disabled = true;
    opt.selected = true;
    timeSelect.appendChild(opt);
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a time";
  placeholder.disabled = true;
  placeholder.selected = true;
  timeSelect.appendChild(placeholder);

  availableSlots.forEach((minutes) => {
    const opt = document.createElement("option");
    opt.value = formatMinutesAsClock(minutes);
    opt.textContent = formatMinutesAsClock(minutes);
    timeSelect.appendChild(opt);
  });
}

/* ============================== 3. VALIDATION ============================ */

// Accepts formats like "+1 555-123-4567", "(555) 123 4567", "5551234567".
// Requires 7–15 digits overall (digits only, ignoring separators).
const PHONE_REGEX = /^[+]?[\d\s\-().]{7,20}$/;

function digitCount(str) {
  return (str.match(/\d/g) || []).length;
}

function setFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  const errorEl = document.querySelector(`[data-error-for="${fieldId}"]`);
  if (message) {
    field.classList.add("invalid");
    if (errorEl) errorEl.textContent = message;
  } else {
    field.classList.remove("invalid");
    if (errorEl) errorEl.textContent = "";
  }
}

/** Validates the whole form. Returns { valid: boolean, data: {...} }. */
function validateForm() {
  let valid = true;

  const fullName = document.getElementById("fullName").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const address = document.getElementById("address").value.trim();
  const gender = document.getElementById("gender").value;
  const workerLevel = document.getElementById("workerLevel").value;
  const appointmentDate = document.getElementById("appointmentDate").value;
  const appointmentTime = document.getElementById("appointmentTime").value;

  // Full name
  if (!fullName) {
    setFieldError("fullName", "Please enter your full name.");
    valid = false;
  } else {
    setFieldError("fullName", "");
  }

  // Phone
  if (!phone) {
    setFieldError("phone", "Please enter a phone number.");
    valid = false;
  } else if (!PHONE_REGEX.test(phone) || digitCount(phone) < 7) {
    setFieldError("phone", "Enter a valid phone number (7+ digits).");
    valid = false;
  } else {
    setFieldError("phone", "");
  }

  // Address
  if (!address) {
    setFieldError("address", "Please enter an address.");
    valid = false;
  } else {
    setFieldError("address", "");
  }

  // Date
  const todayStr = toDateInputValue(new Date());
  if (!appointmentDate) {
    setFieldError("appointmentDate", "Please choose a date.");
    valid = false;
  } else if (appointmentDate < todayStr) {
    setFieldError("appointmentDate", "That date has already passed.");
    valid = false;
  } else {
    setFieldError("appointmentDate", "");
  }

  // Time
  if (!appointmentTime) {
    setFieldError("appointmentTime", "Please choose a time slot.");
    valid = false;
  } else {
    setFieldError("appointmentTime", "");
  }

  return {
    valid,
    data: { fullName, phone, address, gender, workerLevel, appointmentDate, appointmentTime },
  };
}

/* ============================== 4. SUBMIT HANDLER ========================= */

async function submitBooking(payload) {
  // Google Apps Script Web Apps don't send CORS headers for arbitrary
  // request types, but a POST with a "text/plain" Content-Type avoids the
  // CORS preflight altogether and works reliably in practice. Code.gs reads
  // the raw body and parses it as JSON (see Code.gs → doPost).
  const response = await fetch(CONFIG.GAS_WEB_APP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Server responded with status ${response.status}`);
  }

  return response.json();
}

function initBookingForm() {
  const form = document.getElementById("bookingForm");
  const dateInput = document.getElementById("appointmentDate");
  const submitBtn = document.getElementById("submitBtn");
  const bookingCard = document.getElementById("bookingCard");
  const successState = document.getElementById("successState");
  const successDetails = document.getElementById("successDetails");
  const bookAnotherBtn = document.getElementById("bookAnotherBtn");

  // Restrict the date picker itself to today-or-later.
  const todayStr = toDateInputValue(new Date());
  dateInput.setAttribute("min", todayStr);

  dateInput.addEventListener("change", refreshTimeSlots);
  dateInput.addEventListener("input", refreshTimeSlots);

  // Clear an individual field's error as soon as the user starts fixing it.
  ["fullName", "phone", "address", "appointmentDate", "appointmentTime"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => setFieldError(id, ""));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const { valid, data } = validateForm();
    if (!valid) {
      // Focus the first invalid field for accessibility / speed.
      const firstInvalid = form.querySelector(".invalid");
      if (firstInvalid) firstInvalid.focus();
      return;
    }

    // Submission timestamp is generated here — the user never enters it.
    const payload = {
      ...data,
      submissionTimestamp: new Date().toISOString(),
    };

    // Lock the button so a slow connection can't produce duplicate rows.
    submitBtn.disabled = true;
    submitBtn.classList.add("is-loading");

    try {
      await submitBooking(payload);

      successDetails.textContent =
        `Booked for ${payload.appointmentDate} at ${payload.appointmentTime}. ` +
        `A copy of this booking was saved to our records.`;

      form.hidden = true;
      successState.hidden = false;
    } catch (err) {
      console.error("Booking submission failed:", err);
      alert(
        "Sorry, we couldn't save your appointment. Please check your connection and try again."
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove("is-loading");
    }
  });

  bookAnotherBtn.addEventListener("click", () => {
    form.reset();
    setFieldError("fullName", "");
    setFieldError("phone", "");
    setFieldError("address", "");
    setFieldError("appointmentDate", "");
    setFieldError("appointmentTime", "");
    refreshTimeSlots();
    successState.hidden = true;
    form.hidden = false;
    bookingCard.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Initial state on page load.
  refreshTimeSlots();
}

document.addEventListener("DOMContentLoaded", initBookingForm);
