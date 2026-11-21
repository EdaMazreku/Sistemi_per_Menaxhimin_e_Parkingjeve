document.addEventListener("DOMContentLoaded", function () {

    const loginForm = document.getElementById("login-form");

    if (loginForm) {

        loginForm.addEventListener("submit", async function (event) {

            event.preventDefault();

            const username = document.getElementById("username").value.trim();
            const password = document.getElementById("password").value;

            const messageBox = document.getElementById("login-message");
            const loginButton = loginForm.querySelector("button[type='submit']");

            messageBox.hidden = true;
            messageBox.className = "auth-message";

            loginButton.disabled = true;
            loginButton.textContent = "Duke u kyçur...";

            try {

                const response = await fetch("/api/login/", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        username: username,
                        password: password
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        "Emri i përdoruesit ose fjalëkalimi është i pasaktë."
                    );
                }

                localStorage.setItem("authToken", data.token);
                localStorage.setItem("username", username);

                // Kontrollo nëse përdoruesi është administrator
                const adminResponse = await fetch("/api/admin-check/", {
                    method: "GET",
                    headers: {
                        "Authorization": `Token ${data.token}`,
                        "Content-Type": "application/json"
                    }
                });

                if (adminResponse.ok) {

                    const adminData = await adminResponse.json();

                    if (adminData.is_admin === true) {
                        window.location.href = "/admin-dashboard/";
                        return;
                    }

                } else if (adminResponse.status !== 403) {
                    throw new Error(
                        "Nuk mund të verifikoheshin privilegjet e llogarisë."
                    );
                }

                // Përdoruesi i zakonshëm
                messageBox.textContent =
                    "Kyçja u realizua me sukses! Duke ju ridrejtuar...";

                messageBox.classList.add("success");
                messageBox.hidden = false;

                window.location.href = "/dashboard/";

            } catch (error) {

                console.error("Gabim gjatë kyçjes:", error);

                messageBox.textContent =
                    error.message || "Ndodhi një gabim gjatë kyçjes.";

                messageBox.classList.add("error");
                messageBox.hidden = false;

            } finally {

                loginButton.disabled = false;
                loginButton.textContent = "Kyçu";

            }

        });

    }

});

/* ==========================================
   AUTHENTICATION, ROLE CHECK & NAVBAR
========================================== */

