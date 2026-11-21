document.addEventListener("DOMContentLoaded", async () => {
    const token = localStorage.getItem("authToken");

    // Kontrollo nëse përdoruesi është i kyçur.
    if (!token) {
        window.location.href = "/login/";
        return;
    }

    const API_BASE = "/api";

    async function apiRequest(endpoint) {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            method: "GET",
            headers: {
                "Authorization": `Token ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error("Nuk keni privilegje administratori.");
        }

        if (!response.ok) {
            throw new Error("Ndodhi një gabim gjatë marrjes së të dhënave.");
        }

        return await response.json();
    }

    function getResults(data) {
        return Array.isArray(data) ? data : data.results || [];
    }

    // Kontrollo privilegjet e administratorit.
    try {
        await apiRequest("/admin-check/");
    } catch (error) {
        alert(error.message);
        window.location.href = "/dashboard/";
        return;
    }

    // Shfaq emrin e administratorit.
    const username = localStorage.getItem("username");
    const usernameElement = document.getElementById("admin-username");

    if (username && usernameElement) {
        usernameElement.textContent = username;
    }

    // Ngarko statistikat.
    async function loadStatistics() {
        try {
            const [parkingLotsData, parkingSpacesData, reservationsData, usersData] =
                await Promise.all([
                    apiRequest("/parking-lots/"),
                    apiRequest("/parking-spaces/"),
                    apiRequest("/reservations/"),
                    apiRequest("/admin-user-count/")
                ]);

            const parkingLots = getResults(parkingLotsData);
            const parkingSpaces = getResults(parkingSpacesData);
            const reservations = getResults(reservationsData);

            const totalParkingLotsElement =
                document.getElementById("total-parking-lots");

            const totalParkingSpacesElement =
                document.getElementById("total-parking-spaces");

            const totalReservationsElement =
                document.getElementById("total-reservations");

            const totalUsersElement =
                document.getElementById("total-users");

            // Nëse faqja nuk i ka elementet e statistikave, mos vazhdo me përditësimin e tyre.
            if (
                !totalParkingLotsElement ||
                !totalParkingSpacesElement ||
                !totalReservationsElement ||
                !totalUsersElement
            ) {
                return;
            }

            totalParkingLotsElement.textContent = parkingLots.length;

            totalParkingSpacesElement.textContent = parkingSpaces.length;

            totalReservationsElement.textContent = reservations.length;

            totalUsersElement.textContent = usersData.total_users;

            renderPendingReservations(reservations);

        } catch (error) {
            console.error("Gabim gjatë ngarkimit të statistikave:", error);
        }
    }
    
    // Shfaq rezervimet që presin konfirmimin e administratorit.
    function renderPendingReservations(reservations) {
        const tableBody = document.getElementById("pending-reservations");

        if (!tableBody) return;

        const pendingReservations = reservations
            .filter(reservation => reservation.status === "pending")
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

        if (pendingReservations.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        Nuk ka rezervime që presin konfirmim.
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = "";

        pendingReservations.forEach(reservation => {
            const row = document.createElement("tr");

            const values = [
                reservation.id,
                reservation.username || reservation.user || "-",
                reservation.parking_lot_name || "-",
                reservation.parking_space_number || "-",
                formatReservationDate(reservation.start_time)
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            // Kolona e veprimeve.
            const actionsCell = document.createElement("td");

            // Butoni Konfirmo.
            const confirmButton = document.createElement("button");
            confirmButton.type = "button";
            confirmButton.textContent = "Konfirmo";
            confirmButton.className = "admin-edit-button";

            confirmButton.addEventListener("click", async () => {
                const confirmed = await showConfirmModal({
                    title: "Konfirmo rezervimin",
                    message: `A dëshironi ta konfirmoni rezervimin #${reservation.id}?`,
                    type: "success",
                    confirmText: "Po, konfirmo",
                    cancelText: "Kthehu"
                });

                if (!confirmed) return;

                confirmButton.disabled = true;
                confirmButton.textContent = "Duke konfirmuar...";

                try {
                    await sendSpaceRequest(
                        `/reservations/${reservation.id}/`,
                        "PATCH",
                        { status: "confirmed" }
                    );

                    await loadStatistics();

                    await showAlertModal({
                        title: "Rezervimi u konfirmua",
                        message: `Rezervimi #${reservation.id} u konfirmua me sukses.`,
                        type: "success",
                        confirmText: "Në rregull"
                    });

                } catch (error) {
                    confirmButton.disabled = false;
                    confirmButton.textContent = "Konfirmo";

                    await showAlertModal({
                        title: "Gabim",
                        message: error.message,
                        type: "error",
                        confirmText: "Në rregull"
                    });
                }
            });

            // Butoni Anulo.
            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "Anulo";
            cancelButton.className = "admin-delete-button";

            cancelButton.addEventListener("click", async () => {
                const confirmed = await showConfirmModal({
                    title: "Anulo rezervimin",
                    message: `A dëshironi ta anuloni rezervimin #${reservation.id}?`,
                    type: "warning",
                    confirmText: "Po, anulo",
                    cancelText: "Kthehu"
                });

                if (!confirmed) return;

                cancelButton.disabled = true;
                cancelButton.textContent = "Duke anuluar...";

                try {
                    await sendSpaceRequest(
                        `/reservations/${reservation.id}/`,
                        "PATCH",
                        { status: "cancelled" }
                    );

                    await loadStatistics();

                    await showAlertModal({
                        title: "Rezervimi u anulua",
                        message: `Rezervimi #${reservation.id} u anulua me sukses.`,
                        type: "success",
                        confirmText: "Në rregull"
                    });

                } catch (error) {
                    cancelButton.disabled = false;
                    cancelButton.textContent = "Anulo";

                    await showAlertModal({
                        title: "Gabim",
                        message: error.message,
                        type: "error",
                        confirmText: "Në rregull"
                    });
                }
            });

            actionsCell.appendChild(confirmButton);
            actionsCell.appendChild(cancelButton);

            row.appendChild(actionsCell);
            tableBody.appendChild(row);
        });
    }

    await loadStatistics();

    // Ngarko listën e parkingjeve në faqen administrative
    async function loadParkingLots() {
        const tableBody = document.getElementById("parking-lots-table");
        const errorBox = document.getElementById("parking-lots-error");

        if (!tableBody) return;

        try {
            const data = await apiRequest("/parking-lots/");
            const parkingLots = getResults(data);

            if (errorBox) {
                errorBox.hidden = true;
                errorBox.textContent = "";
            }

            if (parkingLots.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8">Nuk ka parkingje të regjistruara.</td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = "";

            parkingLots.forEach(lot => {
                const row = document.createElement("tr");

                const values = [
                    lot.id,
                    lot.name,
                    lot.address,
                    lot.capacity,
                    lot.opening_time,
                    lot.closing_time
                ];

                values.forEach(value => {
                    const cell = document.createElement("td");
                    cell.textContent = value ?? "-";
                    row.appendChild(cell);
                });

                // Kolona e statusit
                const statusCell = document.createElement("td");
                const status = document.createElement("span");

                status.textContent = lot.is_active ? "Aktiv" : "Joaktiv";
                status.className = lot.is_active
                    ? "status-active"
                    : "status-inactive";

                statusCell.appendChild(status);
                row.appendChild(statusCell);

                // Kolona e veprimeve
                const actionsCell = document.createElement("td");

                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.textContent = "Ndrysho";
                editButton.className = "admin-edit-button";

                editButton.addEventListener("click", () => {
                    openParkingModal(lot);
                });

                
                const deleteButton = document.createElement("button");
                deleteButton.type = "button";

                deleteButton.textContent = lot.is_active ? "Çaktivizo" : "Aktivizo";

                deleteButton.className = lot.is_active
                    ? "admin-delete-button"
                    : "admin-edit-button";

                deleteButton.addEventListener("click", async () => {

                    const newStatus = !lot.is_active;

                    const confirmed = await showConfirmModal({
                        title: newStatus ? "Aktivizo parkingun" : "Çaktivizo parkingun",
                        message: newStatus
                            ? `A dëshironi ta aktivizoni parkingun "${lot.name}"?`
                            : `A dëshironi ta çaktivizoni parkingun "${lot.name}"?`,
                        type: "warning",
                        confirmText: newStatus ? "Po, aktivizo" : "Po, çaktivizo",
                        cancelText: "Anulo"
                    });

                    if (!confirmed) return;

                    deleteButton.disabled = true;
                    deleteButton.textContent = "Duke përditësuar...";

                    try {
                        const response = await fetch(
                            `${API_BASE}/parking-lots/${lot.id}/`,
                            {
                                method: "PATCH",
                                headers: {
                                    "Authorization": `Token ${token}`,
                                    "Content-Type": "application/json"
                                },
                                body: JSON.stringify({
                                    is_active: newStatus
                                })
                            }
                        );

                        if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(
                                errorText || "Statusi i parkingut nuk mund të ndryshohej."
                            );
                        }

                        await loadParkingLots();

                        await showAlertModal({
                            title: "Veprimi u krye me sukses",
                            message: newStatus
                                ? `Parking-u "${lot.name}" u aktivizua me sukses.`
                                : `Parking-u "${lot.name}" u çaktivizua me sukses.`,
                            type: "success",
                            confirmText: "Në rregull"
                        });

                    } catch (error) {
                        await showAlertModal({
                            title: "Gabim",
                            message: error.message,
                            type: "error",
                            confirmText: "Në rregull"
                        });

                        deleteButton.disabled = false;
                        deleteButton.textContent = lot.is_active
                            ? "Çaktivizo"
                            : "Aktivizo";
                    }
                });


                actionsCell.appendChild(editButton);
                actionsCell.appendChild(deleteButton);

                row.appendChild(actionsCell);
                tableBody.appendChild(row);
            });

        } catch (error) {
            console.error("Gabim gjatë ngarkimit të parkingjeve:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="8">Gabim gjatë ngarkimit të parkingjeve.</td>
                </tr>
            `;
        }
    }

    await loadParkingLots();

    // ==========================================
    // CRUD - PARKING LOTS
    // ==========================================

    const parkingModal = document.getElementById("parking-lot-modal");
    const parkingForm = document.getElementById("parking-lot-form");
    const addParkingButton = document.getElementById("add-parking-lot");
    const closeParkingButton = document.getElementById("close-parking-modal");
    const cancelParkingButton = document.getElementById("cancel-parking-modal");

    const parkingModalTitle = document.getElementById("parking-lot-modal-title");
    const parkingFormError = document.getElementById("parking-lot-form-error");

    function closeParkingModal() {
        parkingModal.hidden = true;
        parkingForm.reset();
        document.getElementById("parking-lot-id").value = "";
        parkingFormError.hidden = true;
        parkingFormError.textContent = "";
    }

    function openParkingModal(lot = null) {
        parkingForm.reset();
        parkingFormError.hidden = true;
        parkingFormError.textContent = "";

        if (lot) {
            parkingModalTitle.textContent = "Ndrysho parkingun";
            document.getElementById("parking-lot-id").value = lot.id;
            document.getElementById("lot-name").value = lot.name || "";
            document.getElementById("lot-address").value = lot.address || "";
            document.getElementById("lot-description").value = lot.description || "";
            document.getElementById("lot-capacity").value = lot.capacity || 1;
            document.getElementById("lot-opening-time").value =
                (lot.opening_time || "").slice(0, 5);
            document.getElementById("lot-closing-time").value =
                (lot.closing_time || "").slice(0, 5);
            document.getElementById("lot-active").value =
                String(lot.is_active);
        } else {
            parkingModalTitle.textContent = "Shto parking";
            document.getElementById("parking-lot-id").value = "";
            document.getElementById("lot-active").value = "true";
        }

        parkingModal.hidden = false;
    }

    if (addParkingButton) {
        addParkingButton.addEventListener("click", () => {
            openParkingModal();
        });
    }

    if (closeParkingButton) {
        closeParkingButton.addEventListener("click", closeParkingModal);
    }

    if (cancelParkingButton) {
        cancelParkingButton.addEventListener("click", closeParkingModal);
    }

    // Ruaj parkingun e ri ose ndryshimet.
    if (parkingForm) {
        parkingForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const parkingId = document.getElementById("parking-lot-id").value;

            const parkingData = {
                name: document.getElementById("lot-name").value.trim(),
                address: document.getElementById("lot-address").value.trim(),
                description: document.getElementById("lot-description").value.trim(),
                capacity: Number(document.getElementById("lot-capacity").value),
                opening_time: document.getElementById("lot-opening-time").value,
                closing_time: document.getElementById("lot-closing-time").value,
                is_active: document.getElementById("lot-active").value === "true"
            };

            const saveButton = document.getElementById("save-parking-lot");

            saveButton.disabled = true;
            saveButton.textContent = "Duke ruajtur...";

            try {
                const response = await fetch(
                    parkingId
                        ? `${API_BASE}/parking-lots/${parkingId}/`
                        : `${API_BASE}/parking-lots/`,
                    {
                        method: parkingId ? "PUT" : "POST",
                        headers: {
                            "Authorization": `Token ${token}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(parkingData)
                    }
                );

                const responseData = await response.json().catch(() => ({}));

                if (!response.ok) {
                    const errorMessage = Object.entries(responseData)
                        .map(([field, messages]) =>
                            `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`
                        )
                        .join(" | ");

                    throw new Error(
                        errorMessage || "Parkingun nuk mund ta ruanim."
                    );
                }

                closeParkingModal();
                await loadParkingLots();

            } catch (error) {
                parkingFormError.textContent = error.message;
                parkingFormError.hidden = false;
            } finally {
                saveButton.disabled = false;
                saveButton.textContent = "Ruaj parkingun";
            }
        });
    }

    // ==========================================
    // CRUD - PARKING SPACES
    // ==========================================

    const parkingSpacesTable = document.getElementById("parking-spaces-table");
    const parkingSpacesError = document.getElementById("parking-spaces-error");

    const parkingSpaceModal = document.getElementById("parking-space-modal");
    const parkingSpaceForm = document.getElementById("parking-space-form");
    const addParkingSpaceButton = document.getElementById("add-parking-space");

    const closeParkingSpaceButton = document.getElementById("close-parking-space-modal");
    const cancelParkingSpaceButton = document.getElementById("cancel-parking-space-modal");

    const parkingSpaceModalTitle = document.getElementById("parking-space-modal-title");
    const parkingSpaceFormError = document.getElementById("parking-space-form-error");

    const spaceStatusLabels = {
        available: "I lirë",
        occupied: "I zënë",
        maintenance: "Në mirëmbajtje"
    };

    const spaceTypeLabels = {
        standard: "Standard",
        disabled: "Për persona me aftësi të kufizuara",
        electric: "Për automjete elektrike"
    };

    // Kërkesat POST, PUT, PATCH dhe DELETE.
    async function sendSpaceRequest(endpoint, method, body = null) {
        const options = {
            method: method,
            headers: {
                "Authorization": `Token ${token}`,
                "Content-Type": "application/json"
            }
        };

        if (body !== null) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${API_BASE}${endpoint}`, options);

        if (!response.ok) {
            const responseData = await response.json().catch(() => ({}));

            const errorMessage = Object.entries(responseData)
                .map(([field, messages]) =>
                    `${field}: ${Array.isArray(messages) ? messages.join(", ") : messages}`
                )
                .join(" | ");

            throw new Error(
                errorMessage || "Kërkesa nuk mund të realizohej."
            );
        }

        if (response.status === 204) {
            return null;
        }

        return await response.json();
    }

    // Ngarko parkingjet në listën përzgjedhëse.
    async function loadParkingLotsForSpaces(selectedLotId = null) {
        const lotSelect = document.getElementById("space-parking-lot");

        if (!lotSelect) return;

        const data = await apiRequest("/parking-lots/");
        const parkingLots = getResults(data);

        lotSelect.innerHTML = '<option value="">Zgjidh parkingun</option>';

        parkingLots.forEach(lot => {
            const option = document.createElement("option");

            option.value = lot.id;
            option.textContent = lot.is_active
                ? lot.name
                : `${lot.name} (Joaktiv)`;

            // Parkingjet joaktive nuk mund të zgjidhen për vende të reja.
            if (!lot.is_active && String(lot.id) !== String(selectedLotId)) {
                option.disabled = true;
            }

            lotSelect.appendChild(option);
        });
    }

    // Ngarko dhe shfaq vendet e parkimit.
    async function loadParkingSpaces() {
        if (!parkingSpacesTable) return;

        try {
            const data = await apiRequest("/parking-spaces/");
            const parkingSpaces = getResults(data);

            if (parkingSpacesError) {
                parkingSpacesError.hidden = true;
                parkingSpacesError.textContent = "";
            }

            if (parkingSpaces.length === 0) {
                parkingSpacesTable.innerHTML = `
                    <tr>
                        <td colspan="6">Nuk ka vende parkimi të regjistruara.</td>
                    </tr>
                `;
                return;
            }

            parkingSpacesTable.innerHTML = "";

            parkingSpaces.forEach(space => {
                const row = document.createElement("tr");

                const values = [
                    space.id,
                    space.parking_lot_name || "-",
                    space.space_number,
                    spaceTypeLabels[space.space_type] || space.space_type,
                    spaceStatusLabels[space.status] || space.status
                ];

                values.forEach(value => {
                    const cell = document.createElement("td");
                    cell.textContent = value ?? "-";
                    row.appendChild(cell);
                });

                // Kolona e veprimeve.
                const actionsCell = document.createElement("td");

                const editButton = document.createElement("button");
                editButton.type = "button";
                editButton.textContent = "Ndrysho";
                editButton.className = "admin-edit-button";

                editButton.addEventListener("click", () => {
                    openParkingSpaceModal(space);
                });

                const deleteButton = document.createElement("button");
                deleteButton.type = "button";
                deleteButton.textContent = "Fshi";
                deleteButton.className = "admin-delete-button";

                deleteButton.addEventListener("click", async () => {
                    const confirmed = await showConfirmModal({
                        title: "Fshi vendin e parkimit",
                        message: `A dëshironi ta fshini vendin "${space.space_number}" nga parkingu "${space.parking_lot_name}"?`,
                        type: "warning",
                        confirmText: "Po, fshije",
                        cancelText: "Anulo"
                    });

                    if (!confirmed) return;

                    deleteButton.disabled = true;
                    deleteButton.textContent = "Duke fshirë...";

                    try {
                        await sendSpaceRequest(
                            `/parking-spaces/${space.id}/`,
                            "DELETE"
                        );

                        await loadParkingSpaces();

                        await showAlertModal({
                            title: "Veprimi u krye me sukses",
                            message: `Vendi "${space.space_number}" u fshi me sukses.`,
                            type: "success",
                            confirmText: "Në rregull"
                        });

                    } catch (error) {
                        deleteButton.disabled = false;
                        deleteButton.textContent = "Fshi";

                        await showAlertModal({
                            title: "Nuk mund të fshihet",
                            message: error.message,
                            type: "error",
                            confirmText: "Në rregull"
                        });
                    }
                });

                actionsCell.appendChild(editButton);
                actionsCell.appendChild(deleteButton);

                row.appendChild(actionsCell);
                parkingSpacesTable.appendChild(row);
            });

        } catch (error) {
            console.error("Gabim gjatë ngarkimit të vendeve:", error);

            parkingSpacesTable.innerHTML = `
                <tr>
                    <td colspan="6">Gabim gjatë ngarkimit të vendeve të parkimit.</td>
                </tr>
            `;
        }
    }

    // Mbyll modalin.
    function closeParkingSpaceModal() {
        parkingSpaceModal.hidden = true;
        parkingSpaceForm.reset();

        document.getElementById("parking-space-id").value = "";

        parkingSpaceFormError.hidden = true;
        parkingSpaceFormError.textContent = "";
    }

    // Hap modalin për shtim ose ndryshim.
    async function openParkingSpaceModal(space = null) {
        parkingSpaceForm.reset();

        parkingSpaceFormError.hidden = true;
        parkingSpaceFormError.textContent = "";

        const selectedLotId = space ? space.parking_lot : null;

        try {
            await loadParkingLotsForSpaces(selectedLotId);

            if (space) {
                parkingSpaceModalTitle.textContent = "Ndrysho vendin e parkimit";

                document.getElementById("parking-space-id").value = space.id;
                document.getElementById("space-parking-lot").value = space.parking_lot;
                document.getElementById("space-number").value = space.space_number;
                document.getElementById("space-type").value = space.space_type;
                document.getElementById("space-status").value = space.status;

            } else {
                parkingSpaceModalTitle.textContent = "Shto vend parkimi";

                document.getElementById("parking-space-id").value = "";
                document.getElementById("space-type").value = "standard";
                document.getElementById("space-status").value = "available";
            }

            parkingSpaceModal.hidden = false;

        } catch (error) {
            await showAlertModal({
                title: "Gabim",
                message: "Parkingjet nuk mund të ngarkoheshin: " + error.message,
                type: "error",
                confirmText: "Në rregull"
            });
        }
    }

    // Butoni për shtimin e vendit.
    if (addParkingSpaceButton) {
        addParkingSpaceButton.addEventListener("click", () => {
            openParkingSpaceModal();
        });
    }

    // Butonat për mbylljen e modalit.
    if (closeParkingSpaceButton) {
        closeParkingSpaceButton.addEventListener("click", closeParkingSpaceModal);
    }

    if (cancelParkingSpaceButton) {
        cancelParkingSpaceButton.addEventListener("click", closeParkingSpaceModal);
    }

    // Ruaj vendin e ri ose ndryshimet.
    if (parkingSpaceForm) {
        parkingSpaceForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const spaceId = document.getElementById("parking-space-id").value;

            const spaceData = {
                parking_lot: Number(
                    document.getElementById("space-parking-lot").value
                ),
                space_number: document.getElementById("space-number").value.trim(),
                space_type: document.getElementById("space-type").value,
                status: document.getElementById("space-status").value
            };

            if (!spaceData.parking_lot) {
                parkingSpaceFormError.textContent = "Duhet të zgjidhni një parking.";
                parkingSpaceFormError.hidden = false;
                return;
            }

            const saveButton = document.getElementById("save-parking-space");

            saveButton.disabled = true;
            saveButton.textContent = "Duke ruajtur...";

            try {
                await sendSpaceRequest(
                    spaceId
                        ? `/parking-spaces/${spaceId}/`
                        : "/parking-spaces/",
                    spaceId ? "PUT" : "POST",
                    spaceData
                );

                closeParkingSpaceModal();

                await loadParkingSpaces();

                await showAlertModal({
                    title: "Veprimi u krye me sukses",
                    message: spaceId
                        ? "Vendi i parkimit u përditësua me sukses."
                        : "Vendi i ri i parkimit u shtua me sukses.",
                    type: "success",
                    confirmText: "Në rregull"
                });

            } catch (error) {
                parkingSpaceFormError.textContent = error.message;
                parkingSpaceFormError.hidden = false;

            } finally {
                saveButton.disabled = false;
                saveButton.textContent = "Ruaj vendin";
            }
        });
    }

    // Ngarko vendet vetëm në faqen e tyre administrative.
    if (parkingSpacesTable) {
        await loadParkingSpaces();
    }

    // ==========================================
    // MENAXHIMI I REZERVIMEVE
    // ==========================================

    const reservationsTable = document.getElementById("reservations-table");
    const reservationsError = document.getElementById("reservations-error");

    const reservationSearch = document.getElementById("reservation-search");
    const reservationStatusFilter = document.getElementById("reservation-status-filter");
    const resetReservationFilters = document.getElementById("reset-reservation-filters");

    let allReservations = [];

    const reservationStatusLabels = {
        pending: "Në pritje",
        confirmed: "Konfirmuar",
        cancelled: "Anuluar",
        completed: "Përfunduar"
    };


    // Të dhënat për modalin e editimit.
    let reservationParkingLots = [];
    let reservationParkingSpaces = [];

    const reservationEditModal = document.getElementById("reservation-edit-modal");
    const reservationEditForm = document.getElementById("reservation-edit-form");
    const reservationEditError = document.getElementById("reservation-edit-error");

    const reservationEditLot = document.getElementById("reservation-edit-parking-lot");
    const reservationEditSpace = document.getElementById("reservation-edit-space");

    const closeReservationModalButton =
        document.getElementById("close-reservation-modal");

    const cancelReservationModalButton =
        document.getElementById("cancel-reservation-modal");

    // Konverton datën në formatin datetime-local sipas orës lokale.
    function toLocalDateTimeInput(value) {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "";

        const offset = date.getTimezoneOffset() * 60000;

        return new Date(date.getTime() - offset)
            .toISOString()
            .slice(0, 16);
    }

    // Ngarkon vendet që i përkasin parkingut të zgjedhur.
    function populateReservationSpaces(parkingLotId, selectedSpaceId = null) {
        reservationEditSpace.innerHTML =
            '<option value="">Zgjidh vendin e parkimit</option>';

        const spaces = reservationParkingSpaces.filter(space =>
            String(space.parking_lot) === String(parkingLotId)
        );

        spaces.forEach(space => {
            const option = document.createElement("option");

            option.value = space.id;

            option.textContent =
                `${space.space_number} (${space.status === "available" ? "I lirë" :
                    space.status === "occupied" ? "I zënë" : "Në mirëmbajtje"})`;

            reservationEditSpace.appendChild(option);
        });

        reservationEditSpace.disabled = spaces.length === 0;

        if (selectedSpaceId !== null) {
            reservationEditSpace.value = String(selectedSpaceId);
        }
    }

    // Ngarkon parkingjet dhe vendet nga API.
    async function loadReservationEditData(reservation) {
        const [lotsData, spacesData] = await Promise.all([
            apiRequest("/parking-lots/"),
            apiRequest("/parking-spaces/")
        ]);

        reservationParkingLots = getResults(lotsData);
        reservationParkingSpaces = getResults(spacesData);

        const currentSpace = reservationParkingSpaces.find(
            space => String(space.id) === String(reservation.parking_space)
        );

        if (!currentSpace) {
            throw new Error("Vendi aktual i rezervimit nuk u gjet.");
        }

        reservationEditLot.innerHTML =
            '<option value="">Zgjidh parkingun</option>';

        reservationParkingLots.forEach(lot => {
            const option = document.createElement("option");

            option.value = lot.id;
            option.textContent = lot.is_active
                ? lot.name
                : `${lot.name} (Joaktiv)`;

            if (!lot.is_active) {
                option.disabled = true;
            }

            reservationEditLot.appendChild(option);
        });

        reservationEditLot.value = String(currentSpace.parking_lot);

        populateReservationSpaces(
            currentSpace.parking_lot,
            currentSpace.id
        );

        document.getElementById("reservation-edit-id").value =
            reservation.id;

        document.getElementById("reservation-edit-start").value =
            toLocalDateTimeInput(reservation.start_time);

        document.getElementById("reservation-edit-end").value =
            toLocalDateTimeInput(reservation.end_time);
    }

    // Hap modalin e editimit.
    async function openReservationEditModal(reservation) {
        reservationEditForm.reset();

        reservationEditError.hidden = true;
        reservationEditError.textContent = "";

        try {
            await loadReservationEditData(reservation);

            reservationEditModal.hidden = false;

        } catch (error) {
            await showAlertModal({
                title: "Gabim",
                message: error.message,
                type: "error",
                confirmText: "Në rregull"
            });
        }
    }

    // Mbyll modalin.
    function closeReservationEditModal() {
        reservationEditModal.hidden = true;
        reservationEditForm.reset();

        reservationEditError.hidden = true;
        reservationEditError.textContent = "";
    }

    // Ndryshimi i parkingut rifreskon listën e vendeve.
    if (reservationEditLot) {
        reservationEditLot.addEventListener("change", () => {
            populateReservationSpaces(reservationEditLot.value);
        });
    }

    if (closeReservationModalButton) {
        closeReservationModalButton.addEventListener(
            "click",
            closeReservationEditModal
        );
    }

    if (cancelReservationModalButton) {
        cancelReservationModalButton.addEventListener(
            "click",
            closeReservationEditModal
        );
    }

    // Ruajtja e ndryshimeve përmes PUT.
    if (reservationEditForm) {
        reservationEditForm.addEventListener("submit", async event => {
            event.preventDefault();

            const reservationId =
                document.getElementById("reservation-edit-id").value;

            const startValue =
                document.getElementById("reservation-edit-start").value;

            const endValue =
                document.getElementById("reservation-edit-end").value;

            const spaceId = reservationEditSpace.value;

            if (!spaceId) {
                reservationEditError.textContent =
                    "Duhet të zgjidhni një vend parkimi.";

                reservationEditError.hidden = false;
                return;
            }

            const startDate = new Date(startValue);
            const endDate = new Date(endValue);

            if (
                !startValue ||
                !endValue ||
                Number.isNaN(startDate.getTime()) ||
                Number.isNaN(endDate.getTime()) ||
                endDate <= startDate
            ) {
                reservationEditError.textContent =
                    "Koha e përfundimit duhet të jetë pas kohës së fillimit.";

                reservationEditError.hidden = false;
                return;
            }

            const reservationData = {
                parking_space: Number(spaceId),
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString()
            };

            const saveButton =
                document.getElementById("save-reservation");

            saveButton.disabled = true;
            saveButton.textContent = "Duke ruajtur...";

            try {
                await sendSpaceRequest(
                    `/reservations/${reservationId}/`,
                    "PUT",
                    reservationData
                );

                closeReservationEditModal();

                await loadReservations();

                await showAlertModal({
                    title: "Ndryshimet u ruajtën",
                    message: `Rezervimi #${reservationId} u përditësua me sukses.`,
                    type: "success",
                    confirmText: "Në rregull"
                });

            } catch (error) {
                reservationEditError.textContent = error.message;
                reservationEditError.hidden = false;

            } finally {
                saveButton.disabled = false;
                saveButton.textContent = "Ruaj ndryshimet";
            }
        });
    }

    // Formati i datës dhe kohës.
    function formatReservationDate(dateValue) {
        if (!dateValue) return "-";

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) return "-";

        return date.toLocaleString("sq-AL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    // Ngarko rezervimet nga API.
    async function loadReservations() {
        if (!reservationsTable) return;

        try {
            const data = await apiRequest("/reservations/");

            allReservations = getResults(data);

            if (reservationsError) {
                reservationsError.hidden = true;
                reservationsError.textContent = "";
            }

            renderReservations();

        } catch (error) {
            console.error("Gabim gjatë ngarkimit të rezervimeve:", error);

            reservationsTable.innerHTML = `
                <tr>
                    <td colspan="8">Gabim gjatë ngarkimit të rezervimeve.</td>
                </tr>
            `;

            if (reservationsError) {
                reservationsError.textContent = error.message;
                reservationsError.hidden = false;
            }
        }
    }

    // Shfaq rezervimet në tabelë.
    function renderReservations() {
        if (!reservationsTable) return;

        const searchText = reservationSearch
            ? reservationSearch.value.trim().toLowerCase()
            : "";

        const selectedStatus = reservationStatusFilter
            ? reservationStatusFilter.value
            : "";

        const filteredReservations = allReservations.filter(reservation => {
            const matchesSearch = [
                reservation.id,
                reservation.username,
                reservation.parking_lot_name,
                reservation.parking_space_number
            ].some(value =>
                String(value ?? "").toLowerCase().includes(searchText)
            );

            const matchesStatus = !selectedStatus ||
                reservation.status === selectedStatus;

            return matchesSearch && matchesStatus;
        });

        if (filteredReservations.length === 0) {
            reservationsTable.innerHTML = `
                <tr>
                    <td colspan="8">Nuk u gjet asnjë rezervim.</td>
                </tr>
            `;
            return;
        }

        reservationsTable.innerHTML = "";

        filteredReservations.forEach(reservation => {
            const row = document.createElement("tr");

            const values = [
                reservation.id,
                reservation.username || "-",
                reservation.parking_lot_name || "-",
                reservation.parking_space_number || "-",
                formatReservationDate(reservation.start_time),
                formatReservationDate(reservation.end_time)
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            // Kolona e statusit.
            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");

            statusBadge.textContent =
                reservationStatusLabels[reservation.status] ||
                reservation.status;

            statusBadge.className = `reservation-status status-${reservation.status}`;

            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);
            
            // Kolona e veprimeve.
            const actionsCell = document.createElement("td");

            const canManage = ["pending", "confirmed"].includes(
                reservation.status
            );

            if (canManage) {
                // Butoni Ndrysho.
                const editButton = document.createElement("button");

                editButton.type = "button";
                editButton.textContent = "Ndrysho";
                editButton.className = "admin-edit-button";

                editButton.addEventListener("click", () => {
                    openReservationEditModal(reservation);
                });

                actionsCell.appendChild(editButton);

                // Butoni Anulo.
                const cancelButton = document.createElement("button");

                cancelButton.type = "button";
                cancelButton.textContent = "Anulo";
                cancelButton.className = "admin-delete-button";

                cancelButton.addEventListener("click", async () => {
                    const confirmed = await showConfirmModal({
                        title: "Anulo rezervimin",
                        message: `A dëshironi ta anuloni rezervimin #${reservation.id} të përdoruesit "${reservation.username}"?`,
                        type: "warning",
                        confirmText: "Po, anulo",
                        cancelText: "Kthehu"
                    });

                    if (!confirmed) return;

                    cancelButton.disabled = true;
                    cancelButton.textContent = "Duke anuluar...";

                    try {
                        await sendSpaceRequest(
                            `/reservations/${reservation.id}/`,
                            "PATCH",
                            { status: "cancelled" }
                        );

                        await loadReservations();

                        await showAlertModal({
                            title: "Rezervimi u anulua",
                            message: `Rezervimi #${reservation.id} u anulua me sukses.`,
                            type: "success",
                            confirmText: "Në rregull"
                        });

                    } catch (error) {
                        cancelButton.disabled = false;
                        cancelButton.textContent = "Anulo";

                        await showAlertModal({
                            title: "Nuk mund të anulohet rezervimi",
                            message: error.message,
                            type: "error",
                            confirmText: "Në rregull"
                        });
                    }
                });

                actionsCell.appendChild(cancelButton);

            } else {
                const noAction = document.createElement("span");
                noAction.textContent = "-";
                actionsCell.appendChild(noAction);
            }

            row.appendChild(actionsCell);
            reservationsTable.appendChild(row);
        });
    }

    // Kërkimi sipas ID-së, përdoruesit, parkingut ose vendit.
    if (reservationSearch) {
        reservationSearch.addEventListener("input", renderReservations);
    }

    // Filtrimi sipas statusit.
    if (reservationStatusFilter) {
        reservationStatusFilter.addEventListener("change", renderReservations);
    }

    // Pastro filtrat.
    if (resetReservationFilters) {
        resetReservationFilters.addEventListener("click", () => {
            reservationSearch.value = "";
            reservationStatusFilter.value = "";

            renderReservations();
        });
    }

// ==========================================
// SHTIMI I REZERVIMIT NGA ADMINISTRATORI
// ==========================================

const addReservationButton = document.getElementById("add-reservation-button");
const addReservationModal = document.getElementById("reservation-add-modal");
const addReservationForm = document.getElementById("reservation-add-form");
const addReservationError = document.getElementById("reservation-add-error");

const newReservationUser = document.getElementById("new-reservation-user");
const newReservationLot = document.getElementById("new-reservation-lot");
const newReservationSpace = document.getElementById("new-reservation-space");

const closeAddReservationButton = document.getElementById(
    "close-add-reservation-modal"
);

const cancelAddReservationButton = document.getElementById(
    "cancel-add-reservation"
);

const saveNewReservationButton = document.getElementById(
    "save-new-reservation"
);

// Ngarkon përdoruesit, parkingjet dhe vendparkimet.
async function loadNewReservationData() {
    const [usersData, lotsData, spacesData] = await Promise.all([
        apiRequest("/admin-users/"),
        apiRequest("/parking-lots/"),
        apiRequest("/parking-spaces/")
    ]);

    const users = getResults(usersData);
    const lots = getResults(lotsData);
    const spaces = getResults(spacesData);

    // Përdoruesit.
    newReservationUser.innerHTML =
        '<option value="">Zgjidh përdoruesin</option>';

    users.forEach(user => {
        const option = document.createElement("option");

        option.value = user.id;
        option.textContent = user.email
            ? `${user.username} (${user.email})`
            : user.username;

        newReservationUser.appendChild(option);
    });

    // Vetëm parkingjet aktive.
    newReservationLot.innerHTML =
        '<option value="">Zgjidh parkingun</option>';

    lots.filter(lot => lot.is_active).forEach(lot => {
        const option = document.createElement("option");

        option.value = lot.id;
        option.textContent = lot.name;

        newReservationLot.appendChild(option);
    });

    // Ruaj vendparkimet për filtrimin sipas parkingut.
    newReservationSpace.innerHTML =
        '<option value="">Së pari zgjidh parkingun</option>';

    newReservationSpace.disabled = true;

    newReservationLot.dataset.spaces = JSON.stringify(
        spaces.filter(space =>
            space.status !== "maintenance"
        )
    );

    if (users.length === 0) {
        throw new Error("Nuk ka përdorues të regjistruar për rezervim.");
    }

    if (lots.filter(lot => lot.is_active).length === 0) {
        throw new Error("Nuk ka parkingje aktive.");
    }
}

// Shfaq vendparkimet sipas parkingut të zgjedhur.
if (newReservationLot) {
    newReservationLot.addEventListener("change", () => {
        const selectedLotId = newReservationLot.value;

        const spaces = JSON.parse(
            newReservationLot.dataset.spaces || "[]"
        );

        const filteredSpaces = spaces.filter(space =>
            String(space.parking_lot) === String(selectedLotId)
        );

        newReservationSpace.innerHTML =
            '<option value="">Zgjidh vendin e parkimit</option>';

        filteredSpaces.forEach(space => {
            const option = document.createElement("option");

            option.value = space.id;
            option.textContent = `${space.space_number} (${space.status === "available" ? "I lirë" : "I zënë"})`;

            newReservationSpace.appendChild(option);
        });

        newReservationSpace.disabled = filteredSpaces.length === 0;

        if (filteredSpaces.length === 0 && selectedLotId) {
            newReservationSpace.innerHTML =
                '<option value="">Nuk ka vendparkime të disponueshme</option>';
        }
    });
}

// Mbyll modalin e rezervimit të ri.
function closeAddReservationModal() {
    addReservationModal.hidden = true;
    addReservationForm.reset();

    newReservationSpace.innerHTML =
        '<option value="">Së pari zgjidh parkingun</option>';

    newReservationSpace.disabled = true;

    addReservationError.hidden = true;
    addReservationError.textContent = "";
}

// Hap modalin dhe ngarkon të dhënat.
if (addReservationButton) {
    addReservationButton.addEventListener("click", async () => {
        addReservationForm.reset();

        addReservationError.hidden = true;
        addReservationError.textContent = "";

        try {
            await loadNewReservationData();

            addReservationModal.hidden = false;

        } catch (error) {
            await showAlertModal({
                title: "Gabim gjatë ngarkimit",
                message: error.message,
                type: "error",
                confirmText: "Në rregull"
            });
        }
    });
}

// Butonat për mbylljen e modalit.
if (closeAddReservationButton) {
    closeAddReservationButton.addEventListener(
        "click",
        closeAddReservationModal
    );
}

if (cancelAddReservationButton) {
    cancelAddReservationButton.addEventListener(
        "click",
        closeAddReservationModal
    );
}

// Ruaj rezervimin e ri.
if (addReservationForm) {
    addReservationForm.addEventListener("submit", async event => {
        event.preventDefault();

        addReservationError.hidden = true;
        addReservationError.textContent = "";

        const userId = newReservationUser.value;
        const spaceId = newReservationSpace.value;

        const startValue = document.getElementById(
            "new-reservation-start"
        ).value;

        const endValue = document.getElementById(
            "new-reservation-end"
        ).value;

        if (!userId || !newReservationLot.value || !spaceId) {
            addReservationError.textContent =
                "Plotësoni të gjitha fushat e detyrueshme.";

            addReservationError.hidden = false;
            return;
        }

        const startDate = new Date(startValue);
        const endDate = new Date(endValue);

        if (
            !startValue ||
            !endValue ||
            Number.isNaN(startDate.getTime()) ||
            Number.isNaN(endDate.getTime()) ||
            startDate <= new Date() ||
            endDate <= startDate
        ) {
            addReservationError.textContent =
                "Zgjidhni një kohë të ardhshme dhe sigurohuni që përfundimi të jetë pas fillimit.";

            addReservationError.hidden = false;
            return;
        }

        const reservationData = {
            user: Number(userId),
            parking_space: Number(spaceId),
            start_time: startDate.toISOString(),
            end_time: endDate.toISOString()
        };

        saveNewReservationButton.disabled = true;
        saveNewReservationButton.textContent = "Duke krijuar...";

        try {
            await sendSpaceRequest(
                "/reservations/",
                "POST",
                reservationData
            );

            closeAddReservationModal();

            await loadReservations();

            await showAlertModal({
                title: "Rezervimi u krijua",
                message: "Rezervimi u regjistrua me sukses dhe është në pritje të konfirmimit.",
                type: "success",
                confirmText: "Në rregull"
            });

        } catch (error) {
            addReservationError.textContent = error.message;
            addReservationError.hidden = false;

        } finally {
            saveNewReservationButton.disabled = false;
            saveNewReservationButton.textContent = "Krijo rezervimin";
        }
    });
}

    // Ngarko rezervimet vetëm në faqen administrative të rezervimeve.
    if (reservationsTable) {
        await loadReservations();
    }

    // ==========================================
    // MENAXHIMI I PERDORUESVE
    // ==========================================

    const usersTable = document.getElementById("users-table");
    const usersError = document.getElementById("users-error");
    const userSearch = document.getElementById("user-search");
    const userRoleFilter = document.getElementById("user-role-filter");
    const userStatusFilter = document.getElementById("user-status-filter");
    const resetUserFilters = document.getElementById("reset-user-filters");
    const userEditModal = document.getElementById("user-edit-modal");
    const closeUserEditModalButton = document.getElementById("close-user-edit-modal");
    const cancelUserEdit = document.getElementById("cancel-user-edit");
    const userEditForm = document.getElementById("user-edit-form");
    const editUserId = document.getElementById("edit-user-id");
    const editUserUsername = document.getElementById("edit-user-username");
    const editUserEmail = document.getElementById("edit-user-email");
    const editUserRole = document.getElementById("edit-user-role");
    const editUserStatus = document.getElementById("edit-user-status");
    const userEditError = document.getElementById("user-edit-error");
    const saveUserEditButton = document.getElementById("save-user-edit");
    const userDetailsModal = document.getElementById("user-details-modal");
    const closeUserDetailsModal = document.getElementById("close-user-details-modal");
    const detailUserId = document.getElementById("detail-user-id");
    const detailUserUsername = document.getElementById("detail-user-username");
    const detailUserEmail = document.getElementById("detail-user-email");
    const detailUserRole = document.getElementById("detail-user-role");
    const detailUserStatus = document.getElementById("detail-user-status");
    const detailUserDate = document.getElementById("detail-user-date");
    const detailUserReservations = document.getElementById("detail-user-reservations");
    const detailUserPayments = document.getElementById("detail-user-payments");
    const detailUserReservationsTable = document.getElementById("detail-user-reservations-table");
    const detailUserPaymentsTable = document.getElementById("detail-user-payments-table");

    // Hap modalin për ndryshimin e përdoruesit
    function openUserEditModal(user) {
        if (!userEditModal || !user) {
            console.error("Modalja ose përdoruesi nuk u gjet.");
            return;
        }

        editUserId.value = user.id;
        editUserUsername.value = user.username || "";
        editUserEmail.value = user.email || "";
        editUserRole.value = user.role || "user";
        editUserStatus.value = user.status || "active";

        userEditError.textContent = "";
        userEditError.hidden = true;

        userEditModal.hidden = false;

        console.log("Modalja e editimit u hap për përdoruesin:", user.id);
    }

    let allUsers = [];

    const userRoleLabels = {
        admin: "Administrator",
        user: "Përdorues"
    };

    const userStatusLabels = {
        active: "Aktiv",
        inactive: "Joaktiv"
    };

    // Formati i datës së regjistrimit.
    function formatUserDate(value) {
        if (!value) return "-";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "-";

        return date.toLocaleString("sq-AL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    async function openUserDetails(userId) {
        if (!userDetailsModal) return;

        const user = allUsers.find(
            item => String(item.id) === String(userId)
        );

        if (!user) {
            showAlertModal(
                "Gabim",
                "Përdoruesi nuk u gjet."
            );
            return;
        }

        // Shfaq modalin
        userDetailsModal.hidden = false;

        // Të dhënat bazë
        detailUserId.textContent = user.id;
        detailUserUsername.textContent = user.username || "-";
        detailUserEmail.textContent = user.email || "-";

        detailUserRole.textContent =
            userRoleLabels[user.role] || user.role;

        detailUserStatus.textContent =
            userStatusLabels[user.status] || user.status;

        detailUserDate.textContent =
            formatUserDate(user.date_joined);

        detailUserReservations.textContent =
            user.reservation_count ?? 0;

        detailUserPayments.textContent =
            user.payment_count ?? 0;

        // Mesazhet fillestare në tabela
        detailUserReservationsTable.innerHTML = `
            <tr>
                <td colspan="6">Duke u ngarkuar...</td>
            </tr>
        `;

        detailUserPaymentsTable.innerHTML = `
            <tr>
                <td colspan="6">Duke u ngarkuar...</td>
            </tr>
        `;

        try {
            // Merr rezervimet dhe pagesat
            const [reservationsData, paymentsData] =
                await Promise.all([
                    apiRequest("/reservations/"),
                    apiRequest("/payments/")
                ]);

            const reservations = getResults(reservationsData);
            const payments = getResults(paymentsData);

            // Filtron rezervimet e përdoruesit
            const userReservations = reservations.filter(
                reservation =>
                    String(reservation.user) === String(userId)
            );

            // ID-të e rezervimeve të përdoruesit
            const userReservationIds = userReservations.map(
                reservation => String(reservation.id)
            );

            // Filtron pagesat që i përkasin përdoruesit
            const userPayments = payments.filter(
                payment =>
                    userReservationIds.includes(
                        String(payment.reservation)
                    )
            );

            renderUserDetailReservations(userReservations);
            renderUserDetailPayments(userPayments);

        } catch (error) {
            console.error(
                "Gabim gjatë ngarkimit të detajeve:",
                error
            );

            detailUserReservationsTable.innerHTML = `
                <tr>
                    <td colspan="6">
                        Gabim gjatë ngarkimit të rezervimeve.
                    </td>
                </tr>
            `;

            detailUserPaymentsTable.innerHTML = `
                <tr>
                    <td colspan="6">
                        Gabim gjatë ngarkimit të pagesave.
                    </td>
                </tr>
            `;
        }
    }

    function renderUserDetailReservations(reservations) {
        if (!detailUserReservationsTable) return;

        detailUserReservationsTable.innerHTML = "";

        if (reservations.length === 0) {
            detailUserReservationsTable.innerHTML = `
                <tr>
                    <td colspan="6">
                        Ky përdorues nuk ka rezervime.
                    </td>
                </tr>
            `;
            return;
        }

        reservations.forEach(reservation => {
            const row = document.createElement("tr");

            const values = [
                reservation.id,
                reservation.parking_lot_name || "-",
                reservation.parking_space_number || "-",
                formatUserDate(reservation.start_time),
                formatUserDate(reservation.end_time),
                reservation.status || "-"
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            detailUserReservationsTable.appendChild(row);
        });
    }

    function renderUserDetailPayments(payments) {
        if (!detailUserPaymentsTable) return;

        detailUserPaymentsTable.innerHTML = "";

        if (payments.length === 0) {
            detailUserPaymentsTable.innerHTML = `
                <tr>
                    <td colspan="6">
                        Ky përdorues nuk ka pagesa.
                    </td>
                </tr>
            `;
            return;
        }

        payments.forEach(payment => {
            const row = document.createElement("tr");

            const values = [
                payment.id,
                payment.reservation,
                `${payment.amount} €`,
                payment.payment_method || "-",
                payment.payment_date
                    ? formatUserDate(payment.payment_date)
                    : "-",
                payment.status || "-"
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            detailUserPaymentsTable.appendChild(row);
        });
    }

    // Ngarko përdoruesit nga API.
    async function loadUsers() {
        if (!usersTable) return;

        try {
            const data = await apiRequest("/admin-users-management/");

            allUsers = getResults(data);

            if (usersError) {
                usersError.hidden = true;
                usersError.textContent = "";
            }

            renderUsers();

        } catch (error) {
            console.error(
                "Gabim gjatë ngarkimit të përdoruesve:",
                error
            );

            usersTable.innerHTML = `
                <tr>
                    <td colspan="9">
                        Gabim gjatë ngarkimit të përdoruesve.
                    </td>
                </tr>
            `;

            if (usersError) {
                usersError.textContent = error.message;
                usersError.hidden = false;
            }
        }
    }

    // Mbyll modalin për ndryshimin e përdoruesit
        function closeUserEditModal() {
        if (!userEditModal) {
            return;
        }

        userEditModal.hidden = true;

        if (userEditError) {
            userEditError.textContent = "";
            userEditError.hidden = true;
        }
    }

    // Mbyll modalin me butonin X
    if (closeUserEditModalButton) {
        closeUserEditModalButton.addEventListener("click", closeUserEditModal);
    }

    // Mbyll modalin me butonin Anulo
    if (cancelUserEdit) {
        cancelUserEdit.addEventListener("click", closeUserEditModal);
    }

    // Ruaj ndryshimet e përdoruesit.
        if (userEditForm) {
            userEditForm.addEventListener("submit", async event => {
                event.preventDefault();

                const userId = editUserId.value;

                const userData = {
                    username: editUserUsername.value.trim(),
                    email: editUserEmail.value.trim(),
                    role: editUserRole.value,
                    status: editUserStatus.value
                };

                // Kontrollo fushat e detyrueshme.
                if (!userData.username || !userData.email) {
                    userEditError.textContent =
                        "Username dhe email janë të detyrueshëm.";

                    userEditError.hidden = false;
                    return;
                }

                saveUserEditButton.disabled = true;
                saveUserEditButton.textContent = "Duke ruajtur...";

                userEditError.hidden = true;
                userEditError.textContent = "";

                try {
                    await sendSpaceRequest(
                        `/admin-users-management/${userId}/`,
                        "PATCH",
                        userData
                    );

                    // Mbyll modalin dhe rifresko tabelën.
                    closeUserEditModal();
                    await loadUsers();

                } catch (error) {
                    userEditError.textContent = error.message;
                    userEditError.hidden = false;

                } finally {
                    saveUserEditButton.disabled = false;
                    saveUserEditButton.textContent = "Ruaj ndryshimet";
                }
            });
        }

    // Shfaq përdoruesit në tabelë.
    function renderUsers() {
        if (!usersTable) return;

        const searchText = userSearch
            ? userSearch.value.trim().toLowerCase()
            : "";

        const selectedRole = userRoleFilter
            ? userRoleFilter.value
            : "";

        const selectedStatus = userStatusFilter
            ? userStatusFilter.value
            : "";

        const filteredUsers = allUsers.filter(user => {

            const matchesSearch = [
                user.id,
                user.username,
                user.email
            ].some(value =>
                String(value ?? "")
                    .toLowerCase()
                    .includes(searchText)
            );

            const matchesRole =
                !selectedRole || user.role === selectedRole;

            const matchesStatus =
                !selectedStatus || user.status === selectedStatus;

            return matchesSearch &&
                matchesRole &&
                matchesStatus;
        });

        if (filteredUsers.length === 0) {
            usersTable.innerHTML = `
                <tr>
                    <td colspan="9">
                        Nuk u gjet asnjë përdorues.
                    </td>
                </tr>
            `;
            return;
        }

        usersTable.innerHTML = "";

        filteredUsers.forEach(user => {

            const row = document.createElement("tr");

            // ID
            const idCell = document.createElement("td");
            idCell.textContent = user.id;
            row.appendChild(idCell);

            // Username
            const usernameCell = document.createElement("td");
            usernameCell.textContent = user.username || "-";
            row.appendChild(usernameCell);

            // Email
            const emailCell = document.createElement("td");
            emailCell.textContent = user.email || "-";
            row.appendChild(emailCell);

            // Roli
            const roleCell = document.createElement("td");
            const roleBadge = document.createElement("span");

            roleBadge.textContent =
                userRoleLabels[user.role] || user.role;

            roleBadge.className =
                user.role === "admin"
                    ? "reservation-status status-confirmed"
                    : "reservation-status status-pending";

            roleCell.appendChild(roleBadge);
            row.appendChild(roleCell);

            // Data e regjistrimit
            const dateCell = document.createElement("td");
            dateCell.textContent = formatUserDate(user.date_joined);
            row.appendChild(dateCell);

            // Rezervimet
            const reservationsCell = document.createElement("td");
            reservationsCell.textContent =
                user.reservation_count ?? 0;
            row.appendChild(reservationsCell);

            // Pagesat
            const paymentsCell = document.createElement("td");
            paymentsCell.textContent =
                user.payment_count ?? 0;
            row.appendChild(paymentsCell);

            // Statusi
            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");

            statusBadge.textContent =
                userStatusLabels[user.status] || user.status;

            statusBadge.className =
                user.status === "active"
                    ? "reservation-status status-confirmed"
                    : "reservation-status status-cancelled";

            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            // Veprimet
            const actionsCell = document.createElement("td");

            const detailsButton = document.createElement("button");
            detailsButton.type = "button";
            detailsButton.textContent = "Detajet";
            detailsButton.className = "admin-edit-button";

            detailsButton.addEventListener("click", () => {
                openUserDetails(user.id);
            });

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.textContent = "Ndrysho";
            editButton.className = "admin-edit-button";

            editButton.style.marginLeft = "6px";

            editButton.addEventListener("click", () => {
                openUserEditModal(user);
            });

            actionsCell.appendChild(detailsButton);
            actionsCell.appendChild(editButton);

            row.appendChild(actionsCell);

            usersTable.appendChild(row);
        });
    }

    // Kërkimi sipas emrit ose email-it.
    if (userSearch) {
        userSearch.addEventListener("input", renderUsers);
    }

    // Filtrimi sipas rolit.
    if (userRoleFilter) {
        userRoleFilter.addEventListener("change", renderUsers);
    }

    // Filtrimi sipas statusit.
    if (userStatusFilter) {
        userStatusFilter.addEventListener("change", renderUsers);
    }

    // Pastro filtrat.
    if (resetUserFilters) {
        resetUserFilters.addEventListener("click", () => {

            userSearch.value = "";
            userRoleFilter.value = "";
            userStatusFilter.value = "";

            renderUsers();
        });
    }

    // Mbyll modalin e detajeve
    if (closeUserDetailsModal) {
        closeUserDetailsModal.addEventListener("click", () => {
            userDetailsModal.hidden = true;
        });
    }

    // Ngarko përdoruesit vetëm në faqen e tyre.
    if (usersTable) {
        await loadUsers();
    }

    // ==========================================
    // SHTIMI I PERDORUESIT TE RI
    // ==========================================

    const addUserButton = document.getElementById("add-user-button");
    const userAddModal = document.getElementById("user-add-modal");
    const closeAddUserModal = document.getElementById("close-add-user-modal");
    const cancelAddUser = document.getElementById("cancel-add-user");

    const userAddForm = document.getElementById("user-add-form");
    const userAddError = document.getElementById("user-add-error");
    const saveNewUserButton = document.getElementById("save-new-user");

    // Hap modaljen.
    function openUserAddModal() {
        if (!userAddModal) return;

        userAddForm.reset();

        userAddError.hidden = true;
        userAddError.textContent = "";

        userAddModal.hidden = false;
    }

    // Mbyll modaljen.
    function closeUserAddModal() {
        if (!userAddModal) return;

        userAddModal.hidden = true;
        userAddForm.reset();

        userAddError.hidden = true;
        userAddError.textContent = "";
    }

    // Hap formularin.
    if (addUserButton) {
        addUserButton.addEventListener("click", openUserAddModal);
    }

    // Mbyll formularin.
    if (closeAddUserModal) {
        closeAddUserModal.addEventListener("click", closeUserAddModal);
    }

    if (cancelAddUser) {
        cancelAddUser.addEventListener("click", closeUserAddModal);
    }

    // Regjistrimi i përdoruesit.
    if (userAddForm) {
        userAddForm.addEventListener("submit", async event => {

            event.preventDefault();

            const username = document
                .getElementById("new-user-username")
                .value.trim();

            const email = document
                .getElementById("new-user-email")
                .value.trim();

            const password = document
                .getElementById("new-user-password")
                .value;

            const passwordConfirm = document
                .getElementById("new-user-password-confirm")
                .value;

            const role = document
                .getElementById("new-user-role")
                .value;

            const status = document
                .getElementById("new-user-status")
                .value;

            if (password !== passwordConfirm) {
                userAddError.textContent =
                    "Fjalëkalimet nuk përputhen.";

                userAddError.hidden = false;
                return;
            }

            saveNewUserButton.disabled = true;
            saveNewUserButton.textContent = "Duke krijuar...";

            userAddError.hidden = true;

            try {
                await sendSpaceRequest(
                    "/admin-users-management/",
                    "POST",
                    {
                        username: username,
                        email: email,
                        password: password,
                        password_confirm: passwordConfirm,
                        role: role,
                        status: status
                    }
                );

                closeUserAddModal();

                await loadUsers();

                await showAlertModal({
                    title: "Përdoruesi u krijua",
                    message: "Llogaria e re u regjistrua me sukses.",
                    type: "success",
                    confirmText: "Në rregull"
                });

            } catch (error) {
                userAddError.textContent =
                    typeof error.message === "string"
                        ? error.message
                        : "Ndodhi një gabim gjatë krijimit të përdoruesit.";

                userAddError.hidden = false;

            } finally {
                saveNewUserButton.disabled = false;
                saveNewUserButton.textContent = "Krijo përdoruesin";
            }
        });
    }

    // ==========================================
    // MENAXHIMI I PAGESAVE
    // ==========================================

    const paymentsTable = document.getElementById("payments-table");
    const paymentsError = document.getElementById("payments-error");

    const paymentSearch = document.getElementById("payment-search");
    const paymentStatusFilter = document.getElementById("payment-status-filter");
    const resetPaymentFilters = document.getElementById("reset-payment-filters");

    let allPayments = [];

    const paymentStatusLabels = {
        pending: "Në pritje",
        paid: "Paguar",
        cancelled: "Anuluar",
        failed: "Dështuar",
        refunded: "Rimbursuar"
    };

    const paymentMethodLabels = {
        cash: "Cash",
        card: "Kartelë"
    };

    // Formati i datës së pagesës.
    function formatPaymentDate(value) {
        if (!value) return "-";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "-";

        return date.toLocaleString("sq-AL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    // Ngarko pagesat nga API.
    async function loadPayments() {
        if (!paymentsTable) return;

        try {
            const data = await apiRequest("/payments/");
            allPayments = getResults(data);

            if (paymentsError) {
                paymentsError.hidden = true;
                paymentsError.textContent = "";
            }

            renderPayments();

        } catch (error) {
            console.error("Gabim gjatë ngarkimit të pagesave:", error);

            paymentsTable.innerHTML = `
                <tr>
                    <td colspan="9">Gabim gjatë ngarkimit të pagesave.</td>
                </tr>
            `;

            if (paymentsError) {
                paymentsError.textContent = error.message;
                paymentsError.hidden = false;
            }
        }
    }

    // Shfaq pagesat në tabelë.
    function renderPayments() {
        if (!paymentsTable) return;

        const searchText = paymentSearch
            ? paymentSearch.value.trim().toLowerCase()
            : "";

        const selectedStatus = paymentStatusFilter
            ? paymentStatusFilter.value
            : "";

        const filteredPayments = allPayments.filter(payment => {
            const matchesSearch = [
                payment.id,
                payment.reservation_id,
                payment.username,
                payment.parking_lot_name
            ].some(value =>
                String(value ?? "").toLowerCase().includes(searchText)
            );

            const matchesStatus = !selectedStatus ||
                payment.status === selectedStatus;

            return matchesSearch && matchesStatus;
        });

        if (filteredPayments.length === 0) {
            paymentsTable.innerHTML = `
                <tr>
                    <td colspan="9">Nuk u gjet asnjë pagesë.</td>
                </tr>
            `;
            return;
        }

        paymentsTable.innerHTML = "";

        filteredPayments.forEach(payment => {
            const row = document.createElement("tr");

            const values = [
                payment.id,
                payment.reservation_id ?? payment.reservation ?? "-",
                payment.username || "-",
                payment.parking_lot_name || "-",
                payment.amount != null ? `${payment.amount} €` : "-",
                paymentMethodLabels[payment.payment_method] ||
                    payment.payment_method || "-",
                formatPaymentDate(payment.payment_date)
            ];

            values.forEach(value => {
                const cell = document.createElement("td");
                cell.textContent = value;
                row.appendChild(cell);
            });

            // Statusi i pagesës.
            const statusCell = document.createElement("td");
            const statusBadge = document.createElement("span");

            statusBadge.textContent =
                paymentStatusLabels[payment.status] || payment.status;

            statusBadge.className =
                `reservation-status status-${payment.status}`;

            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            // Veprimet.
            const actionsCell = document.createElement("td");

            const allowedActions = {
                pending: [
                    { status: "paid", label: "Shëno si paguar", className: "admin-edit-button" },
                    { status: "failed", label: "Shëno si dështuar", className: "admin-delete-button" }
                ],
                paid: [
                    { status: "refunded", label: "Rimburso", className: "admin-delete-button" }
                ],
                failed: [],
                refunded: []
            };

            const actions = allowedActions[payment.status] || [];

            actions.forEach(action => {
                const button = document.createElement("button");

                button.type = "button";
                button.textContent = action.label;
                button.className = action.className;

                button.addEventListener("click", async () => {
                    const confirmed = await showConfirmModal({
                        title: "Ndrysho statusin e pagesës",
                        message: `A dëshironi ta ndryshoni statusin e pagesës #${payment.id} në "${paymentStatusLabels[action.status]}"?`,
                        type: action.status === "paid" ? "success" : "warning",
                        confirmText: "Po, vazhdo",
                        cancelText: "Anulo"
                    });

                    if (!confirmed) return;

                    button.disabled = true;
                    button.textContent = "Duke përditësuar...";

                    try {
                        await sendSpaceRequest(
                            `/payments/${payment.id}/`,
                            "PATCH",
                            { status: action.status }
                        );

                        await loadPayments();

                        await showAlertModal({
                            title: "Pagesa u përditësua",
                            message: `Statusi i pagesës #${payment.id} u ndryshua në "${paymentStatusLabels[action.status]}".`,
                            type: "success",
                            confirmText: "Në rregull"
                        });

                    } catch (error) {
                        button.disabled = false;
                        button.textContent = action.label;

                        await showAlertModal({
                            title: "Gabim",
                            message: error.message,
                            type: "error",
                            confirmText: "Në rregull"
                        });
                    }
                });

                actionsCell.appendChild(button);
            });

            if (actions.length === 0) {
                actionsCell.textContent = "-";
            }

            row.appendChild(actionsCell);
            paymentsTable.appendChild(row);
        });
    }

    // Kërkimi.
    if (paymentSearch) {
        paymentSearch.addEventListener("input", renderPayments);
    }

    // Filtrimi sipas statusit.
    if (paymentStatusFilter) {
        paymentStatusFilter.addEventListener("change", renderPayments);
    }

    // Pastro filtrat.
    if (resetPaymentFilters) {
        resetPaymentFilters.addEventListener("click", () => {
            paymentSearch.value = "";
            paymentStatusFilter.value = "";
            renderPayments();
        });
    }

    // ==========================================
    // SHTIMI I NJË PAGESE TË RE
    // ==========================================

    const addPaymentButton = document.getElementById("add-payment-button");
    const paymentAddModal = document.getElementById("payment-add-modal");
    const closeAddPaymentModal = document.getElementById("close-add-payment-modal");
    const cancelAddPayment = document.getElementById("cancel-add-payment");

    const paymentAddForm = document.getElementById("payment-add-form");
    const paymentUserSelect = document.getElementById("new-payment-user");
    const paymentReservationSelect = document.getElementById("new-payment-reservation");
    const paymentMethodSelect = document.getElementById("new-payment-method");
    const paymentAddError = document.getElementById("payment-add-error");
    const saveNewPaymentButton = document.getElementById("save-new-payment");

    let availableReservations = [];

    // Hap modaljen.
    function openPaymentModal() {
        if (!paymentAddModal) return;

        paymentAddForm.reset();
        paymentAddModal.hidden = false;

        paymentReservationSelect.innerHTML =
            '<option value="">Së pari zgjidh përdoruesin</option>';

        paymentReservationSelect.disabled = true;

        paymentAddError.hidden = true;
        paymentAddError.textContent = "";

        loadPaymentUsers();
    }

    // Mbyll modaljen.
    function closePaymentModal() {
        if (!paymentAddModal) return;
        paymentAddModal.hidden = true;
    }

    // Ngarko përdoruesit.
    async function loadPaymentUsers() {
        paymentUserSelect.innerHTML =
            '<option value="">Duke u ngarkuar...</option>';

        paymentUserSelect.disabled = true;

        try {
            const data = await apiRequest("/admin-users/");
            const users = getResults(data);

            paymentUserSelect.innerHTML =
                '<option value="">Zgjidh përdoruesin</option>';

            users.forEach(user => {
                const option = document.createElement("option");

                option.value = user.id;
                option.textContent = user.email
                    ? `${user.username} (${user.email})`
                    : user.username;

                paymentUserSelect.appendChild(option);
            });

            paymentUserSelect.disabled = false;

        } catch (error) {
            paymentUserSelect.innerHTML =
                '<option value="">Gabim gjatë ngarkimit</option>';

            paymentAddError.textContent = error.message;
            paymentAddError.hidden = false;
        }
    }

    // Kur zgjidhet përdoruesi, ngarko rezervimet e tij.
    async function loadUserReservations(userId) {
        paymentReservationSelect.innerHTML =
            '<option value="">Duke u ngarkuar...</option>';

        paymentReservationSelect.disabled = true;

        if (!userId) {
            paymentReservationSelect.innerHTML =
                '<option value="">Së pari zgjidh përdoruesin</option>';
            return;
        }

        try {
            const data = await apiRequest("/reservations/");
            const reservations = getResults(data);

            // Rezervimet që kanë tashmë pagesë aktive.
            const activePaymentReservationIds = allPayments
                .filter(payment =>
                    ["pending", "paid"].includes(payment.status)
                )
                .map(payment =>
                    Number(payment.reservation_id ?? payment.reservation)
                );

            availableReservations = reservations.filter(reservation => {
                const belongsToUser =
                    Number(reservation.user) === Number(userId);

                const isNotCancelled =
                    reservation.status !== "cancelled";

                const hasNoActivePayment =
                    !activePaymentReservationIds.includes(
                        Number(reservation.id)
                    );

                return belongsToUser &&
                    isNotCancelled &&
                    hasNoActivePayment;
            });

            paymentReservationSelect.innerHTML =
                '<option value="">Zgjidh rezervimin</option>';

            availableReservations.forEach(reservation => {
                const option = document.createElement("option");

                option.value = reservation.id;

                const date = reservation.start_time
                    ? formatPaymentDate(reservation.start_time)
                    : "Pa datë";

                option.textContent =
                    `#${reservation.id} - ${reservation.parking_lot_name || "Parking"} - ` +
                    `Vendi ${reservation.parking_space_number || reservation.parking_space} - ${date}`;

                paymentReservationSelect.appendChild(option);
            });

            if (availableReservations.length === 0) {
                paymentReservationSelect.innerHTML =
                    '<option value="">Nuk ka rezervime të disponueshme</option>';
            }

            paymentReservationSelect.disabled =
                availableReservations.length === 0;

        } catch (error) {
            paymentReservationSelect.innerHTML =
                '<option value="">Gabim gjatë ngarkimit</option>';

            paymentAddError.textContent = error.message;
            paymentAddError.hidden = false;
        }
    }

    // Hap modaljen.
    if (addPaymentButton) {
        addPaymentButton.addEventListener("click", openPaymentModal);
    }

    // Mbyll modaljen.
    if (closeAddPaymentModal) {
        closeAddPaymentModal.addEventListener("click", closePaymentModal);
    }

    if (cancelAddPayment) {
        cancelAddPayment.addEventListener("click", closePaymentModal);
    }

    // Ndryshimi i përdoruesit.
    if (paymentUserSelect) {
        paymentUserSelect.addEventListener("change", async () => {
            paymentAddError.hidden = true;

            await loadUserReservations(paymentUserSelect.value);
        });
    }

    // Regjistro pagesën.
    if (paymentAddForm) {
        paymentAddForm.addEventListener("submit", async event => {
            event.preventDefault();

            const reservationId = paymentReservationSelect.value;
            const paymentMethod = paymentMethodSelect.value;

            if (!reservationId || !paymentMethod) {
                paymentAddError.textContent =
                    "Ju lutem plotësoni të gjitha fushat.";

                paymentAddError.hidden = false;
                return;
            }

            saveNewPaymentButton.disabled = true;
            saveNewPaymentButton.textContent = "Duke regjistruar...";

            paymentAddError.hidden = true;

            try {
                await sendSpaceRequest(
                    "/payments/",
                    "POST",
                    {
                        reservation: Number(reservationId),
                        payment_method: paymentMethod
                    }
                );

                closePaymentModal();

                await loadPayments();

                await showAlertModal({
                    title: "Pagesa u regjistrua",
                    message: "Pagesa e re u krijua me sukses.",
                    type: "success",
                    confirmText: "Në rregull"
                });

            } catch (error) {
                paymentAddError.textContent = error.message;
                paymentAddError.hidden = false;

            } finally {
                saveNewPaymentButton.disabled = false;
                saveNewPaymentButton.textContent = "Krijo pagesën";
            }
        });
    }

    // Ngarko pagesat vetëm në faqen administrative të pagesave.
    if (paymentsTable) {
        await loadPayments();
    }

    // Dil nga llogaria.
    const logoutButton = document.getElementById("admin-logout");

    if (logoutButton) {
        logoutButton.addEventListener("click", () => {
            localStorage.removeItem("authToken");
            localStorage.removeItem("username");

            window.location.href = "/";
        });
    }
});
