
let activeAppModal = null;

function createAppModal({
    title,
    message,
    type = "info",
    confirmText = "Në rregull",
    cancelText = "Anulo",
    showCancel = false
}) {
    return new Promise((resolve) => {

        if (activeAppModal) {
            activeAppModal(false);
        }

        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;

        const icons = {
            success: "✓",
            error: "!",
            warning: "?",
            info: "i"
        };

        const overlay = document.createElement("div");
        overlay.className = "app-modal-overlay";

        const dialog = document.createElement("div");
        dialog.className = `app-modal-dialog app-modal-${type}`;
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "app-modal-title");
        dialog.setAttribute("aria-describedby", "app-modal-message");

        const icon = document.createElement("div");
        icon.className = "app-modal-icon";
        icon.textContent = icons[type] || icons.info;
        icon.setAttribute("aria-hidden", "true");

        const heading = document.createElement("h2");
        heading.className = "app-modal-title";
        heading.id = "app-modal-title";
        heading.textContent = title;

        const text = document.createElement("p");
        text.className = "app-modal-message";
        text.id = "app-modal-message";
        text.textContent = message;

        const actions = document.createElement("div");
        actions.className = "app-modal-actions";

        let cancelButton = null;

        if (showCancel) {
            cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.className =
                "app-modal-button app-modal-button-secondary";
            cancelButton.textContent = cancelText;
            actions.appendChild(cancelButton);
        }

        const confirmButton = document.createElement("button");
        confirmButton.type = "button";
        confirmButton.className =
            `app-modal-button ${
                type === "error"
                    ? "app-modal-button-danger"
                    : "app-modal-button-primary"
            }`;

        confirmButton.textContent = confirmText;

        actions.appendChild(confirmButton);

        dialog.append(icon, heading, text, actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        document.body.style.overflow = "hidden";

        let isClosed = false;

        function closeModal(result) {
            if (isClosed) return;

            isClosed = true;
            document.removeEventListener("keydown", handleKeydown);
            overlay.remove();

            document.body.style.overflow = previousOverflow;
            activeAppModal = null;

            if (
                previousFocus &&
                previousFocus.isConnected &&
                typeof previousFocus.focus === "function"
            ) {
                previousFocus.focus();
            }

            resolve(result);
        }

        activeAppModal = closeModal;

        function handleKeydown(event) {
            if (event.key === "Escape") {
                event.preventDefault();
                closeModal(false);
                return;
            }

            if (event.key === "Tab") {
                const focusable = dialog.querySelectorAll("button");

                if (!focusable.length) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (
                    !event.shiftKey &&
                    document.activeElement === last
                ) {
                    event.preventDefault();
                    first.focus();
                }
            }
        }

        confirmButton.addEventListener("click", () => closeModal(true));

        if (cancelButton) {
            cancelButton.addEventListener("click", () => closeModal(false));
        }

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) closeModal(false);
        });

        document.addEventListener("keydown", handleKeydown);

        confirmButton.focus();
    });
}

function showConfirmModal({
    title = "Konfirmim",
    message = "A dëshironi të vazhdoni?",
    type = "warning",
    confirmText = "Po, vazhdo",
    cancelText = "Anulo"
} = {}) {
    return createAppModal({
        title,
        message,
        type,
        confirmText,
        cancelText,
        showCancel: true
    });
}

function showAlertModal({
    title = "Njoftim",
    message = "",
    type = "info",
    confirmText = "Në rregull"
} = {}) {
    return createAppModal({
        title,
        message,
        type,
        confirmText,
        showCancel: false
    });
}