document.addEventListener("DOMContentLoaded", async function () {

    let token = localStorage.getItem("authToken");
    let isAdmin = false;

    const currentPath = window.location.pathname;

    const guestNav = document.getElementById("guest-nav");
    const userNav = document.getElementById("user-nav");

    const guestLinks = document.querySelectorAll(".guest-link");
    const userLinks = document.querySelectorAll(".user-link");

    // Verifiko sesionin dhe rolin e përdoruesit
    if (token) {
        try {
            const response = await fetch("/api/admin-check/", {
                method: "GET",
                headers: {
                    "Authorization": `Token ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (response.status === 401) {
                localStorage.removeItem("authToken");
                localStorage.removeItem("username");
                token = null;

            } else if (response.ok) {
                const data = await response.json();
                isAdmin = data.is_admin === true;

            } else if (response.status !== 403) {
                console.error("Nuk mund të verifikohej roli i përdoruesit.");
            }

        } catch (error) {
            console.error("Gabim gjatë kontrollit të sesionit:", error);
        }
    }

    // Shfaq navigimin sipas rolit
    if (token) {
        if (guestNav) guestNav.hidden = true;
        if (userNav) userNav.hidden = false;

        guestLinks.forEach(link => {
            link.hidden = true;
        });

        userLinks.forEach(link => {
            link.hidden = isAdmin;
        });

    } else {
        if (guestNav) guestNav.hidden = false;
        if (userNav) userNav.hidden = true;

        guestLinks.forEach(link => {
            link.hidden = false;
        });

        userLinks.forEach(link => {
            link.hidden = true;
        });
    }

    // Ridrejto sipas rolit
    if (
        token &&
        ["/", "/login/", "/register/"].includes(currentPath)
    ) {
        window.location.href = isAdmin
            ? "/admin-dashboard/"
            : "/dashboard/";

        return;
    }

    // Mos lejo administratorin në dashboard-in e përdoruesit
    if (currentPath === "/dashboard/") {

        if (!token) {
            window.location.href = "/login/";
            return;
        }

        if (isAdmin) {
            window.location.href = "/admin-dashboard/";
            return;
        }
    }

    // Dalja nga llogaria
    const logoutButton = document.getElementById("nav-logout-button");

    if (logoutButton) {
        logoutButton.addEventListener("click", async function (event) {

            event.preventDefault();

            const confirmed = await showConfirmModal({
                title: "Dil nga llogaria?",
                message: "A dëshironi të dilni nga llogaria juaj?",
                type: "warning",
                confirmText: "Po, dil",
                cancelText: "Qëndro"
            });

            if (!confirmed) return;

            localStorage.removeItem("authToken");
            localStorage.removeItem("username");

            window.location.href = "/login/";
        });
    }

});

/* =========================
   LOAD DASHBOARD DATA
========================= */

document.addEventListener("DOMContentLoaded", async function () {

    const dashboardContent = document.getElementById("dashboard-content");

    // Kontrollo nëse jemi në Dashboard
    if (!dashboardContent) {
        return;
    }

    const token = localStorage.getItem("authToken");

    // Kontrollo nëse përdoruesi është administrator
    if (token) {
        try {
            const response = await fetch("/api/admin-check/", {
                headers: {
                    "Authorization": `Token ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();

                if (data.is_admin === true) {
                    window.location.replace("/admin-dashboard/");
                    return;
                }
            }
        } catch (error) {
            console.error("Gabim gjatë kontrollit të administratorit:", error);
        }
    }

    if (!token) {
        window.location.href = "/login/";
        return;
    }

    const loading = document.getElementById("dashboard-loading");
    const errorBox = document.getElementById("dashboard-error");

    // Funksioni për marrjen e të dhënave nga API
    async function fetchAPI(url) {

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Token ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("authToken");
            localStorage.removeItem("username");
            window.location.href = "/login/";
            throw new Error("Sesioni juaj ka skaduar. Ju lutem kyçuni përsëri.");
        }

        if (!response.ok) {
            throw new Error("Nuk mund të ngarkoheshin të dhënat nga serveri.");
        }

        const data = await response.json();

        // Mbështetje për përgjigjet me ose pa pagination
        return Array.isArray(data) ? data : data.results || [];
    }

    // Formatimi i datës dhe orës
    function formatDate(dateString) {

        if (!dateString) return "-";

        const date = new Date(dateString);

        if (isNaN(date.getTime())) return "-";

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");

        return `${day}.${month}.${year}, ${hours}:${minutes}`;
    }

    // Siguria gjatë shfaqjes së tekstit në HTML
    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[char];
        });
    }

    // Përkthimi i statuseve të rezervimeve
    const statusLabels = {
        pending: "Në pritje",
        confirmed: "E konfirmuar",
        cancelled: "E anuluar",
        completed: "E përfunduar"
    };

    try {

        // Merr të dhënat nga katër API
        const [
            parkingLots,
            parkingSpaces,
            reservations,
            payments
        ] = await Promise.all([
            fetchAPI("/api/parking-lots/"),
            fetchAPI("/api/parking-spaces/"),
            fetchAPI("/api/reservations/"),
            fetchAPI("/api/payments/")
        ]);

        // Emri i përdoruesit
        const username = localStorage.getItem("username") || "Përdorues";

        const usernameElement = document.getElementById("dashboard-username");

        if (usernameElement) {
            usernameElement.textContent = username;
        }

        // Gjej parkingjet aktive
        const activeLots = parkingLots.filter(
            lot => lot.is_active
        );

        const activeLotIds = new Set(
            activeLots.map(lot => lot.id)
        );

        // Gjej vendparkimet e lira në parkingjet aktive
        const availableSpaces = parkingSpaces.filter(
            space =>
                space.status === "available" &&
                activeLotIds.has(space.parking_lot)
        );

        // Gjej pagesat në pritje
        const pendingPayments = payments.filter(
            payment => payment.status === "pending"
        );

        // Përditëso statistikat
        document.getElementById("total-parking-lots").textContent =
            activeLots.length;

        document.getElementById("available-spaces").textContent =
            availableSpaces.length;

        document.getElementById("total-reservations").textContent =
            reservations.length;

        document.getElementById("pending-payments").textContent =
            pendingPayments.length;

        // Rendit rezervimet nga më të rejat
        const recentReservations = [...reservations]
            .sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            )
            .slice(0, 5);

        const tableBody = document.getElementById(
            "reservations-table-body"
        );

        const emptyState = document.getElementById(
            "no-reservations"
        );

        if (recentReservations.length === 0) {

            tableBody.innerHTML = "";
            emptyState.hidden = false;

        } else {

            emptyState.hidden = true;

            tableBody.innerHTML = recentReservations.map((reservation, index) => {

                const status = reservation.status || "pending";

                const statusLabel =
                    statusLabels[status] || status;

                return `
                    <tr>
                        <td>#${Number(reservation.id)}</td>

                        <td>
                            ${escapeHTML(
                                reservation.parking_lot_name || "-"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                reservation.parking_space_number || "-"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(formatDate(reservation.start_time))}
                        </td>

                        <td>
                            ${escapeHTML(formatDate(reservation.end_time))}
                        </td>

                        <td>
                            <span class="status-badge status-${escapeHTML(status)}">
                                ${escapeHTML(statusLabel)}
                            </span>
                        </td>
                    </tr>
                `;

            }).join("");

        }

        // Shfaq Dashboard-in pasi të dhënat të jenë ngarkuar
        loading.hidden = true;
        dashboardContent.hidden = false;

    } catch (error) {

        console.error("Gabim gjatë ngarkimit të Dashboard-it:", error);

        loading.hidden = true;

        errorBox.textContent =
            error.message || "Nuk mund të ngarkoheshin të dhënat. Ju lutem provoni përsëri.";

        errorBox.hidden = false;

    }

});

/* =========================
   PARKING SPACE SELECTION
========================= */

