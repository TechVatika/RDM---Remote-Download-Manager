import Swal from 'sweetalert2';

const lightMixin = Swal.mixin({
  customClass: {
    popup: 'rdm-swal-popup',
    confirmButton: 'rdm-swal-confirm',
    cancelButton: 'rdm-swal-cancel',
  },
  buttonsStyling: false,
  color: '#1e293b',
  background: '#ffffff',
});

export const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3200,
  timerProgressBar: true,
  background: '#ffffff',
  color: '#1e293b',
});

export function toastSuccess(title) {
  return toast.fire({ icon: 'success', title });
}

export function toastError(title) {
  return toast.fire({ icon: 'error', title });
}

export function toastInfo(title) {
  return toast.fire({ icon: 'info', title });
}

export async function confirmAction({
  title,
  text,
  confirmText = 'Yes',
  icon = 'question',
}) {
  const result = await lightMixin.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Cancel',
  });
  return result.isConfirmed;
}

export async function alertError(title, text) {
  return lightMixin.fire({ icon: 'error', title, text });
}

export async function alertSuccess(title, text) {
  return lightMixin.fire({ icon: 'success', title, text });
}

export async function promptCredentials({ title = 'Login required', text } = {}) {
  const result = await lightMixin.fire({
    title,
    iconHtml: '🔒',
    html: `
      <p class="swal-cred-text">${
        text || 'This download is protected. Enter the username and password for this link.'
      }</p>
      <input id="rdm-cred-user" class="swal2-input rdm-cred-input" placeholder="Username" autocomplete="off" />
      <input id="rdm-cred-pass" type="password" class="swal2-input rdm-cred-input" placeholder="Password" autocomplete="off" />
    `,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Sign in & retry',
    cancelButtonText: 'Cancel',
    didOpen: () => {
      document.getElementById('rdm-cred-user')?.focus();
    },
    preConfirm: () => {
      const username = document.getElementById('rdm-cred-user')?.value?.trim();
      const password = document.getElementById('rdm-cred-pass')?.value ?? '';
      if (!username) {
        Swal.showValidationMessage('Username is required');
        return false;
      }
      return { username, password };
    },
  });
  return result.isConfirmed ? result.value : null;
}

export function showHotkeys(rows) {
  const html = `<div class="hotkey-list">${rows
    .map(
      ([keys, desc]) =>
        `<div class="hotkey-row"><span class="hotkey-keys">${keys
          .map((k) => `<kbd>${k}</kbd>`)
          .join('')}</span><span class="hotkey-desc">${desc}</span></div>`,
    )
    .join('')}</div>`;
  return lightMixin.fire({
    title: 'Keyboard shortcuts',
    html,
    confirmButtonText: 'Got it',
    width: 420,
  });
}

export { Swal };