document.addEventListener("DOMContentLoaded", function () {

    const parkingSpaces = document.querySelectorAll(
        ".parking-space.available"
    );

    const bookingPanel = document.getElementById("booking-panel");

    const selectedSpaceNumber = document.getElementById(
        "selected-space-number"
    );

    if (!bookingPanel || !selectedSpaceNumber) return;

    // Krijo modalin për vizitorët
    const loginModal = document.createElement("div");

    loginModal.id = "parking-login-modal";
    loginModal.className = "parking-login-modal";
    loginModal.hidden = true;

    loginModal.innerHTML = `
        <div class="parking-login-modal-content"
             role="dialog"
             aria-modal="true"
             aria-labelledby="parking-login-title">

            <button type="button"
                    class="parking-modal-close"
                    aria-label="Mbyll">
                &times;
            </button>

            <div class="parking-modal-icon">P</div>

            <h2 id="parking-login-title">
                Rezervo vendparkimin tënd!
            </h2>

            <p>
                Për të rezervuar këtë vendparkim, duhet të kyçesh
                në llogarinë tënde ose të krijosh një llogari të re.
            </p>

            <div class="parking-modal-actions">
                <a href="/login/" class="parking-modal-login">
                    Kyçu
                </a>

                <a href="/register/" class="parking-modal-register">
                    Regjistrohu
                </a>
            </div>

            <span class="parking-modal-note">
                ParkEase – Parkim më i thjeshtë.
            </span>

        </div>
    `;

    document.body.appendChild(loginModal);

    const closeButton = loginModal.querySelector(
        ".parking-modal-close"
    );

    function closeLoginModal() {
        loginModal.hidden = true;
    }

    closeButton.addEventListener("click", closeLoginModal);

    loginModal.addEventListener("click", function (event) {
        if (event.target === loginModal) {
            closeLoginModal();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !loginModal.hidden) {
            closeLoginModal();
        }
    });

    // Klikimi në vendparkim
    parkingSpaces.forEach(function (space) {

        space.addEventListener("click", function () {

            if (!space.classList.contains("available")) {
                return;
            }

            const token = localStorage.getItem("authToken");

            // Vizitori: shfaq modalin menjëherë
            if (!token) {

                bookingPanel.hidden = true;

                loginModal.hidden = false;

                return;
            }

            // Përdoruesi i kyçur: vazhdon rezervimin
            loginModal.hidden = true;

            parkingSpaces.forEach(function (item) {
                item.classList.remove("selected");
            });

            space.classList.add("selected");

            selectedSpaceNumber.textContent =
                space.dataset.spaceNumber;

            bookingPanel.hidden = false;

            bookingPanel.scrollIntoView({
                behavior: "smooth",
                block: "center"
            });

        });

    });

});

/* =========================
   PARKING RESERVATION API
========================= */

document.addEventListener("DOMContentLoaded", function () {
    const continueButton = document.getElementById("booking-continue");
    const startInput = document.getElementById("start-time");
    const endInput = document.getElementById("end-time");

    if (!continueButton || !startInput || !endInput) return;

    // Shndërron gabimet e API-së në një mesazh të lexueshëm.
    function formatErrorMessage(errorData) {
        if (typeof errorData === "string") {
            return errorData;
        }

        if (Array.isArray(errorData)) {
            return errorData
                .map(formatErrorMessage)
                .filter(Boolean)
                .join("\n");
        }

        if (errorData && typeof errorData === "object") {
            return Object.values(errorData)
                .map(formatErrorMessage)
                .filter(Boolean)
                .join("\n");
        }

        return "";
    }

    continueButton.addEventListener("click", async function () {
        const selectedSpace = document.querySelector(
            ".parking-space.available.selected"
        );

        if (!selectedSpace) {
            await showAlertModal({
                title: "Zgjidhni vendparkimin",
                message: "Ju lutem zgjidhni një vendparkim të lirë.",
                type: "warning"
            });

            return;
        }

        const spaceId = Number(selectedSpace.dataset.spaceId);

        if (!Number.isInteger(spaceId) || spaceId <= 0) {
            await showAlertModal({
                title: "Vendparkim i pavlefshëm",
                message: "Nuk u identifikua vendparkimi i zgjedhur. Ju lutem provoni përsëri.",
                type: "error"
            });

            return;
        }

        const token = localStorage.getItem("authToken");

        if (!token) {
            await showAlertModal({
                title: "Kërkohet kyçja",
                message: "Ju lutem kyçuni për të bërë rezervim.",
                type: "warning"
            });

            window.location.href = "/login/";
            return;
        }

        const startTime = startInput.value;
        const endTime = endInput.value;

        if (!startTime || !endTime) {
            await showAlertModal({
                title: "Të dhëna të paplotësuara",
                message: "Ju lutem plotësoni të dy fushat e datës dhe orës.",
                type: "warning"
            });

            return;
        }

        if (new Date(startTime) <= new Date()) {
            await showAlertModal({
                title: "Datë e pavlefshme",
                message: "Rezervimi duhet të fillojë në të ardhmen.",
                type: "warning"
            });

            return;
        }

        if (new Date(endTime) <= new Date(startTime)) {
            await showAlertModal({
                title: "Orar i pavlefshëm",
                message: "Koha e përfundimit duhet të jetë pas kohës së fillimit.",
                type: "warning"
            });

            return;
        }

        const reservationData = {
            parking_space: spaceId,
            start_time: startTime,
            end_time: endTime
        };

        continueButton.disabled = true;
        continueButton.textContent = "Duke procesuar...";

        try {
            const response = await fetch("/api/reservations/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Token ${token}`
                },
                body: JSON.stringify(reservationData)
            });

            const responseText = await response.text();

            let data = {};

            if (responseText) {
                try {
                    data = JSON.parse(responseText);
                } catch {
                    data = { detail: responseText };
                }
            }

            if (response.status === 401) {
                localStorage.removeItem("authToken");
                localStorage.removeItem("username");

                await showAlertModal({
                    title: "Sesioni ka skaduar",
                    message: "Ju lutem kyçuni përsëri për të vazhduar.",
                    type: "warning"
                });

                window.location.href = "/login/";
                return;
            }

            if (!response.ok) {
                const errorMessage = formatErrorMessage(data);

                await showAlertModal({
                    title: "Rezervimi dështoi",
                    message: errorMessage ||
                        "Rezervimi nuk mund të realizohej. Ju lutem provoni përsëri.",
                    type: "error"
                });

                return;
            }

            const spaceNumber =
                data.parking_space_number ||
                selectedSpace.dataset.spaceNumber ||
                spaceId;

            await showAlertModal({
                title: "Rezervimi u krijua!",
                message:
                    `Rezervimi juaj u krijua me sukses!\n` +
                    `Vendparkimi: ${spaceNumber}\n` +
                    `Numri i rezervimit: ${data.id}`,
                type: "success",
                confirmText: "Në rregull"
            });

            // Rifresko faqen me intervalin e rezervuar.
            const params = new URLSearchParams({
                start_time: startTime,
                end_time: endTime
            });

            window.location.href = `/parking/?${params.toString()}`;

        } catch (error) {
            console.error("Reservation error:", error);

            await showAlertModal({
                title: "Gabim në komunikim",
                message: "Ndodhi një gabim gjatë komunikimit me serverin. Ju lutem provoni përsëri.",
                type: "error"
            });

        } finally {
            continueButton.disabled = false;
            continueButton.textContent = "Vazhdo me rezervimin";
        }
    });
});

/* =========================
   MY RESERVATIONS
========================= */

document.addEventListener("DOMContentLoaded", async function () {
    const reservationsContent = document.getElementById(
        "reservations-content"
    );

    const loading = document.getElementById("reservations-loading");
    const errorBox = document.getElementById("reservations-error");
    const emptyState = document.getElementById("reservations-empty");
    const tableBody = document.getElementById("my-reservations-body");

    if (!reservationsContent || !tableBody) return;

    const token = localStorage.getItem("authToken");

    if (!token) {
        window.location.href = "/login/";
        return;
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[char];
        });
    }

    function formatDate(dateString) {
        if (!dateString) return "-";

        const date = new Date(dateString);

        if (isNaN(date.getTime())) return "-";

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");

        return `${day}.${month}.${year}, ${hours}:${minutes}`;
    }

    function formatErrorMessage(errorData) {
        if (typeof errorData === "string") {
            return errorData;
        }

        if (Array.isArray(errorData)) {
            return errorData
                .map(formatErrorMessage)
                .filter(Boolean)
                .join("\n");
        }

        if (errorData && typeof errorData === "object") {
            return Object.values(errorData)
                .map(formatErrorMessage)
                .filter(Boolean)
                .join("\n");
        }

        return "";
    }

    async function readResponse(response) {
        const responseText = await response.text();

        if (!responseText) return {};

        try {
            return JSON.parse(responseText);
        } catch {
            return { detail: responseText };
        }
    }

    function handleExpiredSession() {
        localStorage.removeItem("authToken");
        localStorage.removeItem("username");
        window.location.href = "/login/";
    }

    const statusLabels = {
        pending: "Në pritje",
        confirmed: "E konfirmuar",
        cancelled: "E anuluar",
        completed: "E përfunduar"
    };

    async function loadReservations() {
        if (loading) loading.hidden = false;
        if (errorBox) errorBox.hidden = true;

        reservationsContent.hidden = true;

        try {
            const response = await fetch("/api/reservations/", {
                method: "GET",
                headers: {
                    "Authorization": `Token ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (response.status === 401) {
                handleExpiredSession();
                return;
            }

            if (!response.ok) {
                const data = await readResponse(response);
                const message = formatErrorMessage(data);

                throw new Error(
                    message || "Nuk mund të ngarkoheshin rezervimet."
                );
            }

            const result = await readResponse(response);

            const reservations = Array.isArray(result)
                ? result
                : Array.isArray(result.results)
                    ? result.results
                    : [];

            // Përditëso statistikat.
            const statistics = {
                "reservations-total": reservations.length,
                "reservations-pending": reservations.filter(
                    r => r.status === "pending"
                ).length,
                "reservations-confirmed": reservations.filter(
                    r => r.status === "confirmed"
                ).length,
                "reservations-completed": reservations.filter(
                    r => r.status === "completed"
                ).length,
                "reservations-cancelled": reservations.filter(
                    r => r.status === "cancelled"
                ).length
            };

            Object.entries(statistics).forEach(([id, value]) => {
                const element = document.getElementById(id);

                if (element) {
                    element.textContent = value;
                }
            });

            // Rendit rezervimet nga më të rejat.
            reservations.sort((a, b) => {
                return new Date(b.created_at) - new Date(a.created_at);
            });

            if (reservations.length === 0) {
                tableBody.innerHTML = "";

                if (emptyState) {
                    emptyState.hidden = false;
                }
            } else {
                if (emptyState) {
                    emptyState.hidden = true;
                }

                tableBody.innerHTML = reservations.map(
                    (reservation, index) => {
                        const status = reservation.status || "pending";

                        const canCancel =
                            ["pending", "confirmed"].includes(status) &&
                            new Date(reservation.start_time) > new Date();

                        const reservationId = Number(reservation.id);

                        return `
                            <tr>
                                <td>#${index + 1}</td>

                                <td>
                                    ${escapeHTML(
                                        reservation.parking_lot_name || "-"
                                    )}
                                </td>

                                <td>
                                    ${escapeHTML(
                                        reservation.parking_space_number || "-"
                                    )}
                                </td>

                                <td>
                                    ${escapeHTML(
                                        formatDate(reservation.start_time)
                                    )}
                                </td>

                                <td>
                                    ${escapeHTML(
                                        formatDate(reservation.end_time)
                                    )}
                                </td>

                                <td>
                                    <span class="reservation-status ${escapeHTML(status)}">
                                        ${statusLabels[status] || escapeHTML(status)}
                                    </span>
                                </td>

                                <td>
                                    ${
                                        canCancel && Number.isInteger(reservationId)
                                            ? `<button
                                                type="button"
                                                class="cancel-reservation-btn"
                                                data-reservation-id="${reservationId}">
                                                Anulo rezervimin
                                               </button>`
                                            : "-"
                                    }
                                </td>
                            </tr>
                        `;
                    }
                ).join("");
            }

            if (loading) loading.hidden = true;
            reservationsContent.hidden = false;

        } catch (error) {
            console.error("Gabim gjatë ngarkimit të rezervimeve:", error);

            if (loading) loading.hidden = true;

            if (errorBox) {
                errorBox.textContent =
                    error.message || "Ndodhi një gabim gjatë ngarkimit të rezervimeve.";

                errorBox.hidden = false;
            }
        }
    }

    // Anulimi i rezervimit.
    tableBody.addEventListener("click", async function (event) {
        const cancelButton = event.target.closest(
            ".cancel-reservation-btn"
        );

        if (!cancelButton) return;

        const reservationId = Number(
            cancelButton.dataset.reservationId
        );

        if (!Number.isInteger(reservationId) || reservationId <= 0) {
            await showAlertModal({
                title: "Rezervim i pavlefshëm",
                message: "Numri i rezervimit nuk është i vlefshëm.",
                type: "error"
            });

            return;
        }

        // Kërko konfirmim para anulimit.
        const confirmed = await showConfirmModal({
            title: "Anulo rezervimin?",
            message: "A jeni të sigurt që dëshironi ta anuloni këtë rezervim?",
            type: "warning",
            confirmText: "Po, anuloje",
            cancelText: "Jo, kthehu"
        });

        if (!confirmed) return;

        cancelButton.disabled = true;
        cancelButton.textContent = "Duke anuluar...";

        try {
            const response = await fetch(
                `/api/reservations/${reservationId}/`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Token ${token}`
                    },
                    body: JSON.stringify({
                        status: "cancelled"
                    })
                }
            );

            const data = await readResponse(response);

            if (response.status === 401) {
                handleExpiredSession();
                return;
            }

            if (!response.ok) {
                const message = formatErrorMessage(data);

                throw new Error(
                    message || "Anulimi i rezervimit nuk u realizua."
                );
            }

            // Shfaq mesazhin e suksesit.
            await showAlertModal({
                title: "Rezervimi u anulua!",
                message: "Rezervimi juaj u anulua me sukses.",
                type: "success"
            });

            // Rifresko tabelën dhe statistikat.
            await loadReservations();

        } catch (error) {
            console.error("Gabim gjatë anulimit:", error);

            await showAlertModal({
                title: "Anulimi dështoi",
                message: error.message ||
                    "Ndodhi një gabim gjatë anulimit të rezervimit.",
                type: "error"
            });

            cancelButton.disabled = false;
            cancelButton.textContent = "Anulo rezervimin";
        }
    });

    // Ngarko rezervimet kur hapet faqja.
    await loadReservations();
});

/* =========================
   REGISTRATION API
========================= */

document.addEventListener("DOMContentLoaded", function () {
    const registerForm = document.getElementById("register-form");

    if (!registerForm) return;

    const messageBox = document.getElementById("register-message");
    const registerButton = registerForm.querySelector(
        "button[type='submit']"
    );

    const usernameInput = document.getElementById("register-username");
    const emailInput = document.getElementById("register-email");
    const passwordInput = document.getElementById("register-password");
    const passwordConfirmInput = document.getElementById(
        "register-password-confirm"
    );

    if (
        !messageBox ||
        !registerButton ||
        !usernameInput ||
        !emailInput ||
        !passwordInput ||
        !passwordConfirmInput
    ) {
        console.error("Mungojnë elementet e nevojshme të formularit të regjistrimit.");
        return;
    }

    function showMessage(message, type) {
        messageBox.textContent = message;
        messageBox.className = "auth-message";
        messageBox.classList.add(type);
        messageBox.hidden = false;
    }

    function formatErrorMessage(errorData) {
        const fieldLabels = {
            username: "Emri i përdoruesit",
            email: "Email-i",
            password: "Fjalëkalimi",
            password_confirm: "Konfirmimi i fjalëkalimit",
            non_field_errors: "Gabim",
            detail: "Gabim"
        };

        if (typeof errorData === "string") {
            return errorData;
        }

        if (Array.isArray(errorData)) {
            return errorData
                .map(formatErrorMessage)
                .filter(Boolean)
                .join("\n");
        }

        if (errorData && typeof errorData === "object") {
            return Object.entries(errorData)
                .map(([field, messages]) => {
                    const label = fieldLabels[field] || field;

                    const message = formatErrorMessage(messages);

                    return message ? `${label}: ${message}` : "";
                })
                .filter(Boolean)
                .join("\n");
        }

        return "";
    }

    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;

        messageBox.hidden = true;
        messageBox.textContent = "";
        messageBox.className = "auth-message";

        if (!username || !email || !password || !passwordConfirm) {
            showMessage(
                "Ju lutem plotësoni të gjitha fushat.",
                "error"
            );
            return;
        }

        if (password !== passwordConfirm) {
            showMessage(
                "Fjalëkalimet nuk përputhen.",
                "error"
            );
            return;
        }

        registerButton.disabled = true;
        registerButton.textContent = "Duke u regjistruar...";

        try {
            const response = await fetch("/api/register/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password,
                    password_confirm: passwordConfirm
                })
            });

            const responseText = await response.text();

            let data = {};

            if (responseText) {
                try {
                    data = JSON.parse(responseText);
                } catch {
                    data = { detail: responseText };
                }
            }

            if (!response.ok) {
                const errors = formatErrorMessage(data);

                throw new Error(
                    errors || "Regjistrimi nuk u realizua. Ju lutem provoni përsëri."
                );
            }

            // Kyç automatikisht përdoruesin pas regjistrimit
            const loginResponse = await fetch("/api/login/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const loginData = await loginResponse.json();

            if (!loginResponse.ok || !loginData.token) {
                throw new Error(
                    "Llogaria u krijua, por kyçja automatike dështoi. Ju lutem kyçuni manualisht."
                );
            }

            // Ruaj të dhënat e autentifikimit
            localStorage.setItem("authToken", loginData.token);
            localStorage.setItem("username", username);

            // Shfaq mesazhin e suksesit
            showMessage(
                "Regjistrimi u realizua me sukses! Duke ju ridrejtuar në panel...",
                "success"
            );

            registerForm.reset();

            registerButton.disabled = true;

            // Ridrejto përdoruesin në Dashboard
            setTimeout(function () {
                window.location.href = "/dashboard/";
            }, 1500);

        } catch (error) {
            console.error("Gabim gjatë regjistrimit:", error);

            showMessage(
                error.message || "Ndodhi një gabim gjatë regjistrimit.",
                "error"
            );

        } finally {
            // Butoni mbetet i çaktivizuar vetëm pas regjistrimit të suksesshëm.
            if (!messageBox.classList.contains("success")) {
                registerButton.disabled = false;
                registerButton.textContent = "Regjistrohu";
            }
        }
    });
});

/* =========================
   MY PAYMENTS
========================= */

document.addEventListener("DOMContentLoaded", async function () {
    const paymentsPage = document.querySelector(".payments-page");

    if (!paymentsPage) return;

    const unpaidContainer = document.getElementById("unpaid-reservations");
    const paymentsLoading = document.getElementById("payments-loading");
    const paymentsError = document.getElementById("payments-error");
    const paymentsEmpty = document.getElementById("payments-empty");
    const paymentsTable = document.getElementById("payments-table");
    const paymentsTableBody = document.getElementById("payments-table-body");

    const totalPaymentsElement = document.getElementById("total-payments");
    const totalAmountElement = document.getElementById("total-amount");
    const pendingPaymentsElement = document.getElementById("pending-payments");

    if (
        !unpaidContainer ||
        !paymentsLoading ||
        !paymentsError ||
        !paymentsEmpty ||
        !paymentsTable ||
        !paymentsTableBody
    ) {
        console.error("Mungojnë elementet e nevojshme në faqen e pagesave.");
        return;
    }

    const token = localStorage.getItem("authToken");

    if (!token) {
        window.location.href = "/login/";
        return;
    }

    const statusLabels = {
        pending: "Në pritje",
        paid: "E paguar",
        cancelled: "E anuluar",
        failed: "Dështoi",
        refunded: "E rimbursuar"
    };

    const methodLabels = {
        cash: "Para në dorë",
        card: "Kartelë"
    };

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (char) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[char];
        });
    }

    function formatDate(dateString) {
        if (!dateString) return "-";

        const date = new Date(dateString);

        if (isNaN(date.getTime())) return "-";

        return date.toLocaleString("sq-AL");
    }

    function calculatePrice(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (
            isNaN(start.getTime()) ||
            isNaN(end.getTime()) ||
            end <= start
        ) {
            return 0;
        }

        const minutes = (end - start) / 60000;

        return Math.ceil(minutes / 90);
    }

    function formatErrorMessage(errorData) {
        if (typeof errorData === "string") {
            return errorData;
        }

        if (Array.isArray(errorData)) {
            return errorData
                .map(formatErrorMessage)
                .filter(Boolean)
                .join("\n");
        }

        if (errorData && typeof errorData === "object") {
            return Object.values(errorData)
                .map(formatErrorMessage)
                .filter(Boolean)
                .join("\n");
        }

        return "";
    }

    async function fetchAPI(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                "Authorization": `Token ${token}`,
                "Content-Type": "application/json",
                ...options.headers
            }
        });

        if (response.status === 401) {
            localStorage.removeItem("authToken");
            localStorage.removeItem("username");

            window.location.href = "/login/";

            throw new Error(
                "Sesioni ka skaduar. Ju lutem kyçuni përsëri."
            );
        }

        const responseText = await response.text();

        let data = {};

        if (responseText) {
            try {
                data = JSON.parse(responseText);
            } catch {
                data = { detail: responseText };
            }
        }

        if (!response.ok) {
            const message = formatErrorMessage(data);

            throw new Error(
                message ||
                "Ndodhi një gabim gjatë komunikimit me serverin."
            );
        }

        return Array.isArray(data)
            ? data
            : data.results || data;
    }

    function renderUnpaidReservations(reservations, payments) {
        // Grupojmë pagesat sipas rezervimit.
        const paymentsByReservation = new Map();

        payments.forEach(payment => {
            const reservationId = Number(payment.reservation_id);

            if (!paymentsByReservation.has(reservationId)) {
                paymentsByReservation.set(reservationId, []);
            }

            paymentsByReservation.get(reservationId).push(payment);
        });

        // Rezervimet pa pagesë aktive mund të paguhen përsëri.
        // Pagesat pending dhe paid e bllokojnë krijimin e një pagese të re.
        const unpaidReservations = reservations.filter(reservation => {
            if (reservation.status === "cancelled") {
                return false;
            }

            const reservationPayments =
                paymentsByReservation.get(Number(reservation.id)) || [];

            const hasActivePayment = reservationPayments.some(payment =>
                ["pending", "paid"].includes(payment.status)
            );

            return !hasActivePayment;
        });

        if (unpaidReservations.length === 0) {
            unpaidContainer.innerHTML = `
                <div class="payments-empty">
                    <h3>Nuk ka rezervime për pagesë</h3>
                    <p>Të gjitha rezervimet kanë një pagesë në pritje, të paguar ose nuk janë të pagueshme.</p>
                </div>
            `;
            return;
        }

        unpaidContainer.innerHTML = unpaidReservations.map(reservation => {
            const amount = calculatePrice(
                reservation.start_time,
                reservation.end_time
            );

            const reservationPayments =
                paymentsByReservation.get(Number(reservation.id)) || [];

            const hasPreviousFailedPayment = reservationPayments.some(
                payment => ["failed", "refunded"].includes(payment.status)
            );

            return `
                <div class="unpaid-reservation-card">

                    <div class="unpaid-reservation-info">
                        <h3>Rezervimi #${Number(reservation.id)}</h3>

                        <p>
                            Parking:
                            ${escapeHTML(reservation.parking_lot_name)}
                        </p>

                        <p>
                            Vendparkimi:
                            ${escapeHTML(reservation.parking_space_number)}
                        </p>

                        <p>
                            Fillimi:
                            ${escapeHTML(formatDate(reservation.start_time))}
                        </p>

                        <p>
                            Përfundimi:
                            ${escapeHTML(formatDate(reservation.end_time))}
                        </p>

                        ${
                            hasPreviousFailedPayment
                                ? `<p class="payment-retry-note">
                                    Pagesa e mëparshme nuk është përfunduar.
                                    Mund të provoni përsëri.
                                   </p>`
                                : ""
                        }
                    </div>

                    <div class="unpaid-reservation-price">
                        <span>Shuma për pagesë</span>
                        <strong>${amount.toFixed(2)} €</strong>
                    </div>

                    <div class="payment-actions">
                        <select
                            class="payment-method-select"
                            data-reservation-id="${Number(reservation.id)}"
                            aria-label="Zgjidhni mënyrën e pagesës">

                            <option value="cash">Para në dorë</option>
                            <option value="card">Kartelë</option>

                        </select>

                        <button
                            type="button"
                            class="create-payment-btn"
                            data-reservation-id="${Number(reservation.id)}">

                            Regjistro pagesën

                        </button>
                    </div>

                </div>
            `;
        }).join("");
    }

    
    function renderPayments(payments) {
        if (totalPaymentsElement) {
            totalPaymentsElement.textContent = payments.length;
        }

        // Shuma e pagesave të përfunduara.
        const paidAmount = payments
            .filter(payment => payment.status === "paid")
            .reduce(
                (total, payment) => total + Number(payment.amount || 0),
                0
            );

        // Shuma e pagesave që ende presin konfirmim.
        const pendingAmount = payments
            .filter(payment => payment.status === "pending")
            .reduce(
                (total, payment) => total + Number(payment.amount || 0),
                0
            );

        if (totalAmountElement) {
            totalAmountElement.textContent =
                `${paidAmount.toFixed(2)} €`;
        }

        if (pendingPaymentsElement) {
            pendingPaymentsElement.textContent =
                `${pendingAmount.toFixed(2)} €`;
        }

        if (payments.length === 0) {
            paymentsTable.hidden = true;
            paymentsEmpty.hidden = false;
            paymentsTableBody.innerHTML = "";
            return;
        }

        paymentsEmpty.hidden = true;
        paymentsTable.hidden = false;

        paymentsTableBody.innerHTML = payments.map(payment => {
            return `
                <tr>
                    <td>#${Number(payment.reservation_id)}</td>

                    <td>
                        ${Number(payment.amount).toFixed(2)} €
                    </td>

                    <td>
                        ${methodLabels[payment.payment_method] ||
                            escapeHTML(payment.payment_method)}
                    </td>

                    <td>
                        <span class="status-badge status-${escapeHTML(payment.status)}">
                            ${statusLabels[payment.status] ||
                                escapeHTML(payment.status)}
                        </span>
                    </td>

                    <td>
                        ${escapeHTML(formatDate(payment.payment_date))}
                    </td>
                </tr>
            `;
        }).join("");
    }


    async function loadPayments() {
        paymentsError.hidden = true;
        paymentsLoading.hidden = false;

        try {
            const [reservations, payments] = await Promise.all([
                fetchAPI("/api/reservations/"),
                fetchAPI("/api/payments/")
            ]);

            renderUnpaidReservations(reservations, payments);
            renderPayments(payments);

            paymentsLoading.hidden = true;

        } catch (error) {
            console.error("Gabim gjatë ngarkimit të pagesave:", error);

            paymentsLoading.hidden = true;
            paymentsError.textContent = error.message;
            paymentsError.hidden = false;

            unpaidContainer.innerHTML = "";
        }
    }

    // Regjistrimi i pagesës.
    unpaidContainer.addEventListener("click", async function (event) {
        const button = event.target.closest(".create-payment-btn");

        if (!button) return;

        const reservationId = Number(button.dataset.reservationId);

        if (!Number.isInteger(reservationId) || reservationId <= 0) {
            await showAlertModal({
                title: "Rezervim i pavlefshëm",
                message: "Numri i rezervimit nuk është i vlefshëm.",
                type: "error"
            });

            return;
        }

        const methodSelect = unpaidContainer.querySelector(
            `.payment-method-select[data-reservation-id="${reservationId}"]`
        );

        if (!methodSelect) {
            await showAlertModal({
                title: "Mënyra e pagesës",
                message: "Ju lutem zgjidhni mënyrën e pagesës.",
                type: "warning"
            });

            return;
        }

        const paymentMethod = methodSelect.value;

        button.disabled = true;
        button.textContent = "Duke regjistruar...";

        try {
            await fetchAPI("/api/payments/", {
                method: "POST",
                body: JSON.stringify({
                    reservation: reservationId,
                    payment_method: paymentMethod
                })
            });

            await showAlertModal({
                title: "Pagesa u regjistrua!",
                message: "Pagesa juaj u regjistrua me sukses.",
                type: "success"
            });

            await loadPayments();

        } catch (error) {
            console.error("Gabim gjatë regjistrimit të pagesës:", error);

            await showAlertModal({
                title: "Regjistrimi dështoi",
                message: error.message ||
                    "Ndodhi një gabim gjatë regjistrimit të pagesës.",
                type: "error"
            });

            button.disabled = false;
            button.textContent = "Regjistro pagesën";
        }
    });

    await loadPayments();
});

// Aktivizimi i lidhjes përkatëse në navbar
document.addEventListener("DOMContentLoaded", function () {
    const navLinks = document.querySelectorAll(".nav-links .nav-link");

    function updateActiveNavLink() {
        navLinks.forEach(link => {
            link.classList.remove("active");
        });

        const currentPath = window.location.pathname;
        const currentHash = window.location.hash;

        let activeLink = null;

        // Nëse përdoruesi është te seksioni "Rreth nesh"
        if (currentHash === "#about") {
            activeLink = document.getElementById("about-link");
        } else {
            navLinks.forEach(link => {
                if (
                    link.hash === "" &&
                    new URL(link.href).pathname === currentPath
                ) {
                    activeLink = link;
                }
            });
        }

        if (activeLink) {
            activeLink.classList.add("active");
        }
    }

    updateActiveNavLink();

    window.addEventListener("hashchange", updateActiveNavLink);
});
